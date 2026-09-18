// What the objective and the profile tell us, before any model is involved.
// Shared by the server (to build the prompt) and by the offline fallback planner.

// `iso` links a destination to the curated map data in data/worldUniversities.js.
// `portal` / `extraDoc` are stable procedural facts. No fees, no dates — those need a source and a year.
export const destinations = {
  italy: { iso: 'it', label: 'Italy', portal: 'Universitaly', sources: 12, extraDoc: 'Declaration of Value & sworn translations', earliest: 'November' },
  germany: { iso: 'de', label: 'Germany', portal: 'uni-assist', sources: 14, extraDoc: 'APS certificate & uni-assist pre-check', earliest: 'December' },
  netherlands: { iso: 'nl', label: 'Netherlands', portal: 'Studielink', sources: 11, extraDoc: 'Nuffic diploma evaluation', earliest: 'January' },
  switzerland: { iso: 'ch', label: 'Switzerland', portal: "each university's own portal", sources: 10, extraDoc: 'Recognised secondary certificate & translations', earliest: 'December' },
  hungary: { iso: 'hu', label: 'Hungary', portal: "the university's own portal", sources: 9, extraDoc: 'Apostilled diploma & sworn translation', earliest: 'January' },
  'united kingdom': { iso: 'gb', label: 'United Kingdom', portal: 'UCAS', sources: 15, extraDoc: 'Reference letter & personal statement', earliest: 'October' },
  britain: { iso: 'gb', label: 'United Kingdom', portal: 'UCAS', sources: 15, extraDoc: 'Reference letter & personal statement', earliest: 'October' },
  'united states': { iso: 'us', label: 'United States', portal: 'Common App', sources: 16, extraDoc: 'Transcript evaluation & recommendation letters', earliest: 'November' },
  usa: { iso: 'us', label: 'United States', portal: 'Common App', sources: 16, extraDoc: 'Transcript evaluation & recommendation letters', earliest: 'November' },
  china: { iso: 'cn', label: 'China', portal: "the university's international office", sources: 11, extraDoc: 'Notarised diploma & physical examination form', earliest: 'March' },
  'united arab emirates': { iso: 'ae', label: 'United Arab Emirates', portal: "the university's own portal", sources: 8, extraDoc: 'Attested certificates via the UAE embassy', earliest: 'February' },
  uae: { iso: 'ae', label: 'United Arab Emirates', portal: "the university's own portal", sources: 8, extraDoc: 'Attested certificates via the UAE embassy', earliest: 'February' },
  malaysia: { iso: 'my', label: 'Malaysia', portal: 'EMGS', sources: 9, extraDoc: 'EMGS student pass application', earliest: 'April' },
  france: { iso: null, label: 'France', portal: 'Études en France', sources: 13, extraDoc: 'Campus France interview file', earliest: 'October' },
  spain: { iso: null, label: 'Spain', portal: 'UNEDasiss', sources: 10, extraDoc: 'UNEDasiss accreditation', earliest: 'February' },
  poland: { iso: null, label: 'Poland', portal: 'IRK', sources: 9, extraDoc: 'Apostille & sworn translation', earliest: 'March' },
}

// `tag` is the field slug used by the curated catalogue, so a parsed objective can drive the shortlist.
export const fields = {
  economics: { label: 'Economics & Management', tag: 'business' },
  business: { label: 'Business & Management', tag: 'business' },
  management: { label: 'Economics & Management', tag: 'business' },
  computer: { label: 'Computer Science', tag: 'cs' },
  software: { label: 'Computer Science', tag: 'cs' },
  data: { label: 'Data Science', tag: 'cs' },
  engineering: { label: 'Engineering', tag: 'engineering' },
  design: { label: 'Design', tag: 'design' },
  architecture: { label: 'Architecture', tag: 'architecture' },
  medicine: { label: 'Medicine', tag: 'medicine' },
  law: { label: 'Law', tag: 'law' },
  psychology: { label: 'Psychology', tag: 'psychology' },
}

export const degrees = { bachelor: 'Bachelor', master: 'Master', phd: 'PhD' }

// The objective is free text and the interface is in three languages, so someone typing
// "хочу в Германию на программиста" must be understood as well as the English default.
// These are aliases onto the tables above, never new destinations or fields.
const ALIASES = {
  destinations: {
    герман: 'germany', германи: 'germany', германия: 'germany',
    нидерланд: 'netherlands', голланд: 'netherlands', нидерланды: 'netherlands',
    итали: 'italy', швейцар: 'switzerland', венгри: 'hungary', мадьяр: 'hungary',
    британ: 'united kingdom', англи: 'united kingdom', сша: 'united states', америк: 'united states',
    кита: 'china', оаэ: 'united arab emirates', эмират: 'united arab emirates', малайз: 'malaysia',
    франц: 'france', испан: 'spain', польш: 'poland',
    // қазақша
    германия: 'germany', нидерланд_kk: 'netherlands', италия: 'italy', швейцария: 'switzerland',
    венгрия: 'hungary', ұлыбритания: 'united kingdom', ақш: 'united states', қытай: 'china',
    бае: 'united arab emirates', малайзия: 'malaysia',
  },
  fields: {
    программ: 'computer', информатик: 'computer', компьютер: 'computer', айти: 'computer', 'ит ': 'computer',
    данны: 'data', дата: 'data',
    инженер: 'engineering', техник: 'engineering',
    экономик: 'economics', бизнес: 'business', менеджмент: 'management', управлени: 'management',
    дизайн: 'design', архитектур: 'architecture',
    медицин: 'medicine', врач: 'medicine', доктор: 'medicine',
    юри: 'law', право: 'law', психолог: 'psychology',
    // қазақша
    бағдарламалау: 'computer', ақпарат: 'computer', инженерия: 'engineering',
    экономика: 'economics', дизайны: 'design', сәулет: 'architecture', медицина: 'medicine',
    құқық: 'law', психология: 'psychology', дерек: 'data',
  },
}

/** The label a profile stores, back to the catalogue slug the shortlist filters on. */
const tagForLabel = label => Object.values(fields).find(item => item.label === label)?.tag ?? null

// A C1 speaker already clears most English-taught entry bars; below that the certificate is a real task.
const testExempt = ['c1', 'c2', 'native']

const match = (text, table, aliases) => {
  const direct = Object.keys(table).find(key => text.includes(key))
  if (direct) return direct
  const alias = Object.keys(aliases ?? {}).find(key => text.includes(key))
  return alias ? aliases[alias] : undefined
}

export function readObjective(objective, profile = {}) {
  const text = String(objective || '').toLowerCase()
  // Kept apart on purpose: only what the objective itself names counts towards `matched`.
  const statedKey = match(text, destinations, ALIASES.destinations)
  const destinationKey = statedKey ?? String(profile?.destination || '').toLowerCase()
  const destination = destinations[destinationKey] ?? destinations.italy
  const fieldKey = match(text, fields, ALIASES.fields)
  const degreeKey = match(text, degrees)
  const year = (text.match(/20\d{2}/) ?? [])[0]
  const languages = Array.isArray(profile?.languages) ? profile.languages : []
  const english = languages.find(language => language?.name === 'English')
  const level = english?.level ?? 'unknown'
  return {
    destination,
    field: fieldKey ? fields[fieldKey].label : profile?.field,
    // The tag has to inherit too. It used to stay null whenever the objective did not name a
    // field in English, which silently turned the shortlist's hard field filter off and put
    // any university in the country into the prompt — the "it just lists names" complaint.
    fieldTag: fieldKey ? fields[fieldKey].tag : tagForLabel(profile?.field),
    degree: degreeKey ? degrees[degreeKey] : profile?.degree,
    intake: year ?? profile?.intake,
    englishLevel: level,
    needsTest: !testExempt.includes(level.toLowerCase()),
    // Every signal the objective confirms rather than inherits raises how much of the plan is grounded.
    matched: [statedKey, fieldKey, degreeKey, year].filter(Boolean).length,
  }
}
