import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { convertV4MiniflareOptions, Log, LogLevel, Miniflare, Response } from 'miniflare'

const config = JSON.parse(readFileSync(new URL('../server/wrangler.jsonc', import.meta.url), 'utf8'))
const bindings = {
  ...config.vars,
  GITHUB_OWNER: 'example',
  GITHUB_REPO: 'films',
  GITHUB_TOKEN: 'test-token',
  ADMIN_PASSWORD: 'a-long-test-password',
}
const webOrigin = new URL(bindings.WEB_ORIGIN).origin
let storedFilms = []
let sha = 'sha-1'
let missingGitHubFile = false
let writeStatus = 200
let githubCalls = 0

async function github(request) {
  githubCalls += 1
  assert.match(request.url, /^https:\/\/api\.github\.com\/repos\/example\/films\/contents\/public\/films\.json/)
  assert.equal(request.headers.get('Authorization'), 'Bearer test-token')
  if (missingGitHubFile) return Response.json({ message: 'Not Found' }, { status: 404 })
  if (request.method === 'PUT') {
    if (writeStatus !== 200) return Response.json({ message: 'Conflict' }, { status: writeStatus })
    const body = await request.json()
    assert.equal(body.sha, sha)
    assert.equal(body.branch, 'main')
    assert.equal(body.message, 'Update film journal')
    storedFilms = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'))
    sha = 'sha-2'
    return Response.json({ content: { sha } })
  }
  return Response.json({
    type: 'file',
    encoding: 'base64',
    content: Buffer.from(JSON.stringify(storedFilms)).toString('base64'),
    sha,
  })
}

function options(extraBindings = {}) {
  return convertV4MiniflareOptions({
    name: config.name,
    modules: ['index.mjs', 'auth.mjs'].map((name) => ({
      type: 'ESModule', path: fileURLToPath(new URL(`../server/${name}`, import.meta.url)),
    })),
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags,
    bindings: { ...bindings, ...extraBindings },
    durableObjects: { AUTH_STATE: { className: 'AuthState', useSQLite: true } },
    outboundService: github,
    unsafeInspectDurableObjects: true,
    cf: false,
    log: new Log(LogLevel.NONE),
  })
}

const worker = new Miniflare(options())
after(() => worker.dispose())
await worker.ready

function api(path, options) {
  return worker.dispatchFetch(`https://scenes.test${path}`, options)
}

async function login(address = '203.0.113.1', password = bindings.ADMIN_PASSWORD) {
  return api('/api/login', {
    method: 'POST', headers: { 'CF-Connecting-IP': address },
    body: JSON.stringify({ password }),
  })
}

test('visitors can read but cannot write; owner can save with current SHA', async () => {
  const initial = await api('/api/films')
  assert.equal(initial.status, 200)
  assert.deepEqual(await initial.json(), { films: [], sha: 'sha-1' })

  const film = {
    id: 1, title: 'Past Lives', director: 'Celine Song', year: 2023,
    watchedOn: '27/09/2026', plannedMonth: '', rating: 4.5,
    status: 'watched', note: '', poster: 'https://example.com/poster.jpg',
  }
  const payload = JSON.stringify({ films: [film], sha: 'sha-1' })
  const denied = await api('/api/films', { method: 'PUT', body: payload })
  assert.equal(denied.status, 401)

  const failedLogin = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })
  assert.equal(failedLogin.status, 401)
  const successfulLogin = await login()
  assert.equal(successfulLogin.status, 200)
  const { token } = await successfulLogin.json()
  const headers = { Authorization: `Bearer ${token}` }

  const saved = await api('/api/films', { method: 'PUT', body: payload, headers })
  assert.equal(saved.status, 200)
  assert.deepEqual(await saved.json(), { films: [film], sha: 'sha-2' })
  const stale = await api('/api/films', { method: 'PUT', body: payload, headers })
  assert.equal(stale.status, 409)

  const invalid = await api('/api/films', {
    method: 'PUT', headers,
    body: JSON.stringify({ films: [{ ...film, watchedOn: '31/02/2026' }], sha: 'sha-2' }),
  })
  assert.equal(invalid.status, 400)

  const logout = await api('/api/session', { method: 'DELETE', headers })
  assert.equal(logout.status, 200)
  const afterLogout = await api('/api/films', { method: 'PUT', body: payload, headers })
  assert.equal(afterLogout.status, 401)
})

test('API rejects requests from another browser origin', async () => {
  const response = await api('/api/films', { headers: { Origin: 'https://other.example' } })
  assert.equal(response.status, 403)
})

test('a missing GitHub file is reported as an error, not an empty collection', async () => {
  missingGitHubFile = true
  try {
    const response = await api('/api/films')
    assert.equal(response.status, 502)
  } finally {
    missingGitHubFile = false
  }
})

test('CORS preflight and API errors retain the allowed origin', async () => {
  const headers = { Origin: webOrigin }
  const preflight = await api('/api/films', { method: 'OPTIONS', headers })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), webOrigin)
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/)
  const unauthorized = await api('/api/films', { method: 'PUT', headers })
  assert.equal(unauthorized.status, 401)
  assert.equal(unauthorized.headers.get('Access-Control-Allow-Origin'), webOrigin)
  assert.equal(unauthorized.headers.get('Cache-Control'), 'no-store')
})

test('invalid JSON and oversized bodies are rejected before calling GitHub', async () => {
  const callsBefore = githubCalls
  const invalid = await api('/api/login', { method: 'POST', body: 'not JSON' })
  assert.equal(invalid.status, 400)
  const tooLarge = await api('/api/login', { method: 'POST', body: 'x'.repeat(1_000_001) })
  assert.equal(tooLarge.status, 413)
  assert.equal(githubCalls, callsBefore)
})

test('concurrent failed logins are counted per Cloudflare IP and forwarded headers cannot bypass the block', async () => {
  const address = '203.0.113.20'
  const attempts = await Promise.all(Array.from({ length: 5 }, () => login(address, 'wrong')))
  assert.deepEqual(attempts.map((response) => response.status), [401, 401, 401, 401, 401])
  assert.equal((await login(address)).status, 429)
  const spoofed = await api('/api/login', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': address, 'X-Forwarded-For': '203.0.113.99' },
    body: JSON.stringify({ password: bindings.ADMIN_PASSWORD }),
  })
  assert.equal(spoofed.status, 429)
  assert.equal((await login('203.0.113.21')).status, 200)
})

test('sessions and login blocks survive Worker reloads; logout revokes the persisted token immediately', async () => {
  const { token } = await (await login('203.0.113.30')).json()
  const headers = { Authorization: `Bearer ${token}` }
  await worker.setOptions(options({ TEST_REVISION: '2' }))
  assert.deepEqual(await (await api('/api/session', { headers })).json(), { isOwner: true })
  assert.equal((await login('203.0.113.20')).status, 429)
  assert.equal((await api('/api/session', { method: 'DELETE', headers })).status, 200)
  assert.deepEqual(await (await api('/api/session', { headers })).json(), { isOwner: false })
  assert.equal((await api('/api/films', { method: 'PUT', headers })).status, 401)
})

test('GitHub write conflicts are returned as 409 without overwriting stored films', async () => {
  const { token } = await (await login('203.0.113.40')).json()
  const headers = { Authorization: `Bearer ${token}` }
  const before = structuredClone(storedFilms)
  try {
    for (const status of [409, 422]) {
      writeStatus = status
      const response = await api('/api/films', {
        method: 'PUT', headers, body: JSON.stringify({ films: [], sha }),
      })
      assert.equal(response.status, 409)
      assert.deepEqual(storedFilms, before)
    }
  } finally {
    writeStatus = 200
  }
})

test('changing the admin password invalidates existing persisted sessions', async () => {
  const { token } = await (await login('203.0.113.50')).json()
  await worker.setOptions(options({ ADMIN_PASSWORD: 'another-long-test-password' }))
  try {
    const response = await api('/api/session', { headers: { Authorization: `Bearer ${token}` } })
    assert.deepEqual(await response.json(), { isOwner: false })
    assert.equal((await login('203.0.113.51', 'another-long-test-password')).status, 200)
  } finally {
    await worker.setOptions(options())
  }
})

test('expired sessions cannot write and expired login blocks allow a new login', async () => {
  const address = '203.0.113.60'
  const { token } = await (await login(address)).json()
  for (let count = 0; count < 5; count += 1) await login(address, 'wrong')
  assert.equal((await login(address)).status, 429)
  const storage = await worker.unsafeGetDurableObjectStorage(config.name, 'AuthState', { name: 'owner-auth' })
  await storage.exec('UPDATE sessions SET expires_at = 0')
  await storage.exec('UPDATE login_attempts SET expires_at = 0')
  const headers = { Authorization: `Bearer ${token}` }
  assert.deepEqual(await (await api('/api/session', { headers })).json(), { isOwner: false })
  assert.equal((await api('/api/films', { method: 'PUT', headers })).status, 401)
  assert.equal((await login(address)).status, 200)
})

test('missing secrets, short passwords and invalid origins return a configuration error', async () => {
  try {
    for (const overrides of [{ GITHUB_TOKEN: '' }, { ADMIN_PASSWORD: 'short' }, { WEB_ORIGIN: 'invalid' }]) {
      await worker.setOptions(options(overrides))
      const response = await api('/api/films')
      assert.equal(response.status, 500)
    }
  } finally {
    await worker.setOptions(options())
  }
})
