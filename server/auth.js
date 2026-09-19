// Username + password sign-in.
//
// Deliberate choices, because each one is a place where auth usually goes wrong:
//   * scrypt from node:crypto — no dependency, memory-hard, and the cost parameters are
//     stored inside the digest so they can be raised later without a migration.
//   * timingSafeEqual for every comparison, and a dummy hash when the user does not exist,
//     so a wrong username and a wrong password take the same time to answer.
//   * The session cookie holds a random token; the database stores only its sha256. A stolen
//     database dump cannot be replayed as a login.
//   * Failed attempts are counted and the account locks briefly. The lock is checked before
//     any password work, so lockout cannot be used to time-probe.

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { query } from './db.js'
import { encrypt, encryptionReady, blindIndex } from './crypto.js'
import { storeEmail, readEmail, looksLikeEmail } from './challenges.js'

const scrypt = promisify(scryptCallback)

// scrypt needs 128 * N * r bytes — 32 MiB at these parameters, which is exactly Node's
// default maxmem ceiling, so it must be raised explicitly or every hash throws.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64 }
const MAXMEM = 128 * 1024 * 1024
const SESSION_DAYS = 30
const MAX_FAILED = 8
const LOCK_MINUTES = 15

const EMAIL_CONTEXT = 'users.email'

/** Lowercased, so the same address always produces the same index. */
export const emailIndexOf = address => blindIndex(String(address).trim().toLowerCase(), EMAIL_CONTEXT)

export const USERNAME_RULES = '3–32 characters: letters, numbers, dot, dash or underscore'
export const PASSWORD_RULES = 'at least 8 characters'

const usernameOk = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{3,32}$/.test(value)
// Length is the only rule worth enforcing. Composition rules push people towards "Passw0rd!".
const passwordOk = value => typeof value === 'string' && value.length >= 8 && value.length <= 200

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: MAXMEM })
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), derived.toString('base64')].join('$')
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  const [scheme, N, r, p, salt, digest] = stored.split('$')
  if (scheme !== 'scrypt') return false

  const expected = Buffer.from(digest || '', 'base64')
  const saltBytes = Buffer.from(salt || '', 'base64')
  // Without these guards an empty digest derives a zero-length key, and timingSafeEqual
  // of two empty buffers is true — a planted `scrypt$$$$$` row would accept any password.
  if (expected.length < 32 || saltBytes.length < 8) return false
  if (!(Number(N) >= 2 ** 12) || !(Number(r) >= 1) || !(Number(p) >= 1)) return false

  try {
    const actual = await scrypt(password, saltBytes, expected.length,
      { N: Number(N), r: Number(r), p: Number(p), maxmem: MAXMEM })
    return timingSafeEqual(expected, actual)
  } catch { return false }
}

// Burned on a missing user so that "no such account" costs the same as "wrong password".
const DECOY = await hashPassword(randomBytes(24).toString('hex'))

const tokenHash = token => createHash('sha256').update(token).digest('hex')

const publicUser = row => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  createdAt: row.created_at,
  email: readEmail(row.email_cipher),
  emailVerified: Boolean(row.email_verified_at),
  twoFactorEnabled: Boolean(row.two_factor_enabled),
  notifyByEmail: Boolean(row.notify_by_email),
})

export { publicUser }

export async function register({ username, password, displayName, email, userAgent }) {
  if (!usernameOk(username)) return { error: `Username must be ${USERNAME_RULES}.`, status: 400, field: 'username' }
  if (!passwordOk(password)) return { error: `Password must be ${PASSWORD_RULES}.`, status: 400, field: 'password' }
  if (!looksLikeEmail(email)) return { error: 'Enter an email address we can reach you at.', status: 400, field: 'email' }

  const password_hash = await hashPassword(password)
  let row
  try {
    const result = await query(
      `insert into users (username, password_hash, password_updated_at, display_name, email_cipher, email_index)
       values ($1, $2, now(), $3, $4, $5)
       returning id, username, display_name, created_at, email_cipher, email_verified_at, two_factor_enabled, notify_by_email`,
      [username, password_hash, (displayName || username).slice(0, 80), storeEmail(email), emailIndexOf(email)])
    row = result.rows[0]
  } catch (error) {
    // 23505 is unique_violation — the handle, or the address, is taken.
    if (error.code === '23505') {
      return String(error.detail || '').includes('email_index')
        ? { error: 'That email already has an account. Sign in instead.', status: 409, field: 'email' }
        : { error: 'That username is already taken.', status: 409, field: 'username' }
    }
    throw error
  }
  // The account exists straight away and the address is confirmed afterwards. Blocking
  // account creation on a delivered email would mean nobody can sign up while SMTP is
  // misconfigured, and an admission plan is not worth less because a message was slow.
  return { user: publicUser(row), session: await openSession(row.id, userAgent) }
}

/** The account behind an address, or null. Never says which it was — see requestEmailCode. */
export async function findByEmail(address) {
  if (!looksLikeEmail(address)) return null
  const { rows } = await query(
    `select id, username, display_name, created_at, email_cipher, email_verified_at, two_factor_enabled, notify_by_email
     from users where email_index = $1`, [emailIndexOf(address)])
  return rows[0] ?? null
}

export async function attachEmail(userId, address) {
  if (!looksLikeEmail(address)) return { error: 'Enter an email address we can reach you at.', status: 400 }
  const emailIndex = emailIndexOf(address)
  try {
    await query(
      `update users
          set email_cipher = $2,
              email_verified_at = case when email_index = $3 then email_verified_at else null end,
              two_factor_enabled = case when email_index = $3 then two_factor_enabled else false end,
              notify_by_email = case when email_index = $3 then notify_by_email else false end,
              email_index = $3,
              updated_at = now()
        where id = $1`, [userId, storeEmail(address), emailIndex])
  } catch (error) {
    if (error.code === '23505') return { error: 'That email already has an account. Sign in instead.', status: 409 }
    throw error
  }
  return { ok: true }
}

export async function markEmailVerified(userId, emailCipher) {
  await query('update users set email_verified_at = now(), email_cipher = coalesce($2, email_cipher) where id = $1',
    [userId, emailCipher ?? null])
}

/** Used after a verified second factor, and after a verified passwordless code. */
export const startSession = (userId, userAgent) => openSession(userId, userAgent)

export async function userById(id) {
  const { rows } = await query(
    `select id, username, display_name, created_at, email_cipher, email_verified_at, two_factor_enabled, notify_by_email
     from users where id = $1`, [id])
  return rows[0] ?? null
}

export async function login({ username, password, userAgent }) {
  const wrong = { error: 'Wrong username or password.', status: 401 }
  if (typeof username !== 'string' || typeof password !== 'string') return wrong

  const { rows } = await query(
    `select id, username, display_name, created_at, password_hash, locked_until,
            email_cipher, email_verified_at, two_factor_enabled, notify_by_email
     from users where username = $1`, [username])
  const row = rows[0]

  if (row?.locked_until && new Date(row.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(row.locked_until) - Date.now()) / 60000)
    return { error: `Too many attempts. Try again in ${minutes} min.`, status: 429 }
  }

  // Always do the work, even with no such user, so the two cases are indistinguishable.
  const ok = await verifyPassword(password, row ? row.password_hash : DECOY)
  if (!row || !ok) {
    if (row) {
      await query(
        `update users set failed_login_count = failed_login_count + 1,
           locked_until = case when failed_login_count + 1 >= $2 then now() + ($3 || ' minutes')::interval else locked_until end
         where id = $1`, [row.id, MAX_FAILED, String(LOCK_MINUTES)])
    }
    return wrong
  }

  await query('update users set failed_login_count = 0, locked_until = null where id = $1', [row.id])
  // A second factor is only honoured once the address behind it has been confirmed —
  // otherwise a typo at sign-up would lock someone out of their own account for good.
  if (row.two_factor_enabled && row.email_verified_at && row.email_cipher) {
    return { needsSecondFactor: true, userId: row.id, emailCipher: row.email_cipher }
  }
  return { user: publicUser(row), session: await openSession(row.id, userAgent) }
}

async function openSession(userId, userAgent) {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000)
  // The user agent is kept so a person can recognise their own devices, and is never
  // queried — which makes it a clean candidate for encryption at rest. Without a key
  // configured we store nothing rather than storing it in the clear.
  const agent = userAgent
    ? (encryptionReady() ? encrypt(String(userAgent).slice(0, 300), 'sessions.user_agent') : null)
    : null
  await query(
    `insert into sessions (token_hash, user_id, expires_at, user_agent) values ($1, $2, $3, $4)`,
    [tokenHash(token), userId, expires, agent])
  return { token, expires }
}

/** Resolves a cookie token to a user, or null. Also sweeps the session's expiry forward. */
export async function userForToken(token) {
  if (typeof token !== 'string' || !token) return null
  const { rows } = await query(
    `select u.id, u.username, u.display_name, u.created_at, u.email_cipher, u.email_verified_at,
            u.two_factor_enabled, u.notify_by_email
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`, [tokenHash(token)])
  if (!rows[0]) return null
  query('update sessions set last_seen_at = now() where token_hash = $1', [tokenHash(token)]).catch(() => {})
  return publicUser(rows[0])
}

export async function logout(token) {
  if (typeof token === 'string' && token) await query('delete from sessions where token_hash = $1', [tokenHash(token)])
}

/** Expired rows are never read, but they should not accumulate either. */
export async function sweepSessions() {
  const { rowCount } = await query('delete from sessions where expires_at < now()')
  return rowCount
}
