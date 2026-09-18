import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import mascot from './assets/leo-mascot.png'
import { useT } from './i18n.jsx'

const arrow = '→'

/** Shown beside every number that came from the demonstration layer, never omitted. */
function DemoBadge({ compact = false }) {
  const { t } = useT()
  return <span className={`demo-badge ${compact ? 'compact' : ''}`} title={t('Demonstration data — confirm on the university’s official page')}>
    <i>!</i>{compact ? t('demo') : t('Demonstration data · confirm on the official page')}
  </span>
}

function money({ min, max, currency, period }, t, n) {
  return `${min === 0 ? t('from 0') : n(min)}–${n(max)} ${currency} / ${t(period)}`
}

/** Which of the chosen countries the shortlist actually reached, in the order they appear. */
const countriesIn = matches => [...new Set(matches.map(match => match.country).filter(Boolean))]

const GAP_TONE = { clear: 'good', likely: 'good', just: 'warn', plan: 'warn', short: 'bad', unknown: 'warn' }

export default function Advisor({ profile, onCompare, onOpenPlan }) {
  const { t, n, lang } = useT()
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    let alive = true
    fetch(`/api/me/diagnosis?lang=${lang}`)
      .then(response => response.json())
      .then(payload => { if (alive) setState({ loading: false, ...payload }) })
      .catch(() => { if (alive) setState({ loading: false, error: 'Could not reach the server.' }) })
    return () => { alive = false }
  }, [lang, profile.id, profile.destination, profile.field, profile.degree, profile.intake, profile.englishLevel])

  const [picked, setPicked] = useState([])
  const toggle = id => setPicked(current =>
    current.includes(id) ? current.filter(item => item !== id) : current.length >= 3 ? current : [...current, id])

  if (state.loading) return <main className="page advisor-page"><div className="auth-booting"><span className="map-spinner"/>{t('Reading your profile…')}</div></main>
  if (state.error) return <main className="page advisor-page"><div className="auth-booting">{t(state.error)}</div></main>

  const { diagnosis, matches = [] } = state

  return <main className="page advisor-page">
    <section className="advisor-head">
      <div>
        <span className="eyebrow purple">{t('STEP 3 · WHERE YOU STAND')}</span>
        <h1>{t('Your position, in plain words.')}</h1>
        <p>{diagnosis.summary}</p>
      </div>
      <img src={mascot} alt="" className="advisor-mascot"/>
    </section>

    <section className="diagnosis-grid">
      <article className="diagnosis-card good">
        <span className="eyebrow">{t('WHAT YOU HAVE')}</span>
        <ul>{diagnosis.strengths.map(item => <li key={item}>{item}</li>)}</ul>
      </article>
      <article className="diagnosis-card work">
        <span className="eyebrow">{t('WHAT STANDS BETWEEN')}</span>
        <ul>{diagnosis.gaps.map(item => <li key={item}>{item}</li>)}</ul>
      </article>
      <article className="diagnosis-card goal">
        <span className="eyebrow">{t('YOUR GOAL')}</span>
        <p>{diagnosis.goal}</p>
        {diagnosis.englishGap && <span className={`gap-pill ${GAP_TONE[diagnosis.englishGap.status] ?? 'warn'}`}>{diagnosis.englishGap.detail}</span>}
      </article>
    </section>

    <section className="matches-head">
      <div>
        <span className="eyebrow purple">{t('STEP 4 · WHY THESE')}</span>
        <h2>{t('{count} universities that fit your answers', { count: matches.length })}</h2>
        <p>{countriesIn(matches).length > 1
          ? t('Each one teaches your field, at your level, in a language you can study in, across {countries}.', { countries: countriesIn(matches).map(name => t(name)).join(', ') })
          : t('Each one teaches your field, at your level, in a language you can study in.')}</p>
      </div>
      <div className="compare-bar">
        <span>{picked.length ? t('{count} selected', { count: picked.length }) : t('Pick 2 or 3 to compare')}</span>
        <button className="button primary" disabled={picked.length < 2}
          onClick={() => onCompare(matches.filter(match => picked.includes(match.id)))}>
          {t('Compare')} <span>{arrow}</span>
        </button>
      </div>
    </section>

    <div className="match-grid">
      <AnimatePresence>{matches.map((match, index) => {
        const requirements = match.requirements
        return <motion.article key={match.id} className={`match-card ${picked.includes(match.id) ? 'picked' : ''}`}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .05 }}>
          <header>
            <span className="match-rank">0{index + 1}</span>
            <div className="match-title">
              <h3>{match.name}</h3>
              {(match.city || match.country) && <small className="match-place">{[match.city, match.country].filter(Boolean).map(part => t(part)).join(', ')}</small>}
              {match.website
                ? <a className="match-site" href={match.website} target="_blank" rel="noreferrer">{t('Official site')} ↗</a>
                : <span className="match-site none">{t('no confirmed address')}</span>}
            </div>
            <button className={`match-pick ${picked.includes(match.id) ? 'on' : ''}`} onClick={() => toggle(match.id)}
              aria-pressed={picked.includes(match.id)} aria-label={t('Select {name} to compare', { name: match.name })}>
              {picked.includes(match.id) ? '✓' : '+'}
            </button>
          </header>
          <p className="match-why">{match.why}</p>
          {requirements && <dl className="match-facts">
            <div><dt>{t('English')}</dt><dd>~{requirements.english.test} {requirements.english.band} <DemoBadge compact/></dd></div>
            <div><dt>{t('Tuition')}</dt><dd>{money(requirements.tuition, t, n)} <DemoBadge compact/></dd></div>
            <div><dt>{t('Rounds')}</dt><dd>{requirements.rounds.map(round => t(round.name)).join(', ')} <DemoBadge compact/></dd></div>
          </dl>}
          <p className="match-watch"><i>!</i>{match.watch}</p>
        </motion.article>
      })}</AnimatePresence>
    </div>

    <footer className="advisor-foot">
      <DemoBadge/>
      <button className="button soft" onClick={onOpenPlan}>{t('See your roadmap')} <span>{arrow}</span></button>
    </footer>
  </main>
}

/** Stage 5: two or three options side by side on the things that decide between them. */
export function Comparison({ items, onClose }) {
  const { t, n } = useT()
  const rows = useMemo(() => [
    { label: 'Where', get: item => [item.city, item.country].filter(Boolean).map(part => t(part)).join(', ') || '—', plain: true },
    { label: 'Official site', get: item => item.website ?? t('no confirmed address'), link: item => item.website, plain: true },
    { label: 'English usually asked', get: item => item.requirements ? `${item.requirements.english.test} ${item.requirements.english.band}` : '—' },
    { label: 'Tuition', get: item => item.requirements ? money(item.requirements.tuition, t, n) : '—' },
    { label: 'Application rounds', get: item => item.requirements ? item.requirements.rounds.map(r => `${t(r.name)}: ${t(r.opens)}–${t(r.closes)}`).join('; ') : '—' },
    { label: 'Documents', get: item => item.requirements ? item.requirements.documents.map(doc => t(doc)).join(', ') : '—' },
    { label: 'Selectivity', get: item => t(item.requirements?.selectivity ?? '—') },
    { label: 'Visa note', get: item => t(item.requirements?.visaNote ?? '—') },
    { label: 'Watch out for', get: item => item.watch, plain: true },
  ], [t, n])

  return <div className="compare-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
    <motion.section className="compare-sheet" role="dialog" aria-modal="true" aria-labelledby="compare-title"
      initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }}>
      <header>
        <div>
          <span className="eyebrow purple">{t('STEP 5 · SIDE BY SIDE')}</span>
          <h2 id="compare-title">{t('What actually differs')}</h2>
        </div>
        <button className="exam-close" onClick={onClose} aria-label={t('Close')}>×</button>
      </header>

      <div className="compare-scroll">
        <table className="compare-table">
          <thead><tr><th/>{items.map(item => <th key={item.id}>{item.name}</th>)}</tr></thead>
          <tbody>
            {rows.map(row => <tr key={row.label}>
              <th scope="row">{t(row.label)}{row.plain ? null : <DemoBadge compact/>}</th>
              {items.map(item => { const href = row.link?.(item); return <td key={item.id}>{href ? <a href={href} target="_blank" rel="noreferrer">{row.get(item)}</a> : row.get(item)}</td> })}
            </tr>)}
          </tbody>
        </table>
      </div>

      <footer><DemoBadge/></footer>
    </motion.section>
  </div>
}
