import { Buffer } from 'node:buffer'
export { AuthState } from './auth.mjs'

const required = ['WEB_ORIGIN', 'GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_TOKEN', 'ADMIN_PASSWORD']

function configuration(env) {
  const missing = required.filter((name) => typeof env[name] !== 'string' || !env[name])
  if (!env.AUTH_STATE) missing.push('AUTH_STATE')
  if (missing.length) throw Object.assign(new Error(`Missing bindings: ${missing.join(', ')}`), { status: 500 })
  if (env.ADMIN_PASSWORD.length < 16) {
    throw Object.assign(new Error('ADMIN_PASSWORD must have at least 16 characters'), { status: 500 })
  }
  let webOrigin
  try {
    const url = new URL(env.WEB_ORIGIN)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol')
    webOrigin = url.origin
  } catch {
    throw Object.assign(new Error('WEB_ORIGIN must be an HTTP or HTTPS URL'), { status: 500 })
  }
  return {
    webOrigin,
    branch: env.GITHUB_BRANCH || 'main',
    githubUrl: `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${(env.GITHUB_FILE_PATH || 'public/films.json').split('/').map(encodeURIComponent).join('/')}`,
  }
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
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
  for await (const chunk of request.body || []) {
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

async function githubRequest(env, config, method, body) {
  return fetch(method === 'GET' ? `${config.githubUrl}?ref=${encodeURIComponent(config.branch)}` : config.githubUrl, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'scenes-film-journal',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  })
}

async function readFilms(env, config) {
  const response = await githubRequest(env, config, 'GET')
  if (!response.ok) throw new Error(`GitHub read failed: ${response.status}`)
  const file = await response.json()
  if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new Error('GitHub returned an unsupported file')
  }
  const films = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))
  if (!Array.isArray(films) || !films.every(validFilm)) throw new Error('Film data is invalid')
  return { films, sha: file.sha }
}

function getToken(request) {
  return /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '')?.[1] || null
}

async function authRequest(env, path, body) {
  const stub = env.AUTH_STATE.get(env.AUTH_STATE.idFromName('owner-auth'))
  return stub.fetch(`https://auth.internal${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export default {
  async fetch(request, env) {
    let headers = {}
    try {
      const config = configuration(env)
      const origin = request.headers.get('Origin')
      if (origin && origin !== config.webOrigin) return json(403, { error: 'Origin not allowed' })
      if (origin === config.webOrigin) {
        headers = {
          'Access-Control-Allow-Origin': config.webOrigin,
          Vary: 'Origin',
          'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })

      const path = new URL(request.url).pathname
      if (request.method === 'GET' && path === '/api/films') {
        return json(200, await readFilms(env, config), headers)
      }
      if (request.method === 'POST' && path === '/api/login') {
        const body = await readBody(request)
        const result = await authRequest(env, '/login', {
          password: body?.password,
          address: request.headers.get('CF-Connecting-IP') || 'local',
        })
        return json(result.status, await result.json(), headers)
      }
      if (request.method === 'GET' && path === '/api/session') {
        const result = await authRequest(env, '/verify', { token: getToken(request) })
        return json(result.status, await result.json(), headers)
      }
      if (request.method === 'DELETE' && path === '/api/session') {
        const result = await authRequest(env, '/logout', { token: getToken(request) })
        return json(result.status, await result.json(), headers)
      }
      if (request.method === 'PUT' && path === '/api/films') {
        const session = await authRequest(env, '/verify', { token: getToken(request) })
        if (!(await session.json()).isOwner) return json(401, { error: 'Bạn cần đăng nhập để sửa phim.' }, headers)
        const body = await readBody(request)
        if (!body || !Array.isArray(body.films) || body.films.length > 2000
          || !body.films.every(validFilm)
          || new Set(body.films.map((film) => film.id)).size !== body.films.length
          || (body.sha !== null && typeof body.sha !== 'string')) {
          return json(400, { error: 'Dữ liệu phim không hợp lệ.' }, headers)
        }
        const current = await readFilms(env, config)
        if (current.sha !== body.sha) return json(409, { error: 'Dữ liệu đã thay đổi. Hãy tải lại trang.' }, headers)
        const result = await githubRequest(env, config, 'PUT', {
          message: 'Update film journal',
          branch: config.branch,
          content: Buffer.from(`${JSON.stringify(body.films, null, 2)}\n`).toString('base64'),
          ...(current.sha ? { sha: current.sha } : {}),
        })
        if (result.status === 409 || result.status === 422) return json(409, { error: 'Dữ liệu đã thay đổi. Hãy tải lại trang.' }, headers)
        if (!result.ok) throw new Error(`GitHub write failed: ${result.status}`)
        const saved = await result.json()
        return json(200, { films: body.films, sha: saved.content.sha }, headers)
      }
      return json(404, { error: 'Không tìm thấy API.' }, headers)
    } catch (error) {
      if (error?.status === 400) return json(400, { error: 'JSON không hợp lệ.' }, headers)
      if (error?.status === 413) return json(413, { error: 'Dữ liệu quá lớn.' }, headers)
      console.error(error)
      if (error?.status === 500) return json(500, { error: 'API chưa được cấu hình đúng.' }, headers)
      return json(502, { error: 'Không thể kết nối dữ liệu. Hãy thử lại.' }, headers)
    }
  },
}
