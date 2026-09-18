// One-time codes: the second factor at sign-in, and the proof that an address belongs to
// whoever typed it.
//
// The rules here are the same ones server/auth.js already follows, for the same reasons:
//
//   * The code is never stored. Only its sha256, exactly as sessions.token_hash works, so a
//     database dump cannot be used to finish somebody's sign-in.
//   * Comparison is timing-safe. A code is six digits; a comparison that returns early would
//     hand an attacker the digits one at a time.
//   * Five wrong tries burns the challenge. Six digits is a million possibilities, which
//     sounds like plenty until something tries them at machine speed.
//   * A challenge is single-use and expires in ten minutes.
//   * Creating one is rate-limited, because the send costs us and annoys the recipient.
//
// The `token` the client holds between the two halves of a sign-in is random and unguessable
// on its own — knowing a username must not be enough to attack the second step.

import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto'
import { query } from './db.js'
import { encrypt, decrypt, encryptionReady } from './crypto.js'

const EMAIL_CONTEXT = 'users.email'
const CODE_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5
const RESEND_SECONDS = 60

const sha256 = value => createHash('sha256').update(value).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')
/** Six digits, uniformly. `randomInt` is rejection-sampled, so no modulo bias. */
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

const sameHash = (a, b) => {
  const left = Buffer.from(String(a), 'utf8')
  const right = Buffer.from(String(b), 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

export const storeEmail = address => encryptionReady()
  ? encrypt(String(address).trim().toLowerCase(), EMAIL_CONTEXT)
  : String(address).trim().toLowerCase()

export const readEmail = cipher => {
  if (!cipher) return null
  try { return cipher.startsWith('p2u.') ? decrypt(cipher, EMAIL_CONTEXT) : cipher }
  catch { return null }
}

export const looksLikeEmail = value =>
  typeof value === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(value.trim())

/**
 * @returns {{token, code, email} | {error, status}} — the caller sends the code; nothing else
 * in the process ever sees it again.
 */
export async function createChallenge({ userId, purpose, emailCipher }) {
  const { rows: recent } = await query(
    `select created_at from login_challenges
     where user_id = $1 and purpose = $2 order by created_at desc limit 1`, [userId, purpose])
  if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < RESEND_SECONDS * 1000) {
    return { error: 'A code was just sent. Wait a minute before asking for another.', status: 429 }
  }

  // One live challenge per purpose: an old code must stop working the moment a new one exists.
  await query('delete from login_challenges where user_id = $1 and purpose = $2', [userId, purpose])

  const token = newToken()
  const code = newCode()
  await query(
    `insert into login_challenges (token_hash, user_id, purpose, code_hash, email_cipher, expires_at)
     values ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval)`,
    [sha256(token), userId, purpose, sha256(code), emailCipher, String(CODE_TTL_MINUTES)])

  return { token, code, email: readEmail(emailCipher) }
}

/** @returns {{userId, purpose, emailCipher} | {error, status}} */
export async function useChallenge({ token, code, purpose }) {
  if (typeof token !== 'string' || !token) return { error: 'That code has expired. Start again.', status: 400 }
  if (typeof code !== 'string' || !/^\d{4,8}$/.test(code.trim())) {
    return { error: 'Enter the 6-digit code from the email.', status: 400 }
  }

  const { rows } = await query(
    `select token_hash, user_id, purpose, code_hash, email_cipher, attempts, expires_at
     from login_challenges where token_hash = $1`, [sha256(token)])
  const challenge = rows[0]
  if (!challenge || challenge.purpose !== purpose) {
    return { error: 'That code has expired. Start again.', status: 400 }
  }
  if (new Date(challenge.expires_at) < new Date()) {
    await query('delete from login_challenges where token_hash = $1', [challenge.token_hash])
    return { error: 'That code has expired. Start again.', status: 400 }
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    await query('delete from login_challenges where token_hash = $1', [challenge.token_hash])
    return { error: 'Too many wrong codes. Start again.', status: 429 }
  }

  if (!sameHash(sha256(code.trim()), challenge.code_hash)) {
    await query('update login_challenges set attempts = attempts + 1 where token_hash = $1', [challenge.token_hash])
    const left = MAX_ATTEMPTS - challenge.attempts - 1
    return left > 0
      ? { error: 'Wrong code. {count} tries left.', vars: { count: left }, status: 401 }
      : { error: 'Too many wrong codes. Start again.', status: 429 }
  }

  // Single use: correct or not, this challenge is finished.
  await query('delete from login_challenges where token_hash = $1', [challenge.token_hash])
  return { userId: challenge.user_id, purpose: challenge.purpose, emailCipher: challenge.email_cipher }
}

/** Expired rows are useless and should not accumulate; called on a timer by the server. */
export const purgeExpiredChallenges = () => query('delete from login_challenges where expires_at < now()')
