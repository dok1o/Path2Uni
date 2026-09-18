import { useEffect, useState } from 'react'
import mascot from './assets/leo-mascot.png'

const YEARS = Array.from({ length: 6 }, (_, index) => new Date().getFullYear() + index)

const STEPS = [
  // The only multi-answer step: most applicants are choosing between countries, not from one.
  // Its limit comes from the server with the options, so the two can never drift apart.
  { key: 'destinations', multi: true, title: 'Where do you want to study?', lead: max => `Pick up to ${max}. Choosing more than one is normal — we will show you universities in each and let you compare them.` },
  { key: 'degree', title: 'Which degree are you after?', lead: 'This decides which programmes we look at.' },
  { key: 'field', title: 'What do you want to study?', lead: 'Pick the closest one. Your shortlist comes from this.' },
  { key: 'intake', title: 'When do you want to start?', lead: 'The year you plan to begin your studies.' },
  { key: 'englishLevel', title: 'How is your English right now?', lead: 'Be honest — it only changes what we put in your plan, not whether you belong here.' },
]

/**
 * Also the profile editor: `initial` prefills the answers and `onCancel` turns the first Back
 * into a way out. Re-answering here is what makes the brief's "changing a key answer visibly
 * changes the recommendations" something a person can actually do, rather than a property of
 * a fresh account.
 */
export default function Onboarding({ user, initial, onDone, onCancel }) {
  const [options, setOptions] = useState(null)
  const [answers, setAnswers] = useState(initial
    ? {
      destinations: initial.destinations?.length ? initial.destinations : [initial.destination].filter(Boolean),
      degree: initial.degree, field: initial.field, intake: initial.intake, englishLevel: initial.englishLevel,
    }
    : { intake: YEARS[1], destinations: [] })
  const [step, setStep] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/options').then(response => response.json()).then(setOptions)
      .catch(() => setError('Could not load the options. Is the server running?'))
  }, [])

  if (!options) return <div className="auth-booting"><span className="map-spinner"/>Getting things ready…</div>

  const maxDestinations = options.maxDestinations ?? 3
  const current = STEPS[step]
  const chosen = answers[current.key]
  const isChosen = value => (current.multi ? (chosen ?? []).includes(value) : chosen === value)

  const choices = {
    destinations: options.destinations.map(item => ({ value: item.iso, label: item.label })),
    degree: options.levels.map(level => ({ value: level, label: level })),
    field: options.fields.map(field => ({ value: field.label, label: field.label })),
    intake: YEARS.map(year => ({ value: year, label: String(year) })),
    englishLevel: options.englishLevels.map(level => ({ value: level, label: level })),
  }[current.key]

  // A multi step stays put and waits for Continue; a single-answer step advances on the tap,
  // which is what makes the other four feel like one question at a time rather than a form.
  const pick = value => {
    setError(null)
    if (current.multi) {
      const list = chosen ?? []
      if (!list.includes(value) && list.length >= maxDestinations) {
        setError(`${maxDestinations} countries is the limit — past that it stops being a comparison.`)
        return
      }
      setAnswers({ ...answers, [current.key]: list.includes(value) ? list.filter(item => item !== value) : [...list, value] })
      return
    }
    const next = { ...answers, [current.key]: value }
    setAnswers(next)
    if (step < STEPS.length - 1) setStep(step + 1)
    else submit(next)
  }

  // When every answer is already filled in, Continue on the last-changed step saves rather
  // than marching through the remaining screens.
  const complete = STEPS.every(item => (item.multi ? (answers[item.key] ?? []).length : answers[item.key] != null))

  const advance = () => {
    if (current.multi && !(chosen ?? []).length) { setError('Pick at least one country to aim for.'); return }
    setError(null)
    if (step < STEPS.length - 1) setStep(step + 1); else submit(answers)
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
        <span className="eyebrow purple">{initial ? 'EDIT YOUR ANSWERS' : `HI ${(user.displayName || user.username).split(/\s+/)[0].toUpperCase()}`}</span>
        <h1>{current.title}</h1>
        <p>{typeof current.lead === 'function' ? current.lead(maxDestinations) : current.lead}</p>
      </div>
    </header>

    {initial
      ? <nav className="onboarding-progress jump" aria-label="Jump to a question">
        {/* In edit mode every question is already answered, so the bar shows completeness
            rather than how far along you walked. */}
        {STEPS.map((item, index) => <button key={item.key}
          className={(item.multi ? (answers[item.key] ?? []).length : answers[item.key] != null) ? 'done' : ''}
          onClick={() => { setError(null); setStep(index) }} disabled={busy}
          aria-current={index === step} aria-label={item.title}/>)}
      </nav>
      : <div className="onboarding-progress" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
        {STEPS.map((item, index) => <i key={item.key} className={index <= step ? 'done' : ''}/>)}
      </div>}

    <div className="onboarding-choices">
      {choices.map(choice => <button key={choice.value} disabled={busy}
        className={`choice ${isChosen(choice.value) ? 'chosen' : ''}`}
        aria-pressed={current.multi ? isChosen(choice.value) : undefined}
        onClick={() => pick(choice.value)}>
        {current.multi && isChosen(choice.value) && <i className="choice-order">{(chosen ?? []).indexOf(choice.value) + 1}</i>}
        {choice.label}
      </button>)}
    </div>

    {(current.multi || initial) && <div className="onboarding-continue">
      <span>{current.multi
        ? (chosen ?? []).length
          ? `${(chosen ?? []).length} chosen — the first one is where your roadmap starts`
          : 'Nothing chosen yet'
        : 'Saving rebuilds your plan and your matches.'}</span>
      <div className="onboarding-continue-buttons">
        {step < STEPS.length - 1 && <button className="button soft" onClick={advance}
          disabled={busy || (current.multi && !(chosen ?? []).length)}>Next <span>→</span></button>}
        {initial && complete && <button className="button primary" onClick={() => submit(answers)} disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>}
      </div>
    </div>}

    {error && <div className="auth-error" role="alert">{error}</div>}

    <footer className="onboarding-foot">
      <button className="auth-swap" onClick={() => (step === 0 ? onCancel?.() : setStep(step - 1))}
        disabled={busy || (step === 0 && !onCancel)}>← {step === 0 && onCancel ? 'Cancel' : 'Back'}</button>
      <span>{busy ? 'Saving…' : `Step ${step + 1} of ${STEPS.length}`}</span>
    </footer>
  </div>
}
