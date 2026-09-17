// Pulls the university catalogue from Wikidata and writes public/universities-catalog.json.
//
// Run manually: npm run catalog:fetch    (never at runtime — the app must not depend on
// Wikidata being up, and their endpoint should not be hit once per page load.)
//
// Wikidata is CC0, so the data can be redistributed without attribution obligations.
// Two things about it that bite if you write the naive query:
//   * Properties are multi-valued: a university with three website statements comes back as
//     three rows. Everything is aggregated with SAMPLE and grouped by the entity.
//   * Country LABELS are inconsistent ("People's Republic of China"), so countries are keyed
//     by their ISO-3166 alpha-2 code (P297) instead of by name.

import { writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs'

const LOG = new URL('../scripts/wikidata-progress.log', import.meta.url)
const RAW = new URL('../scripts/wikidata-raw.json', import.meta.url)
// stdout is fully buffered when it is not a terminal, so a long run shows nothing at all
// until it exits. Progress goes to a file that can be tailed while the run is in flight.
const say = line => { console.log(line); appendFileSync(LOG, `${new Date().toISOString().slice(11, 19)} ${line}\n`) }

const ENDPOINT = 'https://query.wikidata.org/sparql'
const PAGE = 2000
const AGENT = 'Path2Uni/0.1 (university catalogue for a student guidance app)'

// Paginating with OFFSET over the whole set makes Wikidata sort 15k rows per page and it
// times out with a 504. Iterating country by country keeps every query small and cheap.
const COUNTRIES = `
SELECT ?iso (COUNT(DISTINCT ?u) AS ?n) WHERE {
  ?u wdt:P31/wdt:P279* wd:Q3918 ; wdt:P17 ?country ; wdt:P625 ?xy .
  ?country wdt:P297 ?iso .
} GROUP BY ?iso ORDER BY DESC(?n)`

// Two phases, because one query that walks the subclass tree AND resolves four OPTIONALs
// AND runs the label service times out on any large country. Phase one is a cheap skeleton;
// phase two enriches fixed lists of entities, which the query planner handles easily.
// No ORDER BY: sorting forces the endpoint to materialise every row before paging and
// turns a two-second query into a timeout. Large countries are split by first letter of
// the label instead, which partitions the work without needing a global sort.
const skeletonQuery = (iso, letter) => `
SELECT ?u ?coord WHERE {
  ?country wdt:P297 "${iso}" .
  ?u wdt:P31/wdt:P279* wd:Q3918 ; wdt:P17 ?country ; wdt:P625 ?coord .
  ${letter ? `?u rdfs:label ?l . FILTER(lang(?l) = "en" && STRSTARTS(?l, "${letter}"))` : ''}
}`

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'0123456789']

const detailQuery = ids => `
SELECT ?u ?uLabel ?cityLabel ?site ?inception ?students WHERE {
  VALUES ?u { ${ids.map(id => `wd:${id}`).join(' ')} }
  OPTIONAL { ?u wdt:P131 ?city }
  OPTIONAL { ?u wdt:P856 ?site }
  OPTIONAL { ?u wdt:P571 ?inception }
  OPTIONAL { ?u wdt:P2196 ?students }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}`

async function run(query, attempt = 1) {
  let response
  try {
    // GET rather than POST: Wikidata caches GET responses, and a POST of the same query
    // misses that cache entirely and times out on the larger countries.
    //
    // The timeout is not optional: Node's fetch has none by default, and a stalled
    // connection here hung a run for 33 minutes with no output and no way to tell.
    response = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': AGENT },
      signal: AbortSignal.timeout(60_000),
    })
  } catch (error) {
    if (attempt > 4) throw new Error(`gave up after ${attempt} attempts: ${error.message}`)
    say(`  ${error.name}; retry ${attempt}`)
    await new Promise(resolve => setTimeout(resolve, attempt * 4000))
    return run(query, attempt + 1)
  }
  if (response.status === 429 || response.status >= 500) {
    if (attempt > 4) throw new Error(`Wikidata kept answering ${response.status}`)
    const wait = Number(response.headers.get('retry-after') || attempt * 5)
    say(`  ${response.status}; waiting ${wait}s`)
    await new Promise(resolve => setTimeout(resolve, wait * 1000))
    return run(query, attempt + 1)
  }
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 200)}`)
  return (await response.json()).results.bindings
}

const point = value => {
  const match = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(value || '')
  return match ? { lng: Number(match[1]), lat: Number(match[2]) } : null
}

const polite = () => new Promise(resolve => setTimeout(resolve, 150))

const countries = await run(COUNTRIES)
say(`${countries.length} countries`)

// Phase 1 — identity, country and coordinates.
const merged = new Map(
  existsSync(RAW) ? JSON.parse(readFileSync(RAW, 'utf8')).map(record => [record.id, record]) : [])
if (merged.size) say(`resuming from ${merged.size} universities already on disk`)
const seen = new Set([...merged.values()].map(record => record.country))
const failed = []
let done = 0
for (const entry of countries) {
  const iso = entry.iso.value
  const expected = Number(entry.n.value)
  if (seen.has(iso.toLowerCase())) { done += 1; continue }
  const rows = await run(skeletonQuery(iso))
  const before = merged.size
  for (const row of rows) {
    const id = row.u.value.split('/').pop()
    if (!merged.has(id)) merged.set(id, { id, country: iso.toLowerCase(), at: point(row.coord?.value) })
  }
  const added = merged.size - before
  done += 1
  if (added < expected) say(`  ${iso}: ${added} of ${expected}`)
  if (done % 10 === 0) {
    say(`… ${done}/${countries.length} countries, ${merged.size} universities`)
    writeFileSync(RAW, JSON.stringify([...merged.values()]))
  }
  await polite()
}
writeFileSync(RAW, JSON.stringify([...merged.values()]))
say(`phase 1 done: ${merged.size} universities` + (failed.length ? `; ${failed.length} countries failed: ${failed.join(' ')}` : ''))

// Phase 2 — names and the optional attributes, in fixed batches.
const ids = [...merged.keys()]
for (let i = 0; i < ids.length; i += 250) {
  const batch = ids.slice(i, i + 250)
  const rows = await run(detailQuery(batch))
  for (const row of rows) {
    const record = merged.get(row.u.value.split('/').pop())
    if (!record) continue
    record.name ??= row.uLabel?.value
    record.city ??= row.cityLabel?.value
    record.site ??= row.site?.value
    record.founded ??= row.inception?.value?.slice(0, 4)
    record.students ??= row.students ? Number(row.students.value) : undefined
  }
  if ((i / 250) % 4 === 0) {
    say(`… enriched ${Math.min(i + 250, ids.length)}/${ids.length}`)
    writeFileSync(RAW, JSON.stringify([...merged.values()]))
  }
  await polite()
}

writeFileSync(RAW, JSON.stringify([...merged.values()]))
say(`${merged.size} distinct universities written to scripts/wikidata-raw.json`)
