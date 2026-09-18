// Connection to path2uni_core. One pool for the process.

import pg from 'pg'
import './env.js'

// A DATE has no time and no zone, but the driver hands back a JS Date at local midnight.
// Converting that to ISO shifts it into the previous day on any positive UTC offset, which
// turned an exam sat on the 14th into the 13th. Take the value as the string Postgres sent.
pg.types.setTypeParser(1082, value => value)

const settings = process.env

export const pool = new pg.Pool({
  host: settings.CORE_DB_HOST || 'localhost',
  port: Number(settings.CORE_DB_PORT || 5432),
  user: settings.CORE_DB_USER || 'path2uni',
  password: settings.CORE_DB_PASSWORD || '',
  database: settings.CORE_DB_NAME || 'path2uni_core',
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 4_000,
})

// An unreachable database must not take the process down; routes report it instead.
pool.on('error', error => console.error('[path2uni] idle postgres client error:', error.message))

export const query = (text, params) => pool.query(text, params)

export async function isReachable() {
  try { await pool.query('select 1'); return true }
  catch { return false }
}
