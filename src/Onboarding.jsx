import { useEffect, useState } from 'react'
import mascot from './assets/leo-mascot.png'

const YEARS = Array.from({ length: 6 }, (_, index) => new Date().getFullYear() + index)

const STEPS = [
  { key: 'destination', title: 'Where do you want to study?', lead: 'You can change this later — nothing here is final.' },
  { key: 'degree', title: 'Which degree are you after?', lead: 'This decides which programmes we look at.' },
  { key: 'field', title: 'What do you want to study?', lead: 'Pick the closest one. Your shortlist comes from this.' },
  { key: 'intake', title: 'When do you want to start?', lead: 'The year you plan to begin your studies.' },
  { key: 'englishLevel', title: 'How is your English right now?', lead: 'Be honest — it only changes what we put in your plan, not whether you belong here.' },
]

export default function Onboarding({ user, onDone }) {
  const [options, setOptions] = useState(null)
  const [answers, setAnswers] = useState({ intake: YEARS[1] })
  const [step, setStep] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/options').then(response => response.json()).then(setOptions)
      .catch(() => setError('Could not load the options. Is the server running?'))
  }, [])

  if (!options) return <div className="auth-booting"><span className="map-spinner"/>Getting things ready…</div>

  const current = STEPS[step]
  const choices = {
    destination: options.destinations.map(item => ({ value: item.iso, label: item.label })),
    degree: options.levels.map(level => ({ value: level, label: level })),
    field: options.fields.map(field => ({ value: field.label, label: field.label })),
    intake: YEARS.map(year => ({ value: year, label: String(year) })),
    englishLevel: options.englishLevels.map(level => ({ value: level, label: level })),
  }[current.key]

  const pick = value => {
    const next = { ...answers, [current.key]: value }
    setAnswers(next)
    setError(null)
    if (step < STEPS.length - 1) setStep(step + 1)
    else submit(next)
  }

  const submit = async final => {
    setBusy(true); setError(null)
    try {
      const response = await fetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(final),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        // The server validates independently; show the first thing it objected to.
        setError(Object.values(payload.errors ?? {})[0] || payload.error || 'Something went wrong')
        return
      }
      onDone(payload.profile)
    } catch {
      setError('Cannot reach the server.')
    } finally { setBusy(false) }
  }

  return <div className="onboarding">
    <header className="onboarding-head">
      <img src={mascot} alt="Leo, the Path2Uni mascot"/>
      <div>
        <span className="eyebrow purple">HI {(user.displayName || user.username).split(/\s+/)[0].toUpperCase()}</span>
        <h1>{current.title}</h1>
        <p>{current.lead}</p>
      </div>
    </header>

    <div className="onboarding-progress" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
      {STEPS.map((item, index) => <i key={item.key} className={index <= step ? 'done' : ''}/>)}
    </div>

    <div className="onboarding-choices">
      {choices.map(choice => <button key={choice.value} disabled={busy}
        className={`choice ${answers[current.key] === choice.value ? 'chosen' : ''}`}
        onClick={() => pick(choice.value)}>{choice.label}</button>)}
    </div>

    {error && <div className="auth-error" role="alert">{error}</div>}

    <footer className="onboarding-foot">
      <button className="auth-swap" onClick={() => setStep(step - 1)} disabled={step === 0 || busy}>← Back</button>
      <span>{busy ? 'Saving…' : `Step ${step + 1} of ${STEPS.length}`}</span>
    </footer>
  </div>
}
