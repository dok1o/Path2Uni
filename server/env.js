// Loads .env into process.env once, so every module reads configuration the same way.
// There is no dotenv dependency and this project needs about six variables.
//
// Real environment variables always win: in production there is no .env file, and a
// deployment must be able to inject secrets without one.

import { readFileSync } from 'node:fs'

let loaded = false

export function loadEnv(path = new URL('../.env', import.meta.url)) {
  if (loaded) return process.env
  loaded = true
  let text
  try { text = readFileSync(path, 'utf8') }
  catch { return process.env } // no .env — the process environment is all there is
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    const [, key, raw] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = raw.trim().replace(/^["'](.*)["']$/, '$1')
  }
  return process.env
}

loadEnv()
