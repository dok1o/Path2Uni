// npm run doctor — says what is not set up, and what to do about it.
//
// Everything in this app degrades rather than crashes: no Gemini key means plans come from
// the rule-based planner, no database means sign-in returns 503. That is the right behaviour
// in production and the wrong one on a laptop, because "the agent doesn't work" is all you
// see. This prints the reason.

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import '../server/env.js'

const ok = s => `\x1b[32m✓\x1b[0m ${s}`
const bad = s => `\x1b[31m✗\x1b[0m ${s}`
const warn = s => `\x1b[33m!\x1b[0m ${s}`
const hint = s => `    \x1b[2m${s}\x1b[0m`

let blocking = 0
const fail = (line, ...how) => { blocking += 1; console.log(bad(line)); how.forEach(h => console.log(hint(h))) }

console.log('\nPath2Uni — setup check\n')

// --- Node ---
const [major, minor] = process.versions.node.split('.').map(Number)
if (major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19)) {
  console.log(ok(`Node ${process.versions.node}`))
} else {
  fail(`Node ${process.versions.node} is too old — this Vite needs 20.19+ or 22.12+`,
    'Older Node dies at startup on `styleText` from node:util.')
}

// --- dependencies ---
if (!existsSync(new URL('../node_modules/vite', import.meta.url))) {
  fail('Dependencies are not installed', 'npm install')
} else {
  console.log(ok('Dependencies installed'))
}

// --- .env ---
if (!existsSync(new URL('../.env', import.meta.url))) {
  fail('.env is missing — it is gitignored, so a clone never has one',
    'cp .env.example .env',
    'npm run keygen >> .env')
} else {
  console.log(ok('.env present'))
}

// --- the Gemini key: the usual reason "the agent doesn't work" ---
const key = process.env.GEMINI_API_KEY
if (!key || key === 'your_key_here') {
  fail('GEMINI_API_KEY is not set — THIS is why plans and Leo feel generic',
    'Plans fall back to the rule-based planner, Leo answers from the plan only,',
    'and the diagnosis is written from a template. Nothing errors, it just gets duller.',
    'Get a free key at https://aistudio.google.com/apikey and put it in .env as',
    '  GEMINI_API_KEY=...   (no VITE_ prefix: Vite would publish it in the bundle)',
    'Use your own key rather than sharing one — you share the rate limit otherwise.')
} else {
  console.log(ok(`GEMINI_API_KEY set (${key.slice(0, 6)}…)`))
}

// --- encryption keys ---
if (!process.env.P2U_KEYS) {
  fail('P2U_KEYS is not set — field encryption is off', 'npm run keygen >> .env')
} else {
  console.log(ok('Encryption keys set'))
}

// --- Docker and the database ---
let dockerUp = false
try { execSync('docker info', { stdio: 'ignore' }); dockerUp = true; console.log(ok('Docker is running')) }
catch { fail('Docker is not running — sign-in needs Postgres', 'Start Docker Desktop, then: docker compose up -d core-db') }

if (dockerUp) {
  const { isReachable, pool } = await import('../server/db.js')
  if (await isReachable()) {
    console.log(ok(`Postgres reachable on port ${process.env.CORE_DB_PORT || 5432}`))
    // One probe per migration that added something the app now reads. Init scripts run only
    // against a fresh volume, so an existing database silently lacks every later file.
    const { rows } = await pool.query(
      `select count(*) filter (where table_name = 'profile_tests') as m006,
              count(*) filter (where table_name = 'profile_advice') as m007,
              count(*) filter (where table_name = 'applicant_profiles'
                                and column_name = 'target_countries') as m008
         from information_schema.columns where table_schema = 'public'`)
    const missing = [
      Number(rows[0].m006) ? null : '006_profile_tests.sql',
      Number(rows[0].m007) ? null : '007_diagnosis_and_progress.sql',
      Number(rows[0].m008) ? null : '008_multi_destination.sql',
    ].filter(Boolean)
    if (!missing.length) console.log(ok('Migrations applied'))
    else fail(`The database is missing ${missing.length} migration${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
      'Init scripts only run against a fresh volume. Apply them in order, by hand:',
      ...missing.map(file => `  docker compose exec core-db psql -U path2uni -d path2uni_core -f /docker-entrypoint-initdb.d/${file}`))
  } else {
    fail(`Postgres is not answering on port ${process.env.CORE_DB_PORT || 5432}`,
      'docker compose up -d core-db',
      'CORE_DB_PORT defaults to 5442 — 5432 is usually taken by a local Postgres.')
  }
  await pool.end()
}

// --- can the key actually reach Gemini? ---
if (key && key !== 'your_key_here') {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(15_000) })
    if (response.ok) console.log(ok('Gemini answers this key'))
    else if (response.status === 400 || response.status === 403) {
      fail(`Gemini rejected the key (${response.status})`, 'It may be revoked or restricted. Issue a new one in AI Studio.')
    } else {
      console.log(warn(`Gemini answered ${response.status} — usually a transient free-tier hiccup`))
    }
  } catch (error) {
    console.log(warn(`Could not reach Gemini: ${error.message}`))
  }
}

console.log()
if (blocking) {
  console.log(`\x1b[31m${blocking} thing${blocking === 1 ? '' : 's'} to fix.\x1b[0m Fix them and run \`npm run doctor\` again.\n`)
  process.exit(1)
}
console.log('\x1b[32mEverything is set up.\x1b[0m  npm run dev\n')
