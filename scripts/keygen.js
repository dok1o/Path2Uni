// Prints fresh keys for .env. Run: npm run keygen
import { generateKey } from '../server/crypto.js'

const id = new Date().toISOString().slice(0, 7).replace('-', '')
console.log(`# Field-encryption keys. Keep these OUT of the database's own backup:
# whoever steals the dump must not also get the key, or the encryption bought nothing.
#
# P2U_KEYS is a comma-separated list of id:base64key. The FIRST entry encrypts new writes;
# older entries stay so values written before a rotation can still be read. To rotate:
# generate a new key, put it first, keep the old one until everything has been re-written.
P2U_KEYS=${id}:${generateKey()}
P2U_INDEX_KEY=${generateKey()}`)
