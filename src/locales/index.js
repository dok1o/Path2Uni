// The translator itself, with no React in it, so the server can use the same tables the
// browser does: plan task deadlines are generated and stored server-side, and a Russian plan
// with English deadlines is a half-translated plan.

import { RU } from './ru.js'
import { KK } from './kk.js'

export const LANGS = [
  { code: 'ru', label: 'Русский', short: 'RU', locale: 'ru-RU' },
  { code: 'kk', label: 'Қазақша', short: 'ҚАЗ', locale: 'kk-KZ' },
  { code: 'en', label: 'English', short: 'EN', locale: 'en-GB' },
]

const TABLES = { ru: RU, kk: KK, en: {} }

export const localeOf = code => LANGS.find(item => item.code === code)?.locale ?? 'ru-RU'

/** A missing entry returns the English key, so nothing can render blank. */
export function translate(lang, text, vars) {
  const table = TABLES[lang] ?? {}
  let out = table[text] ?? text
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.split(`{${key}}`).join(String(value))
  return out
}
