import { createServer } from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const required = ['WEB_ORIGIN', 'GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_TOKEN', 'ADMIN_PASSWORD']
const missing = required.filter((name) => !process.env[name])
if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`)
if (process.env.ADMIN_PASSWORD.length < 16) throw new Error('ADMIN_PASSWORD must have at least 16 characters')

const webOrigin = new URL(process.env.WEB_ORIGIN).origin
const owner = process.env.GITHUB_OWNER
const repo = process.env.GITHUB_REPO
const branch = process.env.GITHUB_BRANCH || 'main'
const filePath = process.env.GITHUB_FILE_PATH || 'public/films.json'
const port = Number(process.env.PORT || 3001)
const sessions = new Map()
const loginAttempts = new Map()
const sessionDuration = 12 * 60 * 60 * 1000
const githubUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

function validDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return false
  const date = new Date(0)
  date.setFullYear(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
  return date.getFullYear() === Number(match[3])
    && date.getMonth() === Number(match[2]) - 1
    && date.getDate() === Number(match[1])
}

function validFilm(film) {
  return film !== null && typeof film === 'object' && !Array.isArray(film)
    && Number.isSafeInteger(film.id) && film.id > 0
    && typeof film.title === 'string' && film.title.trim().length > 0 && film.title.length <= 300
    && typeof film.director === 'string' && film.director.length <= 300
    && Number.isInteger(film.year) && film.year >= 1888 && film.year <= 2100
    && typeof film.watchedOn === 'string' && (film.watchedOn === '' || validDate(film.watchedOn))
    && (film.plannedMonth === undefined || film.plannedMonth === '' || (typeof film.plannedMonth === 'string' && /^(0[1-9]|1[0-2])\/\d{4}$/.test(film.plannedMonth)))
    && typeof film.rating === 'number' && Number.isFinite(film.rating) && film.rating >= 0 && film.rating <= 5
    && ['watched', 'planned', 'missed'].includes(film.status)
    && typeof film.note === 'string' && film.note.length <= 10000
    && typeof film.poster === 'string' && film.poster.length <= 2000
}

async function readBody(request) {
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 1_000_000) throw Object.assign(new Error('Request too large'), { status: 413 })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 })
  }
}

async function githubRequest(method, body) {
  return fetch(method === 'GET' ? `${githubUrl}?ref=${encodeURIComponent(branch)}` : githubUrl, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'scenes-film-journal',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  })
}

async function readFilms() {
  const response = await githubRequest('GET')
  if (response.status === 404) return { films: [], sha: null }
  if (!response.ok) throw new Error(`GitHub read failed: ${response.status}`)
  const file = await response.json()
  if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new Error('GitHub returned an unsupported file')
  }
  const films = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))
  if (!Array.isArray(films) || !films.every(validFilm)) throw new Error('Film data is invalid')
  return { films, sha: file.sha }
}

function ownerSession(request) {
  const token = /^Bearer (.+)$/.exec(request.headers.authorization || '')?.[1]
  const expiresAt = token && sessions.get(token)
  if (!expiresAt) return null
  if (expiresAt <= Date.now()) {
    sessions.delete(token)
    return null
  }
  return token
}

function passwordMatches(value) {
  if (typeof value !== 'string') return false
  const actual = createHash('sha256').update(value).digest()
  const expected = createHash('sha256').update(process.env.ADMIN_PASSWORD).digest()
  return timingSafeEqual(actual, expected)
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin
  if (origin && origin !== webOrigin) return json(response, 403, { error: 'Origin not allowed' })
  if (origin === webOrigin) {
    response.setHeader('Access-Control-Allow-Origin', webOrigin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
  if (request.method === 'OPTIONS') return response.writeHead(204).end()

  const path = new URL(request.url, 'http://localhost').pathname
  try {
    if (request.method === 'GET' && path === '/api/films') return json(response, 200, await readFilms())
    if (request.method === 'GET' && path === '/api/session') return json(response, 200, { isOwner: Boolean(ownerSession(request)) })
    if (request.method === 'POST' && path === '/api/login') {
      const forwardedHeader = request.headers['x-forwarded-for']
      const forwarded = request.socket.remoteAddress === '127.0.0.1' && typeof forwardedHeader === 'string'
        ? forwardedHeader.split(',')[0].trim()
        : null
      const address = forwarded || request.socket.remoteAddress || 'unknown'
      const attempt = loginAttempts.get(address) || { count: 0, until: 0 }
      if (attempt.until > Date.now()) return json(response, 429, { error: 'Thử đăng nhập lại sau 15 phút.' })
      const body = await readBody(request)
      if (!body || typeof body !== 'object' || !passwordMatches(body.password)) {
        attempt.count += 1
        if (attempt.count >= 5) { attempt.count = 0; attempt.until = Date.now() + 15 * 60 * 1000 }
        loginAttempts.set(address, attempt)
        return json(response, 401, { error: 'Mật khẩu không đúng.' })
      }
      loginAttempts.delete(address)
      const token = randomBytes(32).toString('base64url')
      sessions.set(token, Date.now() + sessionDuration)
      return json(response, 200, { token })
    }
    if (request.method === 'DELETE' && path === '/api/session') {
      const token = ownerSession(request)
      if (token) sessions.delete(token)
      return json(response, 200, { ok: true })
    }
    if (request.method === 'PUT' && path === '/api/films') {
      if (!ownerSession(request)) return json(response, 401, { error: 'Bạn cần đăng nhập để sửa phim.' })
      const body = await readBody(request)
      if (!body || !Array.isArray(body.films) || body.films.length > 2000
        || !body.films.every(validFilm)
        || new Set(body.films.map((film) => film.id)).size !== body.films.length
        || (body.sha !== null && typeof body.sha !== 'string')) {
        return json(response, 400, { error: 'Dữ liệu phim không hợp lệ.' })
      }
      const current = await readFilms()
      if (current.sha !== body.sha) return json(response, 409, { error: 'Dữ liệu đã thay đổi. Hãy tải lại trang.' })
      const result = await githubRequest('PUT', {
        message: 'Update film journal',
        branch,
        content: Buffer.from(`${JSON.stringify(body.films, null, 2)}\n`).toString('base64'),
        ...(current.sha ? { sha: current.sha } : {}),
      })
      if (result.status === 409 || result.status === 422) return json(response, 409, { error: 'Dữ liệu đã thay đổi. Hãy tải lại trang.' })
      if (!result.ok) throw new Error(`GitHub write failed: ${result.status}`)
      const saved = await result.json()
      return json(response, 200, { films: body.films, sha: saved.content.sha })
    }
    return json(response, 404, { error: 'Không tìm thấy API.' })
  } catch (error) {
    if (error?.status === 400) return json(response, 400, { error: 'JSON không hợp lệ.' })
    if (error?.status === 413) return json(response, 413, { error: 'Dữ liệu quá lớn.' })
    console.error(error)
    return json(response, 502, { error: 'Không thể kết nối dữ liệu. Hãy thử lại.' })
  }
})

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, '127.0.0.1', () => console.log(`API listening on http://127.0.0.1:${port}`))
}

export { server }
