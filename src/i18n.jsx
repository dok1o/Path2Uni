// Three languages, one dictionary.
//
// The key IS the English string. That has two consequences worth knowing:
//   * English needs no table at all, so the app cannot regress into blank labels;
//   * a string missing from ru or kk falls back to English rather than to a key name.
// The cost is that editing an English string silently drops its translation, so change the
// source string and the two entries together.
//
// Placeholders are {name}. Nothing here interpolates HTML — a translation is plain text.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { LANGS, localeOf, translate } from './locales/index.js'

export { LANGS, localeOf, translate }

const STORAGE_KEY = 'path2uni:lang'
// The product is built for applicants from the CIS, so Russian is the sensible default for
// someone who has expressed no preference. `users.locale` in the database agrees.
const FALLBACK = 'ru'

function readStored() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (LANGS.some(item => item.code === saved)) return saved
    // Nothing chosen yet: honour the browser before falling back.
    const preferred = (navigator.languages ?? [navigator.language ?? '']).map(tag => String(tag).slice(0, 2).toLowerCase())
    return LANGS.find(item => preferred.includes(item.code))?.code ?? FALLBACK
  } catch { return FALLBACK }
}

const Language = createContext({ lang: FALLBACK, setLang: () => {}, t: (text, vars) => translate(FALLBACK, text, vars) })

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(readStored)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* private window */ }
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(() => ({
    lang,
    setLang,
    locale: localeOf(lang),
    t: (text, vars) => translate(lang, text, vars),
    // The map's notes are field lists joined with "·" — 127 combinations of 24 parts. The
    // parts are what belongs in a dictionary; the joining is punctuation.
    tParts: text => String(text ?? '').split('·').map(part => translate(lang, part.trim())).join(' · '),
    // Numbers read differently per language: 1,240 in English, 1 240 in Russian and Kazakh.
    n: value => Number(value ?? 0).toLocaleString(localeOf(lang)),
  }), [lang])

  return <Language.Provider value={value}>{children}</Language.Provider>
}

export const useT = () => useContext(Language)

/** The switcher itself. Small enough to live beside the thing it configures. */
export function LanguageSwitch({ compact = false }) {
  const { lang, setLang, t } = useT()
  return <div className={`lang-switch ${compact ? 'compact' : ''}`} role="group" aria-label={t('Language')}>
    {LANGS.map(item => <button key={item.code} type="button" className={item.code === lang ? 'on' : ''}
      onClick={() => setLang(item.code)} aria-pressed={item.code === lang} title={item.label}>
      {compact ? item.short : item.label}
    </button>)}
  </div>
}
