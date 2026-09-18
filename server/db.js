// Connection to path2uni_core. One pool for the process.

import pg from 'pg'
import './env.js'

// A DATE has no time and no zone, but the driver hands back a JS Date at local midnight.
// Converting that to ISO shifts it into the previous day on any positive UTC offset, which
// turned an exam sat on the 14th into the 13th. Take the value as the string Postgres sent.
pg.types.setTypeParser(1082, value => value)

const settings = process.env

// A hosted database hands out one URL instead of five variables, and its certificate is
// signed by a root the platform does not put in the container's trust store. Rejecting it
// would mean no connection at all; accepting it still encrypts the link, which is the part
// that matters over a shared network. Local development keeps the discrete variables.
const hosted = settings.DATABASE_URL
  ? {
    connectionString: settings.DATABASE_URL,
    ssl: settings.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false },
  }
  : {
    host: settings.CORE_DB_HOST || 'localhost',
    port: Number(settings.CORE_DB_PORT || 5432),
    user: settings.CORE_DB_USER || 'path2uni',
    password: settings.CORE_DB_PASSWORD || '',
    database: settings.CORE_DB_NAME || 'path2uni_core',
  }

export const pool = new pg.Pool({
  ...hosted,
  // A Vercel instance is only one of many short-lived database clients. Keeping the
  // per-instance pool at one prevents a burst of functions from exhausting Supabase's
  // shared transaction pooler. The standalone server remains a normal long-lived pool.
  max: Number(settings.DB_POOL_MAX || (settings.VERCEL ? 1 : 8)),
  idleTimeoutMillis: settings.VERCEL ? 5_000 : 30_000,
  connectionTimeoutMillis: 4_000,
  allowExitOnIdle: Boolean(settings.VERCEL),
})

/** What the doctor and the migration runner print, without ever printing a password. */
export const describeConnection = () => settings.DATABASE_URL
  // Greedy up to the final @ in the URL authority. A raw @ inside a mistyped password
  // must never make the rest of that password appear in diagnostics.
  ? `DATABASE_URL → ${String(settings.DATABASE_URL).replace(/\/\/[^/]*@/, '//***@')}`
  : `${settings.CORE_DB_USER || 'path2uni'}@${settings.CORE_DB_HOST || 'localhost'}:${settings.CORE_DB_PORT || 5432}/${settings.CORE_DB_NAME || 'path2uni_core'}`

// An unreachable database must not take the process down; routes report it instead.
pool.on('error', error => console.error('[path2uni] idle postgres client error:', error.message))

export const query = (text, params) => pool.query(text, params)

export async function isReachable() {
  try { await pool.query('select 1'); return true }
  catch { return false }
}
