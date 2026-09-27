import type { FilmEntry } from './filmUtils'

export type FilmSnapshot = { films: FilmEntry[]; sha: string | null }

const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
const tokenKey = 'scenes-owner-session'

export function getSessionToken(): string | null {
  return sessionStorage.getItem(tokenKey)
}

export function clearSessionToken(): void {
  sessionStorage.removeItem(tokenKey)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBase) throw new Error('Chưa cấu hình VITE_API_URL.')
  const token = getSessionToken()
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const result: unknown = await response.json()
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
      ? result.error
      : 'Yêu cầu không thành công.'
    throw new Error(message)
  }
  return result as T
}

export function fetchFilms(): Promise<FilmSnapshot> {
  return request<FilmSnapshot>('/api/films')
}

export async function verifySession(): Promise<boolean> {
  if (!getSessionToken()) return false
  const result = await request<{ isOwner: boolean }>('/api/session')
  if (!result.isOwner) clearSessionToken()
  return result.isOwner
}

export async function login(password: string): Promise<void> {
  const result = await request<{ token: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
  sessionStorage.setItem(tokenKey, result.token)
}

export async function logout(): Promise<void> {
  try {
    await request('/api/session', { method: 'DELETE' })
  } finally {
    clearSessionToken()
  }
}

export function saveRemoteFilms(snapshot: FilmSnapshot): Promise<FilmSnapshot> {
  return request<FilmSnapshot>('/api/films', {
    method: 'PUT',
    body: JSON.stringify(snapshot),
  })
}
