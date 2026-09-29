import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/filmUtils.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText
const {
  dateSortKey,
  formatDate,
  formatLocalDate,
  formatLocalMonth,
  formatMonth,
  groupFilmsByMonth,
  groupFilmsByStatus,
  loadFilms,
  monthSortKey,
  parseDisplayDate,
} = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)

const film = {
  id: 1,
  title: 'Past Lives',
  director: 'Celine Song',
  year: 2023,
  watchedOn: '21/09/2026',
  rating: 4.5,
  status: 'watched',
  note: '',
  poster: 'https://example.com/poster.jpg',
}

test('missing or empty storage starts with no films', () => {
  const storage = { getItem: () => null }
  assert.deepEqual(loadFilms(storage), [])

  storage.getItem = () => JSON.stringify([])
  assert.deepEqual(loadFilms(storage), [])
})

test('saved films load only when the stored collection is valid', () => {
  const storage = { getItem: () => JSON.stringify([film]) }

  assert.deepEqual(loadFilms(storage), [film])

  for (const value of ['not JSON', '{}', JSON.stringify([{ ...film, status: 'unknown' }]),
    JSON.stringify([{ ...film, id: 0 }]),
    JSON.stringify([{ ...film, title: '  ' }]),
    JSON.stringify([{ ...film, watchedOn: '31/04/2026' }]),
    JSON.stringify([{ ...film, plannedMonth: '13/2026' }]),
    JSON.stringify([{ ...film, plannedMonth: '2026-13' }])]) {
    storage.getItem = () => value
    assert.deepEqual(loadFilms(storage), [])
  }
})

test('legacy ISO dates migrate to the display format when films load', () => {
  const legacyFilms = [
    { ...film, watchedOn: '2026-09-21' },
    { ...film, id: 2, status: 'planned', watchedOn: '', plannedMonth: '2027-01' },
  ]
  const storage = { getItem: () => JSON.stringify(legacyFilms) }

  assert.deepEqual(loadFilms(storage), [
    film,
    { ...film, id: 2, status: 'planned', watchedOn: '', plannedMonth: '01/2027' },
  ])
})

test('storage failures return no legacy films', () => {
  assert.deepEqual(loadFilms({ getItem: () => { throw new Error('blocked') } }), [])
})

test('dates use the local calendar and reject impossible days', () => {
  assert.equal(formatLocalDate(new Date(2026, 8, 27, 0, 30)), '27/09/2026')
  assert.equal(formatLocalMonth(new Date(2026, 8, 27, 0, 30)), '09/2026')
  assert.equal(parseDisplayDate('29/02/2024'), '29/02/2024')
  assert.equal(parseDisplayDate('29/02/2025'), null)
  assert.equal(parseDisplayDate('31/04/2026'), null)
  assert.equal(formatDate('21/09/2026'), '21/09/2026')
  assert.equal(formatMonth('09/2026'), '09/2026')
  assert.equal(formatMonth('2026-13'), 'Chưa xếp tháng')
  assert.ok(dateSortKey('02/01/2027') > dateSortKey('31/12/2026'))
  assert.ok(monthSortKey('01/2027') > monthSortKey('12/2026'))
})

test('film collections are grouped and sorted without changing the source', () => {
  const films = [
    { ...film, id: 1, watchedOn: '31/12/2026' },
    { ...film, id: 2, watchedOn: '02/01/2027' },
    { ...film, id: 3, status: 'planned', watchedOn: '', plannedMonth: '12/2026' },
    { ...film, id: 4, status: 'planned', watchedOn: '', plannedMonth: '' },
    { ...film, id: 5, status: 'missed', watchedOn: '', plannedMonth: '01/2027' },
  ]

  const grouped = groupFilmsByStatus(films)
  assert.deepEqual(grouped.watched.map(({ id }) => id), [2, 1])
  assert.deepEqual(grouped.planned.map(({ id }) => id), [3, 4])
  assert.deepEqual(grouped.missed.map(({ id }) => id), [5])
  assert.deepEqual(films.map(({ id }) => id), [1, 2, 3, 4, 5])

  assert.deepEqual(groupFilmsByMonth(grouped.watched, 'watched').map(({ month }) => month), ['01/2027', '12/2026'])
  assert.deepEqual(groupFilmsByMonth(grouped.planned, 'planned').map(({ month }) => month), ['12/2026', ''])
  assert.deepEqual(groupFilmsByMonth(grouped.missed, 'missed').map(({ month }) => month), ['01/2027'])
})

