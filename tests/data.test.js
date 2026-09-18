import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { geoBounds, geoContains } from 'd3-geo'
import { feature } from 'topojson-client'
import {
  FIELDS, countries, cities, universities, catalogCounts, catalogTotal,
  cityById, countryByIso, curatedIsos, citiesOf, universitiesOf, universitiesIn,
  cityLoad, shortlistUniversities,
} from '../src/data/worldUniversities.js'

const LEVELS = ['bachelor', 'master', 'phd']

test('every university points at a city that exists', () => {
  for (const uni of universities) {
    assert.ok(cityById[uni.city], `${uni.name} references unknown city "${uni.city}"`)
  }
})

test('a university and its city agree on the country', () => {
  for (const uni of universities) {
    assert.equal(cityById[uni.city].country, uni.country,
      `${uni.name} is in country ${uni.country} but city ${uni.city} is in ${cityById[uni.city].country}`)
  }
})

test('no city is a dead pin', () => {
  for (const city of cities) {
    assert.ok(universitiesIn(city.id).length > 0, `${city.name} has no universities and would render an empty pin`)
  }
})

test('university ids are unique', () => {
  const ids = universities.map(uni => uni.id)
    assert.equal(new Set(ids).size, ids.length,
      `duplicate ids: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`)
})

test('university names are unique within a country', () => {
  for (const { iso } of countries) {
    const names = universitiesOf(iso).map(uni => uni.name)
    assert.equal(new Set(names).size, names.length, `duplicate name in ${iso}`)
  }
})

test('field, level and language vocabularies are closed', () => {
  for (const uni of universities) {
    assert.ok(uni.fields.length > 0, `${uni.name} has no fields`)
    for (const field of uni.fields) assert.ok(FIELDS.includes(field), `${uni.name}: unknown field "${field}"`)
    assert.ok(uni.levels.length > 0, `${uni.name} has no levels`)
    for (const level of uni.levels) assert.ok(LEVELS.includes(level), `${uni.name}: unknown level "${level}"`)
    assert.ok(uni.langs.length > 0, `${uni.name} has no language of instruction`)
    for (const lang of uni.langs) assert.match(lang, /^[a-z]{2}$/, `${uni.name}: bad language code "${lang}"`)
  }
})

test('no curated record smuggles in money, dates or admission rates', () => {
  // database/README.md: time-sensitive facts need a source_id and a year. They do not belong here.
  const banned = ['tuition', 'fee', 'cost', 'deadline', 'acceptance', 'scholarship', 'price', 'eur', 'usd']
  for (const uni of universities) {
    for (const key of Object.keys(uni)) {
      assert.ok(!banned.includes(key.toLowerCase()), `${uni.name} carries a "${key}" field`)
    }
  }
})

test('websites, when present, are real https URLs', () => {
  for (const uni of universities.filter(u => u.web)) {
    assert.doesNotThrow(() => new URL(uni.web), `${uni.name}: unparseable url ${uni.web}`)
    assert.match(uni.web, /^https?:\/\//, `${uni.name}: ${uni.web}`)
  }
})

test('coordinates are valid and sit in the country they claim', async () => {
  // Catches the errors that matter and that no one would spot in the UI: a city filed under
  // the wrong country, or latitude and longitude typed the wrong way round. Strict polygon
  // containment is too harsh here — the 110m shapes are coarse, so genuine border cities
  // (Aachen, Maastricht, Enschede, Geneva, Lugano) fall just outside their own outline.
  // The app's own map now uses the teammates' 50m data; this 110m file is kept because it
  // is what makes this check possible, and 108KB is a cheap price for catching a city filed
  // under the wrong country.
  const topo = JSON.parse(await readFile(new URL('../public/world-countries-110m.json', import.meta.url), 'utf8'))
  const shapes = feature(topo, topo.objects.countries).features
  const byIso = Object.fromEntries(shapes.filter(s => s.properties.iso).map(s => [s.properties.iso, s]))
  const MARGIN = 1.5 // degrees, roughly 165km — far less than any wrong-country mistake

  const farAway = []
  let contained = 0
  for (const city of cities) {
    assert.ok(city.lat >= -90 && city.lat <= 90, `${city.name}: latitude ${city.lat}`)
    assert.ok(city.lng >= -180 && city.lng <= 180, `${city.name}: longitude ${city.lng}`)
    const shape = byIso[city.country]
    assert.ok(shape, `no map shape for country ${city.country}`)

    if (geoContains(shape, [city.lng, city.lat])) { contained += 1; continue }
    const [[west, south], [east, north]] = geoBounds(shape)
    const near = city.lng >= west - MARGIN && city.lng <= east + MARGIN
      && city.lat >= south - MARGIN && city.lat <= north + MARGIN
    if (!near) farAway.push(`${city.name} (${city.country}) at ${city.lat},${city.lng}`)
  }

  assert.deepEqual(farAway, [], `cities nowhere near the country they claim:\n  ${farAway.join('\n  ')}`)
  const ratio = contained / cities.length
  assert.ok(ratio > 0.9, `only ${(ratio * 100).toFixed(0)}% of cities fall inside their country outline`)
})

// Two border cities land on the wrong side of the 110m outline. Both were checked against the
// 50m outline, where they sit correctly inside their own country — the coordinates are right and
// the shipped map is simply too coarse there. Anything else appearing here is a real mistake.
const BORDER_ARTEFACTS = new Set(['enschede', 'lugano'])

test('no city is inside a different curated country', async () => {
  // A stronger form of the same worry: Milan filed under Switzerland would pass a bbox check.
  const topo = JSON.parse(await readFile(new URL('../public/world-countries-110m.json', import.meta.url), 'utf8'))
  const shapes = feature(topo, topo.objects.countries).features
    .filter(shape => curatedIsos.has(shape.properties.iso))
  for (const city of cities.filter(city => !BORDER_ARTEFACTS.has(city.id))) {
    const wrong = shapes.find(shape => shape.properties.iso !== city.country && geoContains(shape, [city.lng, city.lat]))
    assert.equal(wrong, undefined,
      `${city.name} is filed under ${city.country} but sits inside ${wrong?.properties.iso}`)
  }
})

test('the border-artefact allowlist stays honest', () => {
  // If a listed city is ever moved or removed, the exemption must go with it.
  for (const id of BORDER_ARTEFACTS) assert.ok(cityById[id], `allowlisted city "${id}" no longer exists`)
})

test('every curated country is drawable on the map', async () => {
  const topo = JSON.parse(await readFile(new URL('../public/world-countries-110m.json', import.meta.url), 'utf8'))
  const isos = new Set(feature(topo, topo.objects.countries).features.map(s => s.properties.iso))
  for (const { iso, name } of countries) assert.ok(isos.has(iso), `${name} (${iso}) has no shape on the map`)
})

test('countries, lookups and derived views agree with each other', () => {
  assert.equal(curatedIsos.size, countries.length)
  for (const { iso } of countries) {
    assert.ok(countryByIso[iso], `countryByIso missing ${iso}`)
    assert.ok(citiesOf(iso).length > 0, `${iso} has no cities`)
    assert.ok(universitiesOf(iso).length > 0, `${iso} has no universities`)
  }
  assert.equal(cityLoad.length, cities.length)
  assert.equal(cityLoad.reduce((sum, city) => sum + city.count, 0), universities.length,
    'cityLoad counts do not add up to the university total')
})

test('catalogTotal is the real total, not the ISO-mapped subset', async () => {
  const catalog = JSON.parse(await readFile(new URL('../public/universities-catalog.json', import.meta.url), 'utf8'))
  assert.equal(catalogTotal, catalog.universities.length)
  const summed = Object.values(catalogCounts).reduce((sum, n) => sum + n, 0)
  assert.ok(summed <= catalogTotal, 'per-country counts exceed the total')
  assert.ok(catalogTotal > 10_000, `catalogue shrank to ${catalogTotal}`)
})

test('shortlist filters by country, level and language', () => {
  const dutch = shortlistUniversities({ country: 'nl', field: 'cs', level: 'bachelor', lang: 'en' })
  assert.ok(dutch.length > 0)
  for (const uni of dutch) {
    assert.equal(uni.country, 'Netherlands')
    assert.ok(uni.levels.includes('bachelor'))
    assert.ok(uni.languages.includes('en'))
    assert.ok(uni.fields.includes('cs'), `${uni.name} does not teach cs`)
  }
})

test('shortlist respects its limit and never exceeds the pool', () => {
  assert.equal(shortlistUniversities({ country: 'us', limit: 3 }).length, 3)
  const hungary = shortlistUniversities({ country: 'hu', field: 'medicine', limit: 50 })
  assert.ok(hungary.length <= universitiesOf('hu').length)
  assert.ok(hungary.length > 0)
})

test('shortlist returns nothing for an unknown country instead of everything', () => {
  assert.equal(shortlistUniversities({ country: 'zz' }).length, 0)
})

test('shortlist exposes only display-safe fields', () => {
  const [first] = shortlistUniversities({ country: 'it', limit: 1 })
  assert.deepEqual(Object.keys(first).sort(),
    ['city', 'country', 'fields', 'languages', 'levels', 'name', 'website'])
})

test('several countries are interleaved, not concatenated', () => {
  const picked = shortlistUniversities({ countries: ['de', 'nl', 'it'], limit: 6 })
  assert.equal(picked.length, 6)
  // The whole point: three chosen countries must produce three countries, not the six
  // best-scoring universities of whichever one sorts first.
  assert.equal(new Set(picked.map(item => item.country)).size, 3)
  assert.deepEqual(picked.slice(0, 3).map(item => item.country),
    picked.slice(3, 6).map(item => item.country), 'rounds keep the chosen order')
})

test('a country with nothing to offer does not shrink the shortlist', () => {
  // 'jp' is not in the curated layer, so its queue is empty from the first round.
  const picked = shortlistUniversities({ countries: ['de', 'jp'], limit: 5 })
  assert.equal(picked.length, 5)
  assert.ok(picked.every(item => item.country === 'Germany'))
})

test('a single country still filters exactly as before', () => {
  const asList = shortlistUniversities({ countries: ['nl'], field: 'cs', limit: 4 })
  const asScalar = shortlistUniversities({ country: 'nl', field: 'cs', limit: 4 })
  assert.deepEqual(asList, asScalar)
  assert.ok(asList.length > 0)
})

test('the field stays a hard filter across every chosen country', () => {
  const picked = shortlistUniversities({ countries: ['de', 'nl', 'hu'], field: 'med', limit: 9 })
  assert.ok(picked.every(item => item.fields.includes('med')),
    'a university that does not teach the subject is not a match in any country')
})
