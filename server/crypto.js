// Field-level encryption for personal data.
//
// What this protects against: a stolen backup, a leaked dump, a replica someone should not
// have, a DBA reading tables directly. What it does NOT protect against: a compromised
// application — this process holds the key, so anything that owns the process owns the data.
// Column encryption is worth doing anyway, but not worth false confidence.
//
// Shape of a stored value:   p2u.1.<keyId>.<base64(iv | tag | ciphertext)>
//
//   * AES-256-GCM: authenticated, so a tampered ciphertext fails loudly instead of decoding
//     to garbage.
//   * The 12-byte IV is random per value, so the same plaintext never produces the same
//     ciphertext twice and the column leaks nothing by comparison.
//   * `keyId` names the key that encrypted this value, so a key can be rotated without
//     re-encrypting the whole table in one transaction.
//   * `context` is bound in as additional authenticated data. A birth date encrypted for
//     one column of one row will not decrypt as another — an attacker with write access to
//     the database cannot move a value from row to row.

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import './env.js'

const PREFIX = 'p2u'
const VERSION = '1'
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * Keys come from the environment, never from a file next to the database — whoever steals
 * the dump must not also get the key, or none of this bought anything.
 *
 *   P2U_KEYS      one or more keys as `id:base64`, comma separated. The FIRST is used for
 *                 new writes; the rest stay to decrypt values written before a rotation.
 *   P2U_INDEX_KEY separate key for blind indexes (see blindIndex below).
 */
function loadKeys(env = process.env) {
  const entries = (env.P2U_KEYS || '').split(',').map(part => part.trim()).filter(Boolean)
  const keys = new Map()
  let primary = null
  for (const entry of entries) {
    const at = entry.indexOf(':')
    if (at < 1) throw new Error(`P2U_KEYS entry must look like "id:base64key", got "${entry.slice(0, 12)}…"`)
    const id = entry.slice(0, at)
    const key = Buffer.from(entry.slice(at + 1), 'base64')
    if (key.length !== 32) throw new Error(`key "${id}" must be 32 bytes (got ${key.length})`)
    keys.set(id, key)
    primary ??= id
  }
  return { keys, primary }
}

let state = loadKeys()

/** Re-reads the environment. Used by tests and after a key rotation. */
export function reloadKeys(env = process.env) { state = loadKeys(env); return state.primary }

export const encryptionReady = () => state.primary !== null

const requireKeys = () => {
  if (!state.primary) throw new Error('No encryption key configured. Set P2U_KEYS (see npm run keygen).')
}

/**
 * @param {string} plaintext
 * @param {string} context e.g. "applicant_profiles.profile_summary" — bound into the ciphertext
 */
export function encrypt(plaintext, context) {
  requireKeys()
  if (plaintext === null || plaintext === undefined) return null
  if (typeof context !== 'string' || !context) throw new Error('encrypt() needs a context string')

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', state.keys.get(state.primary), iv)
  cipher.setAAD(Buffer.from(context, 'utf8'))
  const body = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const packed = Buffer.concat([iv, cipher.getAuthTag(), body])
  return `${PREFIX}.${VERSION}.${state.primary}.${packed.toString('base64')}`
}

export function decrypt(stored, context) {
  if (stored === null || stored === undefined) return null
  if (typeof stored !== 'string') throw new Error('decrypt() expects a string')

  const parts = stored.split('.')
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error('not an encrypted value')
  const [, version, keyId, payload] = parts
  if (version !== VERSION) throw new Error(`unsupported ciphertext version "${version}"`)

  const key = state.keys.get(keyId)
  if (!key) throw new Error(`ciphertext was written with key "${keyId}", which is not loaded`)

  const packed = Buffer.from(payload, 'base64')
  if (packed.length < IV_BYTES + TAG_BYTES) throw new Error('ciphertext is truncated')

  const decipher = createDecipheriv('aes-256-gcm', key, packed.subarray(0, IV_BYTES))
  decipher.setAuthTag(packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
  decipher.setAAD(Buffer.from(context, 'utf8'))
  // Throws on a wrong key, a wrong context or any tampering. Callers should let it throw:
  // silently returning null would turn corruption into quiet data loss.
  return Buffer.concat([decipher.update(packed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
}

export const isEncrypted = value => typeof value === 'string' && value.startsWith(`${PREFIX}.${VERSION}.`)

/**
 * Exact-match lookup over an encrypted column.
 *
 * Random IVs mean `where email = $1` can never work, so the searchable form is a keyed HMAC
 * stored in a companion column. It is deterministic, which is the point and also the cost:
 * equal values produce equal indexes, so the column reveals which rows share a value. Use it
 * only where that is acceptable and a unique lookup is genuinely needed, never for low-entropy
 * data like a birth date, where an attacker could simply hash every possible value.
 */
export function blindIndex(value, context, env = process.env) {
  const secret = env.P2U_INDEX_KEY
  if (!secret) throw new Error('No blind-index key configured. Set P2U_INDEX_KEY.')
  if (value === null || value === undefined) return null
  return createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(`${context}\u0000${String(value).trim().toLowerCase()}`)
    .digest('hex')
}

export function blindIndexMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/** Convenience for whole objects, e.g. a profile snapshot stored as one encrypted column. */
export const encryptJson = (value, context) => encrypt(JSON.stringify(value), context)
export const decryptJson = (stored, context) => {
  const text = decrypt(stored, context)
  return text === null ? null : JSON.parse(text)
}

export function generateKey() { return randomBytes(32).toString('base64') }
