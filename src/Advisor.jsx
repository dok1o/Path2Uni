import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import mascot from './assets/leo-mascot.png'

const arrow = '→'

/** Shown beside every number that came from the demonstration layer, never omitted. */
function DemoBadge({ compact = false }) {
  return <span className={`demo-badge ${compact ? 'compact' : ''}`} title="Demonstration data — confirm on the university’s official page">
    <i>!</i>{compact ? 'demo' : 'Demonstration data · confirm on the official page'}
  </span>
}

function money({ min, max, currency, period }) {
  const format = value => value.toLocaleString('en-US')
  return `${min === 0 ? 'from 0' : format(min)}–${format(max)} ${currency} / ${period}`
}

const GAP_TONE = { clear: 'good', likely: 'good', just: 'warn', plan: 'warn', short: 'bad', unknown: 'warn' }

export default function Advisor({ profile, onCompare, onOpenPlan }) {
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    let alive = true
    fetch('/api/me/diagnosis')
      .then(response => response.json())
      .then(payload => { if (alive) setState({ loading: false, ...payload }) })
      .catch(() => { if (alive) setState({ loading: false, error: 'Could not reach the server.' }) })
    return () => { alive = false }
  }, [profile.id, profile.destination, profile.field, profile.degree, profile.intake, profile.englishLevel])

  const [picked, setPicked] = useState([])
  const toggle = id => setPicked(current =>
    current.includes(id) ? current.filter(item => item !== id) : current.length >= 3 ? current : [...current, id])

  if (state.loading) return <main className="page advisor-page"><div className="auth-booting"><span className="map-spinner"/>Reading your profile…</div></main>
  if (state.error) return <main className="page advisor-page"><div className="auth-booting">{state.error}</div></main>

  const { diagnosis, matches = [] } = state

  return <main className="page advisor-page">
    <section className="advisor-head">
      <div>
        <span className="eyebrow purple">STEP 3 · WHERE YOU STAND</span>
        <h1>Your position,<br/>in plain words.</h1>
        <p>{diagnosis.summary}</p>
      </div>
      <img src={mascot} alt="" className="advisor-mascot"/>
    </section>

    <section className="diagnosis-grid">
      <article className="diagnosis-card good">
        <span className="eyebrow">WHAT YOU HAVE</span>
        <ul>{diagnosis.strengths.map(item => <li key={item}>{item}</li>)}</ul>
      </article>
      <article className="diagnosis-card work">
        <span className="eyebrow">WHAT STANDS BETWEEN</span>
        <ul>{diagnosis.gaps.map(item => <li key={item}>{item}</li>)}</ul>
      </article>
      <article className="diagnosis-card goal">
        <span className="eyebrow">YOUR GOAL</span>
        <p>{diagnosis.goal}</p>
        {diagnosis.englishGap && <span className={`gap-pill ${GAP_TONE[diagnosis.englishGap.status] ?? 'warn'}`}>{diagnosis.englishGap.detail}</span>}
      </article>
    </section>

    <section className="matches-head">
      <div>
        <span className="eyebrow purple">STEP 4 · WHY THESE</span>
        <h2>{matches.length} universities that fit your answers</h2>
        <p>Each one teaches your field, at your level, in a language you can study in.</p>
      </div>
      <div className="compare-bar">
        <span>{picked.length ? `${picked.length} selected` : 'Pick 2 or 3 to compare'}</span>
        <button className="button primary" disabled={picked.length < 2}
          onClick={() => onCompare(matches.filter(match => picked.includes(match.id)))}>
          Compare <span>{arrow}</span>
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
            <h3>{match.name}</h3>
            <button className={`match-pick ${picked.includes(match.id) ? 'on' : ''}`} onClick={() => toggle(match.id)}
              aria-pressed={picked.includes(match.id)} aria-label={`Select ${match.name} to compare`}>
              {picked.includes(match.id) ? '✓' : '+'}
            </button>
          </header>
          <p className="match-why">{match.why}</p>
          {requirements && <dl className="match-facts">
            <div><dt>English</dt><dd>~{requirements.english.test} {requirements.english.band} <DemoBadge compact/></dd></div>
            <div><dt>Tuition</dt><dd>{money(requirements.tuition)} <DemoBadge compact/></dd></div>
            <div><dt>Rounds</dt><dd>{requirements.rounds.map(round => round.name).join(', ')} <DemoBadge compact/></dd></div>
          </dl>}
          <p className="match-watch"><i>!</i>{match.watch}</p>
        </motion.article>
      })}</AnimatePresence>
    </div>

    <footer className="advisor-foot">
      <DemoBadge/>
      <button className="button soft" onClick={onOpenPlan}>See your roadmap <span>{arrow}</span></button>
    </footer>
  </main>
}

/** Stage 5: two or three options side by side on the things that decide between them. */
export function Comparison({ items, onClose }) {
  const rows = useMemo(() => [
    { label: 'City', get: item => item.requirements ? item.name.split(' ').slice(-1)[0] : '—', plain: true },
    { label: 'English usually asked', get: item => item.requirements ? `${item.requirements.english.test} ${item.requirements.english.band}` : '—' },
    { label: 'Tuition', get: item => item.requirements ? money(item.requirements.tuition) : '—' },
    { label: 'Application rounds', get: item => item.requirements ? item.requirements.rounds.map(r => `${r.name}: ${r.opens}–${r.closes}`).join('; ') : '—' },
    { label: 'Documents', get: item => item.requirements ? item.requirements.documents.join(', ') : '—' },
    { label: 'Selectivity', get: item => item.requirements?.selectivity ?? '—' },
    { label: 'Visa note', get: item => item.requirements?.visaNote ?? '—' },
    { label: 'Watch out for', get: item => item.watch, plain: true },
  ], [])

  return <div className="compare-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
    <motion.section className="compare-sheet" role="dialog" aria-modal="true" aria-labelledby="compare-title"
      initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }}>
      <header>
        <div>
          <span className="eyebrow purple">STEP 5 · SIDE BY SIDE</span>
          <h2 id="compare-title">What actually differs</h2>
        </div>
        <button className="exam-close" onClick={onClose} aria-label="Close">×</button>
      </header>

      <div className="compare-scroll">
        <table className="compare-table">
          <thead><tr><th/>{items.map(item => <th key={item.id}>{item.name}</th>)}</tr></thead>
          <tbody>
            {rows.map(row => <tr key={row.label}>
              <th scope="row">{row.label}{row.plain ? null : <DemoBadge compact/>}</th>
              {items.map(item => <td key={item.id}>{row.get(item)}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>

      <footer><DemoBadge/></footer>
    </motion.section>
  </div>
}
