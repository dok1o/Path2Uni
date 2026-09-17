import { useState } from 'react'
import mascot from './assets/leo-mascot.png'

export default function Auth({ onSignedIn }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '', displayName: '' })
  const [error, setError] = useState(null)
  const [field, setField] = useState(null)
  const [busy, setBusy] = useState(false)
  const registering = mode === 'register'

  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }))

  const submit = async event => {
    event.preventDefault()
    setBusy(true); setError(null); setField(null)
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registering ? form : { username: form.username, password: form.password }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) { setError(payload.error || 'Something went wrong'); setField(payload.field ?? null); return }
      onSignedIn(payload.user)
    } catch {
      setError('Cannot reach the server. Is it running?')
    } finally { setBusy(false) }
  }

  const swap = () => {
    setMode(registering ? 'login' : 'register')
    setError(null); setField(null)
  }

  return <div className="auth-screen">
    <div className="auth-art">
      <div className="auth-orbit one"/><div className="auth-orbit two"/>
      <img src={mascot} alt="Leo, the Path2Uni mascot"/>
      <div className="auth-bubble">{registering ? 'Nice to meet you!' : 'Welcome back!'}<span>Your path is waiting.</span></div>
    </div>

    <form className="auth-card" onSubmit={submit}>
      <div className="auth-brand"><span className="brand-mark">P</span>path<span>2</span>uni</div>
      <h1>{registering ? 'Start your path' : 'Sign in'}</h1>
      <p className="auth-lead">{registering
        ? 'Pick a username and a password. No email needed.'
        : 'Pick up where you left off.'}</p>

      <label className={field === 'username' ? 'bad' : ''}>
        <span>Username</span>
        <input value={form.username} onChange={set('username')} autoComplete="username"
          autoFocus required minLength={3} maxLength={32} placeholder="mila" />
      </label>

      {registering && <label>
        <span>Display name <i>optional</i></span>
        <input value={form.displayName} onChange={set('displayName')} autoComplete="name"
          maxLength={80} placeholder="Mila A." />
      </label>}

      <label className={field === 'password' ? 'bad' : ''}>
        <span>Password</span>
        <input type="password" value={form.password} onChange={set('password')}
          autoComplete={registering ? 'new-password' : 'current-password'}
          required minLength={8} placeholder="at least 8 characters" />
      </label>

      {error && <div className="auth-error" role="alert">{error}</div>}

      <button className="button primary auth-submit" type="submit" disabled={busy}>
        {busy ? 'One moment…' : registering ? 'Create my account' : 'Sign in'}
        {!busy && <span>→</span>}
      </button>

      <button className="auth-swap" type="button" onClick={swap}>
        {registering ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
    </form>
  </div>
}
