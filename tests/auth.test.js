// Needs path2uni_core. Skips itself when the database is not running, so `npm test`
// stays useful without Docker: `docker compose up -d core-db` turns these on.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { query, isReachable, pool } from '../server/db.js'
import { decrypt, isEncrypted } from '../server/crypto.js'
import { hashPassword, verifyPassword, register, login, logout, userForToken, sweepSessions } from '../server/auth.js'
import { route, readCookie, sessionCookie, clearCookie } from '../server/routes.js'

const up = await isReachable()
const db = { skip: up ? false : 'postgres is not running (docker compose up -d core-db)' }

const PASSWORD = 'a-good-passphrase'
const made = []
const fresh = () => {
  const name = `test_${Math.random().toString(36).slice(2, 10)}`
  made.push(name)
  return name
}

after(async () => {
  if (up && made.length) await query('delete from users where username = any($1)', [made])
  await pool.end()
})

// ---------- hashing, which needs no database ----------

test('a hash round-trips and rejects the wrong password', async () => {
  const digest = await hashPassword(PASSWORD)
  assert.equal(await verifyPassword(PASSWORD, digest), true)
  assert.equal(await verifyPassword(PASSWORD + 'x', digest), false)
  assert.equal(await verifyPassword('', digest), false)
})

test('the digest carries its own parameters and salt', async () => {
  const [scheme, N, r, p, salt, hash] = (await hashPassword(PASSWORD)).split('$')
  assert.equal(scheme, 'scrypt')
  assert.ok(Number(N) >= 2 ** 14, `cost parameter too low: ${N}`)
  assert.ok(Number(r) > 0 && Number(p) > 0)
  assert.ok(Buffer.from(salt, 'base64').length >= 16, 'salt is shorter than 16 bytes')
  assert.ok(Buffer.from(hash, 'base64').length >= 32)
})

test('the same password hashes differently every time', async () => {
  const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)])
  assert.notEqual(a, b, 'identical digests mean the salt is not random')
})

test('a malformed or missing digest verifies as false, never throws', async () => {
  for (const stored of [null, undefined, '', 'plaintext', 'bcrypt$x$y', 'scrypt$notanumber$8$1$aa$bb', 'scrypt$$$$$']) {
    assert.equal(await verifyPassword(PASSWORD, stored), false, `threw or passed on ${JSON.stringify(stored)}`)
  }
})

// ---------- registration ----------

test('registration rejects a bad username before touching the database', db, async () => {
  for (const username of ['', 'ab', 'a'.repeat(33), 'has space', 'em@il', 'слово', null, 42]) {
    const result = await register({ username, password: PASSWORD, email: `${username}@example.test` })
    assert.equal(result.status, 400, `accepted username ${JSON.stringify(username)}`)
    assert.equal(result.field, 'username')
  }
})

test('registration rejects a short password', db, async () => {
  for (const password of ['', '1234567', null, 42, 'x'.repeat(201)]) {
    const result = await register({ username: fresh(), password, email: `${Math.random().toString(36).slice(2)}@example.test` })
    assert.equal(result.status, 400, `accepted password of length ${String(password).length}`)
    assert.equal(result.field, 'password')
  }
})

test('registering returns a user and an opaque session', db, async () => {
  const username = fresh()
  const result = await register({ username, password: PASSWORD, displayName: 'Test Person', email: `${username}@example.test` })
  assert.equal(result.error, undefined)
  assert.equal(result.user.username, username)
  assert.equal(result.user.displayName, 'Test Person')
  assert.ok(result.user.id)
  assert.ok(result.session.token.length >= 32)
  assert.ok(result.session.expires > new Date())
})

test('the username is taken case-insensitively', db, async () => {
  const username = fresh()
  await register({ username, password: PASSWORD, email: `${username}@example.test` })
  const clash = await register({ username: username.toUpperCase(), password: PASSWORD, email: `${Math.random().toString(36).slice(2)}@example.test` })
  assert.equal(clash.status, 409)
  assert.equal(clash.field, 'username')
})

test('no response object ever carries a password or its hash', db, async () => {
  const result = await register({ username: fresh(), password: PASSWORD, email: `${Math.random().toString(36).slice(2)}@example.test` })
  const text = JSON.stringify(result.user)
  assert.ok(!text.includes(PASSWORD), 'the password came back to the caller')
  assert.ok(!/scrypt\$/.test(text), 'the hash came back to the caller')
  assert.deepEqual(Object.keys(result.user).sort(),
    ['createdAt', 'displayName', 'email', 'emailVerified', 'id', 'notifyByEmail', 'twoFactorEnabled', 'username'])
  // The shape is allowed to grow; a secret is never allowed in. This part of the test is the
  // reason it exists, and it keeps working when a new field is added.
  for (const key of Object.keys(result.user)) {
    assert.ok(!/password|hash|cipher|token|secret/i.test(key), `${key} has no business in a response`)
  }
  assert.ok(!/p2u\.\d\./.test(text), 'a ciphertext came back to the caller')
})

// ---------- login ----------

test('login accepts the right password and rejects the wrong one', db, async () => {
  const username = fresh()
  await register({ username, password: PASSWORD, email: `${username}@example.test` })
  assert.equal((await login({ username, password: PASSWORD })).user.username, username)
  assert.equal((await login({ username, password: PASSWORD + '!' })).status, 401)
  assert.equal((await login({ username: username.toUpperCase(), password: PASSWORD })).user.username, username)
})

test('a missing account and a wrong password are indistinguishable', db, async () => {
  const username = fresh()
  await register({ username, password: PASSWORD, email: `${username}@example.test` })
  const missing = await login({ username: 'no_such_account_here', password: PASSWORD })
  const wrong = await login({ username, password: 'not-the-password' })
  assert.equal(missing.error, wrong.error)
  assert.equal(missing.status, wrong.status)
})

test('login survives non-string input', db, async () => {
  for (const value of [null, undefined, 42, {}, []]) {
    const result = await login({ username: value, password: value })
    assert.equal(result.status, 401)
  }
})

test('repeated failures lock the account, and the lock is reported', db, async () => {
  const username = fresh()
  await register({ username, password: PASSWORD, email: `${username}@example.test` })
  let locked = null
  for (let i = 0; i < 9; i += 1) {
    const result = await login({ username, password: 'wrong-one' })
    if (result.status === 429) { locked = result; break }
  }
  assert.ok(locked, 'the account never locked after nine wrong passwords')
  assert.match(locked.error, /Too many attempts/)
  // The lock must hold even when the password is finally correct.
  assert.equal((await login({ username, password: PASSWORD })).status, 429)
})

test('a successful login clears the failure counter', db, async () => {
  const username = fresh()
  await register({ username, password: PASSWORD, email: `${username}@example.test` })
  await login({ username, password: 'wrong-one' })
  await login({ username, password: 'wrong-one' })
  assert.ok((await login({ username, password: PASSWORD })).user)
  const { rows } = await query('select failed_login_count, locked_until from users where username = $1', [username])
  assert.equal(rows[0].failed_login_count, 0)
  assert.equal(rows[0].locked_until, null)
})

// ---------- sessions ----------

test('the database stores a hash of the token, never the token', db, async () => {
  const { session, user } = await register({ username: fresh(), password: PASSWORD, email: `${Math.random().toString(36).slice(2)}@example.test` })
  const { rows } = await query('select token_hash from sessions where user_id = $1', [user.id])
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].token_hash, session.token, 'the raw token is sitting in the database')
  assert.match(rows[0].token_hash, /^[a-f0-9]{64}$/, 'not a sha256 digest')
})

test('a token resolves to its user and a bad one resolves to nothing', db, async () => {
  const { session, user } = await register({ username: fresh(), password: PASSWORD, email: `${Math.random().toString(36).slice(2)}@example.test` })
  assert.equal((await userForToken(session.token)).id, user.id)
  for (const bad of [null, undefined, '', 'not-a-token', session.token + 'x', 42]) {
    assert.equal(await userForToken(bad), null, `accepted token ${JSON.stringify(bad)}`)
  }
})

test('logging out revokes that session and leaves the others alone', db, async () => {
  const username = fresh()
  const first = await register({ username, password: PASSWORD, email: `${username}@example.test` })
  const second = await login({ username, password: PASSWORD })
  await logout(first.session.token)
  assert.equal(await userForToken(first.session.token), null, 'the signed-out session still works')
  assert.ok(await userForToken(second.session.token), 'signing out of one device killed another')
})

test('expired sessions stop working and can be swept', db, async () => {
  const { session, user } = await register({ username: fresh(), password: PASSWORD, email: `${Math.random().toString(36).slice(2)}@example.test` })
  await query('update sessions set expires_at = now() - interval \'1 hour\' where user_id = $1', [user.id])
  assert.equal(await userForToken(session.token), null, 'an expired session still resolved')
  await sweepSessions()
  const { rows } = await query('select 1 from sessions where user_id = $1', [user.id])
  assert.equal(rows.length, 0, 'the expired row survived the sweep')
})

test('deleting a user takes their sessions with them', db, async () => {
  const { session, user } = await register({ username: fresh(), password: PASSWORD, email: `${Math.random().toString(36).slice(2)}@example.test` })
  await query('delete from users where id = $1', [user.id])
  assert.equal(await userForToken(session.token), null)
  const { rows } = await query('select 1 from sessions where user_id = $1', [user.id])
  assert.equal(rows.length, 0, 'sessions outlived their user')
})

// ---------- the HTTP surface ----------

const call = (path, { method = 'POST', body = {}, cookie = '' } = {}) =>
  route({ method, path, body: JSON.stringify(body), cookie, userAgent: 'test', apiKey: null })

test('the cookie is httpOnly, scoped and not readable by scripts', db, async () => {
  const username = fresh()
  const response = await call('/api/auth/register', { body: { username, password: PASSWORD , email: `${username}@example.test` } })
  assert.equal(response.status, 201)
  const cookie = response.headers['Set-Cookie']
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.match(cookie, /Path=\//)
  assert.ok(!cookie.includes(PASSWORD))
})

test('/api/auth/me is 200 with a null user when signed out', db, async () => {
  const response = await call('/api/auth/me', { method: 'GET' })
  assert.equal(response.status, 200)
  assert.equal(response.body.user, null)
})

test('a full register, me, logout, me cycle over the router', db, async () => {
  const username = fresh()
  const registered = await call('/api/auth/register', { body: { username, password: PASSWORD, displayName: 'Round Trip' , email: `${username}@example.test` } })
  const token = readCookie(registered.headers['Set-Cookie'].split(';')[0])
  const cookie = `p2u_session=${token}`

  const me = await call('/api/auth/me', { method: 'GET', cookie })
  assert.equal(me.body.user.displayName, 'Round Trip')

  const out = await call('/api/auth/logout', { cookie })
  assert.match(out.headers['Set-Cookie'], /Max-Age=0/)

  assert.equal((await call('/api/auth/me', { method: 'GET', cookie })).body.user, null)
})

test('the router answers unknown paths with 404 and bad JSON with 400', db, async () => {
  assert.equal((await route({ method: 'GET', path: '/api/nope', body: '', cookie: '', apiKey: null })).status, 404)
  assert.equal((await route({ method: 'POST', path: '/api/auth/login', body: '{oops', cookie: '', apiKey: null })).status, 400)
})

test('readCookie picks the right cookie out of a crowd', () => {
  assert.equal(readCookie('a=1; p2u_session=abc; b=2'), 'abc')
  assert.equal(readCookie('p2u_session_other=abc'), null)
  assert.equal(readCookie(''), null)
  assert.equal(readCookie(undefined), null)
})

test('the Secure flag follows the transport, and is absent on plain http', () => {
  const session = { token: 'x', expires: new Date(Date.now() + 86400_000) }
  assert.ok(!sessionCookie(session, false).includes('Secure'),
    'a Secure cookie over http is discarded by the browser and nobody could sign in')
  assert.match(sessionCookie(session, true), /; Secure/)
  assert.ok(!clearCookie(false).includes('Secure'))
  assert.match(clearCookie(true), /; Secure/)
})

test('HSTS is sent over TLS and never over http', db, async () => {
  const overTls = await route({ method: 'GET', path: '/api/auth/me', body: '', cookie: '', secure: true, apiKey: null })
  const overHttp = await route({ method: 'GET', path: '/api/auth/me', body: '', cookie: '', secure: false, apiKey: null })
  assert.match(overTls.headers['Strict-Transport-Security'], /max-age=\d+/)
  assert.equal(overHttp.headers['Strict-Transport-Security'], undefined,
    'promising HSTS from a dev server pins localhost to https in that browser')
})

test('one request cannot leak its transport into the next', db, async () => {
  await route({ method: 'GET', path: '/api/auth/me', body: '', cookie: '', secure: true, apiKey: null })
  const after = await route({ method: 'GET', path: '/api/auth/me', body: '', cookie: '', secure: false, apiKey: null })
  assert.equal(Object.keys(after.headers).length, 0)
})

test('a signed-in session over TLS gets a Secure cookie', db, async () => {
  const username = fresh()
  const response = await route({
    method: 'POST', path: '/api/auth/register', cookie: '', secure: true, apiKey: null,
    body: JSON.stringify({ username, password: PASSWORD, email: `${username}@example.test` }),
  })
  assert.match(response.headers['Set-Cookie'], /; Secure/)
})

test('the user agent is stored encrypted, not in the clear', db, async () => {
  const marker = 'SecretBrowser/9.9 (device fingerprint)'
  const { user } = await register({ username: fresh(), password: PASSWORD, userAgent: marker, email: `${Math.random().toString(36).slice(2)}@example.test` })
  const { rows } = await query('select user_agent from sessions where user_id = $1', [user.id])
  assert.ok(rows[0].user_agent, 'nothing was stored at all')
  assert.ok(!rows[0].user_agent.includes('SecretBrowser'), 'the user agent is sitting in the clear')
  assert.ok(isEncrypted(rows[0].user_agent))
  assert.equal(decrypt(rows[0].user_agent, 'sessions.user_agent'), marker)
})

test('the session cookie expires in the future', () => {
  const cookie = sessionCookie({ token: 'x', expires: new Date(Date.now() + 86400_000) })
  const expires = new Date(cookie.match(/Expires=([^;]+)/)[1])
  assert.ok(expires > new Date())
})
