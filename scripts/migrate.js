// Applies database/core/*.sql in filename order, once each. Run: npm run migrate
//
// The numbered files were built for Docker's /docker-entrypoint-initdb.d, which runs them
// exactly once against a brand-new volume. A hosted database has no such hook and starts
// empty, so something has to apply them — and has to remember which ones it already did,
// because every deploy runs this.
//
// Two rules the files themselves rely on:
//   * Order is filename order. 008 assumes 005 has run.
//   * A file is never edited after it ships; the next number is added instead. That is what
//     makes "applied once, remembered forever" safe.

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import '../server/env.js'
import { pool, query, describeConnection } from '../server/db.js'

const DIR = fileURLToPath(new URL('../database/core/', import.meta.url))

// `ALTER TYPE ... ADD VALUE` cannot share a transaction with anything that uses the new
// value, and on older Postgres cannot be in one at all. Such a file runs unwrapped.
const needsOwnTransaction = sql => /alter\s+type\s+[^;]*add\s+value/i.test(sql)

// Our files carry their own BEGIN/COMMIT in places. Nesting those inside ours would emit a
// warning and, worse, make the outer ROLLBACK a lie.
const stripTransaction = sql => sql
  .replace(/^\s*BEGIN\s*;\s*/im, '')
  .replace(/\s*COMMIT\s*;\s*$/im, '')

/**
 * A database that was set up by hand — every teammate's, and the one Docker built from the
 * init directory — already has all of this. `--baseline` records the files as applied without
 * running them, so the runner can take over from there instead of failing on file one.
 */
const baseline = process.argv.includes('--baseline')

async function main() {
  console.log(`\n${baseline ? 'Baselining' : 'Applying migrations to'} ${describeConnection()}\n`)

  await query(`create table if not exists schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )`)

  const files = (await readdir(DIR)).filter(name => name.endsWith('.sql')).sort()
  const { rows } = await query('select filename from schema_migrations')
  const done = new Set(rows.map(row => row.filename))

  let applied = 0
  for (const file of files) {
    if (done.has(file)) { console.log(`  · ${file} (already applied)`); continue }
    if (baseline) {
      await query('insert into schema_migrations (filename) values ($1) on conflict do nothing', [file])
      applied += 1
      console.log(`  = ${file} (marked as applied, not run)`)
      continue
    }
    const sql = await readFile(join(DIR, file), 'utf8')
    const client = await pool.connect()
    try {
      if (needsOwnTransaction(sql)) {
        await client.query(sql)
        await client.query('insert into schema_migrations (filename) values ($1)', [file])
      } else {
        await client.query('begin')
        await client.query(stripTransaction(sql))
        await client.query('insert into schema_migrations (filename) values ($1)', [file])
        await client.query('commit')
      }
      applied += 1
      console.log(`  ✓ ${file}`)
    } catch (error) {
      await client.query('rollback').catch(() => {})
      console.error(`  ✗ ${file}\n    ${error.message}`)
      // Stopping is the point: a later file assumes this one succeeded.
      throw error
    } finally {
      client.release()
    }
  }

  console.log(applied ? `\n${applied} ${baseline ? 'marked' : 'applied'}.\n` : '\nNothing to apply.\n')
}

main()
  .then(() => pool.end())
  .catch(async error => {
    await pool.end().catch(() => {})
    console.error('\nMigration failed. The database is unchanged past the last ✓ above.')
    console.error(String(error.message))
    process.exit(1)
  })
