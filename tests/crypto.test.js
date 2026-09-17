import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  encrypt, decrypt, isEncrypted, encryptJson, decryptJson,
  blindIndex, blindIndexMatches, generateKey, reloadKeys, encryptionReady,
} from '../server/crypto.js'

const ORIGINAL = { P2U_KEYS: process.env.P2U_KEYS, P2U_INDEX_KEY: process.env.P2U_INDEX_KEY }
const CTX = 'applicant_profiles.profile_summary'

afterEach(() => {
  process.env.P2U_KEYS = ORIGINAL.P2U_KEYS
  process.env.P2U_INDEX_KEY = ORIGINAL.P2U_INDEX_KEY
  reloadKeys()
})

test('a key is configured for this project', () => {
  assert.equal(encryptionReady(), true, 'run `npm run keygen >> .env`')
})

test('a value round-trips', () => {
  for (const value of ['Aisha Nurlan', '', 'Ünïcödé — 日本語 — эмодзи 🎓', 'x'.repeat(5000), '2008-04-11']) {
    assert.equal(decrypt(encrypt(value, CTX), CTX), value)
  }
})

test('the ciphertext never contains the plaintext', () => {
  const secret = 'passport-N1234567'
  const stored = encrypt(secret, CTX)
  assert.ok(!stored.includes(secret))
  assert.ok(!Buffer.from(stored.split('.')[3], 'base64').toString('utf8').includes(secret))
})

test('the same plaintext encrypts differently every time', () => {
  const a = encrypt('same', CTX), b = encrypt('same', CTX)
  assert.notEqual(a, b, 'a repeated ciphertext means the IV is not random and the column leaks equality')
  assert.equal(decrypt(a, CTX), decrypt(b, CTX))
})

test('a value cannot be moved to another column or row', () => {
  const stored = encrypt('1999-01-01', 'applicant_profiles.birth_date')
  assert.throws(() => decrypt(stored, 'applicant_profiles.profile_summary'))
  assert.throws(() => decrypt(stored, 'users.display_name'))
  assert.throws(() => decrypt(stored, ''))
})

test('tampering is detected rather than silently decoded', () => {
  const stored = encrypt('balance: 0', CTX)
  const [prefix, version, keyId, payload] = stored.split('.')
  const bytes = Buffer.from(payload, 'base64')

  for (const position of [0, 6, 14, bytes.length - 1]) {
    const flipped = Buffer.from(bytes)
    flipped[position] ^= 0x01
    assert.throws(() => decrypt(`${prefix}.${version}.${keyId}.${flipped.toString('base64')}`, CTX),
      `a flipped byte at ${position} was accepted`)
  }
})

test('malformed input throws instead of returning something', () => {
  for (const bad of ['', 'plaintext', 'p2u.1', 'p2u.1.k', 'p2u.9.k.AAAA', 'x.1.k.AAAA', 'p2u.1.k.###', 'p2u.1.k.AAAA']) {
    assert.throws(() => decrypt(bad, CTX), `accepted ${JSON.stringify(bad)}`)
  }
  assert.throws(() => decrypt(42, CTX))
})

test('null and undefined pass through untouched', () => {
  assert.equal(encrypt(null, CTX), null)
  assert.equal(encrypt(undefined, CTX), null)
  assert.equal(decrypt(null, CTX), null)
  assert.equal(decrypt(undefined, CTX), null)
})

test('encrypt refuses to run without a context', () => {
  for (const context of ['', null, undefined, 42]) {
    assert.throws(() => encrypt('value', context), /context/)
  }
})

test('isEncrypted tells stored values apart from plaintext', () => {
  assert.equal(isEncrypted(encrypt('x', CTX)), true)
  for (const value of ['x', '', null, undefined, 42, 'p2u', 'p2u.2.k.AAA']) assert.equal(isEncrypted(value), false)
})

test('objects round-trip through the JSON helpers', () => {
  const profile = { gpa: 4.4, budget: 12000, languages: [{ name: 'English', level: 'B2' }], note: null }
  assert.deepEqual(decryptJson(encryptJson(profile, CTX), CTX), profile)
})

// ---------- key rotation ----------

test('a key can be rotated without re-encrypting everything at once', () => {
  const oldKey = generateKey(), newKey = generateKey()

  process.env.P2U_KEYS = `k1:${oldKey}`
  reloadKeys()
  const written = encrypt('written before the rotation', CTX)
  assert.match(written, /^p2u\.1\.k1\./)

  // New key first, old key retained.
  process.env.P2U_KEYS = `k2:${newKey},k1:${oldKey}`
  reloadKeys()
  assert.equal(decrypt(written, CTX), 'written before the rotation', 'the old value became unreadable')
  assert.match(encrypt('written after', CTX), /^p2u\.1\.k2\./, 'new writes must use the new key')

  // Once the old key is dropped, values written with it fail loudly.
  process.env.P2U_KEYS = `k2:${newKey}`
  reloadKeys()
  assert.throws(() => decrypt(written, CTX), /not loaded/)
})

test('a key of the wrong size is rejected at load, not at first use', () => {
  process.env.P2U_KEYS = `short:${Buffer.from('too short').toString('base64')}`
  assert.throws(() => reloadKeys(), /32 bytes/)
  process.env.P2U_KEYS = 'missingcolon'
  assert.throws(() => reloadKeys(), /id:base64key/)
})

test('with no key at all, encrypting fails with an actionable message', () => {
  process.env.P2U_KEYS = ''
  reloadKeys()
  assert.equal(encryptionReady(), false)
  assert.throws(() => encrypt('x', CTX), /keygen/)
})

// ---------- blind index ----------

test('a blind index is deterministic and normalised', () => {
  const a = blindIndex('A@Example.com ', 'users.email')
  const b = blindIndex('a@example.com', 'users.email')
  assert.equal(a, b, 'case and surrounding space must not change the index')
  assert.match(a, /^[a-f0-9]{64}$/)
})

test('a blind index differs by value and by context', () => {
  assert.notEqual(blindIndex('a@example.com', 'users.email'), blindIndex('b@example.com', 'users.email'))
  assert.notEqual(blindIndex('a@example.com', 'users.email'), blindIndex('a@example.com', 'users.recovery_email'))
})

test('the blind index is keyed, not a plain hash', () => {
  const first = blindIndex('a@example.com', 'users.email')
  process.env.P2U_INDEX_KEY = generateKey()
  assert.notEqual(blindIndex('a@example.com', 'users.email'), first,
    'changing the key must change the index, or it is just sha256 and offline-guessable')
})

test('blind index comparison rejects mismatched or non-string input', () => {
  const value = blindIndex('a@example.com', 'users.email')
  assert.equal(blindIndexMatches(value, value), true)
  assert.equal(blindIndexMatches(value, blindIndex('b@example.com', 'users.email')), false)
  for (const bad of [null, undefined, 42, '', 'short']) assert.equal(blindIndexMatches(value, bad), false)
})

test('blind index refuses to run without its own key', () => {
  delete process.env.P2U_INDEX_KEY
  assert.throws(() => blindIndex('x', 'users.email'), /P2U_INDEX_KEY/)
})

test('the blind-index key is separate from the encryption key', () => {
  assert.notEqual(process.env.P2U_INDEX_KEY, process.env.P2U_KEYS?.split(':')[1],
    'reusing one key for both purposes links the index to the ciphertext')
})
