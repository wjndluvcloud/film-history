export type FilmStatus = 'watched' | 'planned' | 'missed'
export type FilmView = 'overview' | FilmStatus

export type FilmEntry = {
  id: number
  title: string
  director: string
  year: number
  watchedOn: string
  plannedMonth?: string
  rating: number
  status: FilmStatus
  note: string
  poster: string
}

export const FILMS_STORAGE_KEY = 'frame-notes-films'

function isValidCalendarDate(year: string, month: string, day: string): boolean {
  const date = new Date(0)
  date.setFullYear(Number(year), Number(month) - 1, Number(day))
  return date.getFullYear() === Number(year)
    && date.getMonth() === Number(month) - 1
    && date.getDate() === Number(day)
}

function isDisplayDate(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  return match !== null && isValidCalendarDate(match[3], match[2], match[1])
}

function isDisplayMonth(value: string): boolean {
  return /^(0[1-9]|1[0-2])\/\d{4}$/.test(value)
}

function migrateLegacyDate(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match && isValidCalendarDate(match[1], match[2], match[3])
    ? `${match[3]}/${match[2]}/${match[1]}`
    : value
}

function migrateLegacyMonth(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value)
  return match ? `${match[2]}/${match[1]}` : value
}

function isFilmEntry(value: unknown): value is FilmEntry {
  if (typeof value !== 'object' || value === null) return false

  const film = value as Record<string, unknown>
  return Number.isSafeInteger(film.id)
    && (film.id as number) > 0
    && typeof film.title === 'string'
    && film.title.trim().length > 0
    && typeof film.director === 'string'
    && Number.isInteger(film.year)
    && (film.year as number) >= 1888
    && (film.year as number) <= 2100
    && typeof film.watchedOn === 'string'
    && (film.watchedOn === '' || isDisplayDate(film.watchedOn))
    && (film.plannedMonth === undefined || film.plannedMonth === ''
      || (typeof film.plannedMonth === 'string' && isDisplayMonth(film.plannedMonth)))
    && typeof film.rating === 'number'
    && Number.isFinite(film.rating)
    && film.rating >= 0
    && film.rating <= 5
    && (film.status === 'watched' || film.status === 'planned' || film.status === 'missed')
    && typeof film.note === 'string'
    && typeof film.poster === 'string'
}

export function loadFilms(storage?: Pick<Storage, 'getItem'>): FilmEntry[] {
  try {
    const saved = (storage ?? localStorage).getItem(FILMS_STORAGE_KEY)
    if (saved === null) return []

    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed)) return []
    const normalized = parsed.map((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return entry
      const film = entry as Record<string, unknown>
      return {
        ...film,
        watchedOn: migrateLegacyDate(film.watchedOn),
        ...(typeof film.plannedMonth === 'string'
          ? { plannedMonth: migrateLegacyMonth(film.plannedMonth) }
          : {}),
      }
    })
    return normalized.every(isFilmEntry) ? normalized : []
  } catch {
    return []
  }
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${day}/${month}/${year}`
}

export function formatLocalMonth(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${month}/${year}`
}

export function formatDate(date: string): string {
  return date || 'Chưa lên lịch'
}

export function formatMonth(month: string): string {
  return isDisplayMonth(month) ? month : 'Chưa xếp tháng'
}

export function parseDisplayDate(value: string): string | null {
  return isDisplayDate(value) ? value : null
}

export function dateSortKey(date: string): string {
  if (!isDisplayDate(date)) return ''
  const [day, month, year] = date.split('/')
  return `${year}${month}${day}`
}

export function monthSortKey(month: string): string {
  if (!isDisplayMonth(month)) return ''
  const [monthNumber, year] = month.split('/')
  return `${year}${monthNumber}`
}

export function groupFilmsByStatus(films: FilmEntry[]): Record<FilmStatus, FilmEntry[]> {
  const grouped: Record<FilmStatus, FilmEntry[]> = { watched: [], planned: [], missed: [] }
  for (const film of films) grouped[film.status].push(film)
  grouped.watched.sort((first, second) =>
    dateSortKey(second.watchedOn).localeCompare(dateSortKey(first.watchedOn)),
  )
  return grouped
}

export type MonthGroup = { month: string; films: FilmEntry[] }

export function groupFilmsByMonth(films: FilmEntry[], view: FilmStatus): MonthGroup[] {
  const groups = new Map<string, FilmEntry[]>()
  for (const film of films) {
    const month = view === 'watched' ? film.watchedOn.slice(3) : film.plannedMonth || ''
    const group = groups.get(month)
    if (group) group.push(film)
    else groups.set(month, [film])
  }

  return Array.from(groups, ([month, groupedFilms]) => ({ month, films: groupedFilms }))
    .sort((first, second) => monthSortKey(second.month).localeCompare(monthSortKey(first.month)))
}
