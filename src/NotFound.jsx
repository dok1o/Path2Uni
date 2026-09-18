import { useEffect } from 'react'
import mascot from './assets/leo-mascot.png'
import SiteFooter from './SiteFooter.jsx'

export default function NotFound() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = '404 — Leo lost the trail | Path2Uni'
    return () => { document.title = previousTitle }
  }, [])

  const goHome = () => window.location.assign('/')

  return <div className="not-found-shell">
    <main className="not-found-page">
      <button className="not-found-brand brand" type="button" onClick={goHome} aria-label="Path2Uni home">
        <span className="brand-mark">P</span><span>path<span>2</span>uni</span>
      </button>

      <section className="not-found-card">
        <div className="not-found-copy">
          <span className="not-found-code">404</span>
          <span className="eyebrow purple">WRONG TURN</span>
          <h1>Leo lost the trail.</h1>
          <p>This page is not on the map. Your university path is still safe — let’s get you back to it.</p>
          <div className="not-found-actions">
            <a className="button primary" href="/">Back to Path2Uni <span>→</span></a>
            <button className="not-found-back" type="button" onClick={() => window.history.back()}>Go back</button>
          </div>
        </div>

        <div className="not-found-leo" aria-label="Leo is looking for the missing page">
          <span className="not-found-orbit orbit-one"/><span className="not-found-orbit orbit-two"/>
          <span className="not-found-star star-one">✦</span><span className="not-found-star star-two">✦</span>
          <img src={mascot} alt="Leo, the Path2Uni mascot"/>
          <p>Hmm… this path ends here.</p>
        </div>
      </section>
    </main>
    <SiteFooter onNavigate={goHome}/>
  </div>
}
