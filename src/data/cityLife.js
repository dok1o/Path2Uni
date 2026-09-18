// What a city is like to live in, for the panel behind "What's on in <city>".
//
// Two layers, and the difference is the whole point:
//
//   * REAL — the universities in that city and their official sites, straight from the
//     curated catalogue. Clickable, checkable, ours.
//   * DEMONSTRATION — the activity categories below. They describe what to go looking for
//     in a university city, never a named venue and never a date. A club that closed or a
//     concert that already happened sends a student somewhere for nothing and never tells
//     them, which is exactly the failure this project refuses everywhere else.
//
// public/city-life.json is the editable override, one entry per city id. Fill in a city and
// it replaces the generic categories for that city alone. Anything written there is still
// demonstration data and still carries the badge — until an entry can name a source and a
// date it was checked, it is not a fact.

export const CITY_LIFE_EVIDENCE = 'demo'

/** Generic categories: true of university cities in general, specific to none. */
const CATEGORIES = [
  { icon: '♣', title: 'Student clubs and societies', text: 'Every university here runs its own societies — sport, robotics, debate, volunteering. They are listed on the university’s own site and are the fastest way to meet people in the first month.' },
  { icon: '♪', title: 'Live music and nightlife', text: 'University cities keep small venues alive year-round, and most run student nights midweek. Check the venue’s own page for the current programme.' },
  { icon: '▤', title: 'Museums and galleries', text: 'Student cards usually cut entry to national museums sharply, and some days are free. The card is issued at enrolment.' },
  { icon: '⚑', title: 'Sport and the outdoors', text: 'University sports centres are open to all enrolled students, normally for a small annual fee, and city clubs take beginners.' },
  { icon: '✦', title: 'Festivals and student weeks', text: 'Most universities open the year with a welcome week and run a spring festival. Dates move every year — take them from the university calendar.' },
  { icon: '☕', title: 'Everyday life', text: 'Student districts sit near the campuses: cheaper rent, canteens, late libraries. Ask the student union which streets before signing anything.' },
]

let overrides = null
/** Loaded once, at runtime, so the team can edit the JSON without a rebuild. */
export async function loadCityLife() {
  if (overrides) return overrides
  try {
    const response = await fetch('/city-life.json')
    overrides = response.ok ? await response.json() : {}
  } catch { overrides = {} }
  return overrides
}

export const cityId = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Everything the panel shows for one city. `universities` is real; `items` is demonstration
 * data, whether it came from the override file or from the generic list.
 */
export function cityLife(city, country, table = {}) {
  const entry = table[cityId(city.name)] ?? null
  return {
    tags: entry?.tags ?? (city.note ? city.note.split('·').map(part => part.trim()).filter(Boolean) : []),
    items: entry?.items?.length ? entry.items : CATEGORIES,
    universities: (city.universities ?? []).map(uni => ({ name: uni.name, focus: uni.focus, web: uni.web ?? null })),
    country: country.name,
    evidence: CITY_LIFE_EVIDENCE,
  }
}
