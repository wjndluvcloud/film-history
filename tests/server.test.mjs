import assert from 'node:assert/strict'
import { after, test } from 'node:test'

process.env.WEB_ORIGIN = 'http://localhost:5173'
process.env.GITHUB_OWNER = 'example'
process.env.GITHUB_REPO = 'films'
process.env.GITHUB_TOKEN = 'test-token'
process.env.ADMIN_PASSWORD = 'a-long-test-password'

const { server } = await import('../server/index.mjs')
const originalFetch = globalThis.fetch
let storedFilms = []
let sha = 'sha-1'
let missingGitHubFile = false

globalThis.fetch = async (url, options = {}) => {
  assert.match(String(url), /^https:\/\/api\.github\.com\/repos\/example\/films\/contents\/public\/films\.json/)
  if (missingGitHubFile) return Response.json({ message: 'Not Found' }, { status: 404 })
  if (options.method === 'PUT') {
    const body = JSON.parse(options.body)
    assert.equal(body.sha, sha)
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

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const apiBase = `http://127.0.0.1:${server.address().port}`

after(async () => {
  globalThis.fetch = originalFetch
  await new Promise((resolve) => server.close(resolve))
})

function api(path, options) {
  return originalFetch(`${apiBase}${path}`, options)
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
  const successfulLogin = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) })
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
  const originalError = console.error
  console.error = () => {}
  try {
    const response = await api('/api/films')
    assert.equal(response.status, 502)
  } finally {
    console.error = originalError
    missingGitHubFile = false
  }
})
