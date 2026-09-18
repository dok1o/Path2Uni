// One-time codes. Needs path2uni_core; skips itself when the database is down.
//
// These are the rules an attacker would look for first, so each one is pinned.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { query, isReachable, pool } from '../server/db.js'
import { register } from '../server/auth.js'
import { createChallenge, useChallenge, looksLikeEmail, storeEmail, readEmail } from '../server/challenges.js'

const up = await isReachable()
const db = { skip: up ? false : 'postgres is not running' }
const made = []

async function newUser() {
  const username = `ch_${Math.random().toString(36).slice(2, 10)}`
  made.push(username)
  const { user } = await register({ username, password: 'a-good-passphrase', email: `${username}@example.test` })
  return user
}
after(async () => {
  if (up && made.length) await query('delete from users where username = any($1)', [made])
  await pool.end()
})

test('an address is recognised, and junk is not', () => {
  for (const good of ['a@b.co', 'path2uni.edu@gmail.com', 'first.last+tag@sub.example.org']) {
    assert.equal(looksLikeEmail(good), true, good)
  }
  for (const bad of ['', 'nope', 'a@b', '@b.co', 'a b@c.co', null, undefined, 42, 'a@b.', 'a@.co']) {
    assert.equal(looksLikeEmail(bad), false, String(bad))
  }
})

test('an address round-trips through encryption', () => {
  const stored = storeEmail('  Path2Uni.EDU@Gmail.com ')
  assert.equal(readEmail(stored), 'path2uni.edu@gmail.com', 'trimmed and lowercased')
  assert.notEqual(stored, 'path2uni.edu@gmail.com', 'the address must not be stored in the clear')
})

test('the code is never stored, only its hash', db, async () => {
  const user = await newUser()
  const challenge = await createChallenge({ userId: user.id, purpose: 'login', emailCipher: storeEmail(`${user.username}@example.test`) })
  const { rows } = await query('select code_hash, token_hash from login_challenges where user_id = $1', [user.id])
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].code_hash, challenge.code, 'the code itself is in the table')
  assert.match(rows[0].code_hash, /^[0-9a-f]{64}$/)
  assert.notEqual(rows[0].token_hash, challenge.token, 'the token itself is in the table')
})

test('the right code works exactly once', db, async () => {
  const user = await newUser()
  const challenge = await createChallenge({ userId: user.id, purpose: 'login', emailCipher: storeEmail(`${user.username}@example.test`) })
  const first = await useChallenge({ token: challenge.token, code: challenge.code, purpose: 'login' })
  assert.equal(first.userId, user.id)
  const second = await useChallenge({ token: challenge.token, code: challenge.code, purpose: 'login' })
  assert.ok(second.error, 'a used code must not work again')
})

test('five wrong codes burn the challenge', db, async () => {
  const user = await newUser()
  const challenge = await createChallenge({ userId: user.id, purpose: 'login', emailCipher: storeEmail(`${user.username}@example.test`) })
  const wrong = challenge.code === '000000' ? '111111' : '000000'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await useChallenge({ token: challenge.token, code: wrong, purpose: 'login' })
    assert.ok(result.error, `attempt ${attempt + 1} should fail`)
  }
  // Even the right code is refused now: the challenge is gone.
  const after = await useChallenge({ token: challenge.token, code: challenge.code, purpose: 'login' })
  assert.ok(after.error, 'the correct code still worked after five wrong ones')
})

test('a challenge for one purpose cannot be spent on another', db, async () => {
  const user = await newUser()
  const challenge = await createChallenge({ userId: user.id, purpose: 'verify_email', emailCipher: storeEmail(`${user.username}@example.test`) })
  const misused = await useChallenge({ token: challenge.token, code: challenge.code, purpose: 'login' })
  assert.ok(misused.error, 'a verification code signed somebody in')
})

test('asking again immediately is refused, and replaces nothing', db, async () => {
  const user = await newUser()
  const cipher = storeEmail(`${user.username}@example.test`)
  const first = await createChallenge({ userId: user.id, purpose: 'login', emailCipher: cipher })
  const second = await createChallenge({ userId: user.id, purpose: 'login', emailCipher: cipher })
  assert.equal(second.status, 429)
  // The first code must still be usable — a refused resend must not destroy it.
  assert.equal((await useChallenge({ token: first.token, code: first.code, purpose: 'login' })).userId, user.id)
})

test('an expired challenge is refused', db, async () => {
  const user = await newUser()
  const challenge = await createChallenge({ userId: user.id, purpose: 'login', emailCipher: storeEmail(`${user.username}@example.test`) })
  await query(`update login_challenges set expires_at = now() - interval '1 minute' where user_id = $1`, [user.id])
  const result = await useChallenge({ token: challenge.token, code: challenge.code, purpose: 'login' })
  assert.ok(result.error)
})

test('junk input cannot crash or pass', db, async () => {
  for (const input of [{}, { token: null, code: '123456' }, { token: 'x', code: null }, { token: 'x', code: 'abcdef' }, { token: 'x', code: '1' }]) {
    const result = await useChallenge({ ...input, purpose: 'login' })
    assert.ok(result.error, JSON.stringify(input))
  }
})

test('deleting a user takes their challenges with them', db, async () => {
  const user = await newUser()
  await createChallenge({ userId: user.id, purpose: 'login', emailCipher: storeEmail(`${user.username}@example.test`) })
  await query('delete from users where id = $1', [user.id])
  const { rows } = await query('select count(*)::int as n from login_challenges where user_id = $1', [user.id])
  assert.equal(rows[0].n, 0)
})
