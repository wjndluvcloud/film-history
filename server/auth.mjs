import { Buffer } from 'node:buffer'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { DurableObject } from 'cloudflare:workers'

const sessionDuration = 12 * 60 * 60 * 1000
const loginWindow = 15 * 60 * 1000
const hash = (value) => createHash('sha256').update(value).digest('hex')
const json = (status, body) => Response.json(body, { status })

export class AuthState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, password_hash TEXT NOT NULL
    )`)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS login_attempts (
      address TEXT PRIMARY KEY, count INTEGER NOT NULL, blocked_until INTEGER NOT NULL, expires_at INTEGER NOT NULL
    )`)
  }

  async fetch(request) {
    const body = await request.json()
    const now = Date.now()
    const passwordHash = hash(this.env.ADMIN_PASSWORD)
    // All state reads and writes below are synchronous, so concurrent logins cannot lose attempts.
    this.sql.exec('DELETE FROM sessions WHERE expires_at <= ? OR password_hash != ?', now, passwordHash)
    this.sql.exec('DELETE FROM login_attempts WHERE expires_at <= ?', now)
    const path = new URL(request.url).pathname

    if (path === '/login') {
      const attempt = this.sql.exec('SELECT count, blocked_until FROM login_attempts WHERE address = ?', body.address).toArray()[0]
        || { count: 0, blocked_until: 0 }
      if (attempt.blocked_until > now) return json(429, { error: 'Thử đăng nhập lại sau 15 phút.' })
      const matches = typeof body.password === 'string'
        && timingSafeEqual(Buffer.from(hash(body.password), 'hex'), Buffer.from(passwordHash, 'hex'))
      if (!matches) {
        const count = attempt.count + 1
        const until = count >= 5 ? now + loginWindow : 0
        this.sql.exec(
          'INSERT OR REPLACE INTO login_attempts (address, count, blocked_until, expires_at) VALUES (?, ?, ?, ?)',
          body.address, count, until, now + loginWindow,
        )
        return json(401, { error: 'Mật khẩu không đúng.' })
      }
      this.sql.exec('DELETE FROM login_attempts WHERE address = ?', body.address)
      const token = randomBytes(32).toString('base64url')
      this.sql.exec('INSERT INTO sessions (token_hash, expires_at, password_hash) VALUES (?, ?, ?)', hash(token), now + sessionDuration, passwordHash)
      return json(200, { token })
    }

    const tokenHash = typeof body.token === 'string' ? hash(body.token) : null
    if (path === '/verify') {
      const session = tokenHash && this.sql.exec('SELECT token_hash FROM sessions WHERE token_hash = ?', tokenHash).toArray()[0]
      return json(200, { isOwner: Boolean(session) })
    }
    if (path === '/logout') {
      if (tokenHash) this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', tokenHash)
      return json(200, { ok: true })
    }
    return json(404, { error: 'Unknown auth operation' })
  }
}
