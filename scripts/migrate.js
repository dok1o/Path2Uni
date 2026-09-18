// Applies the numbered PostgreSQL migrations exactly once. Railway runs this as a
// pre-deploy command, before the new application instance starts receiving traffic.

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { pool } from '../server/db.js'

const directory = new URL('../database/core/', import.meta.url)
const lockId = 1_902_026

const checksum = text => createHash('sha256').update(text).digest('hex')

async function migrate() {
  const files = (await readdir(directory))
    .filter(file => /^\d+.*\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))

  const client = await pool.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [lockId])
    await client.query(`
      create table if not exists app_schema_migrations (
        filename text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `)

    const applied = await client.query('select filename, checksum from app_schema_migrations')
    const known = new Map(applied.rows.map(row => [row.filename, row.checksum]))

    for (const filename of files) {
      const sql = await readFile(new URL(filename, directory), 'utf8')
      const digest = checksum(sql)
      if (known.get(filename) === digest) continue
      if (known.has(filename)) throw new Error(`Applied migration was modified: ${filename}`)

      console.log(`[migrate] applying ${filename}`)
      try {
        await client.query(sql)
        await client.query(
          'insert into app_schema_migrations (filename, checksum) values ($1, $2)',
          [filename, digest],
        )
      } catch (error) {
        await client.query('rollback').catch(() => {})
        throw error
      }
    }

    console.log(`[migrate] database is current (${files.length} migrations)`)
  } finally {
    await client.query('select pg_advisory_unlock($1)', [lockId]).catch(() => {})
    client.release()
    await pool.end()
  }
}

migrate().catch(error => {
  console.error('[migrate] failed:', error.message)
  process.exitCode = 1
})
