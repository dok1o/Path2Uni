const PRODUCT_LINKS = [
  { label: 'Home', page: 'home' },
  { label: 'My matches', page: 'advisor' },
  { label: 'My path', page: 'roadmap' },
  { label: 'Decision map', page: 'intel' },
  { label: 'Universities', page: 'universities' },
]

export default function SiteFooter({ onNavigate }) {
  const year = new Date().getFullYear()

  const navigate = page => {
    onNavigate?.(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <footer className="site-footer">
    <div className="footer-grid">
      <section className="footer-brand" aria-label="Path2Uni">
        <div className="footer-logo"><span className="brand-mark">P</span><b>path<span>2</span>uni</b></div>
        <p>A clear path from your university goal to the next practical step.</p>
        <span className="footer-status"><i/>Built for international applicants</span>
      </section>

      <nav className="footer-nav" aria-label="Footer navigation">
        <h2>Explore</h2>
        {onNavigate
          ? PRODUCT_LINKS.map(item => <button type="button" key={item.page} onClick={() => navigate(item.page)}>{item.label}</button>)
          : <>
              <span>University matching</span>
              <span>Admission roadmap</span>
              <span>Decision map</span>
              <span>Leo AI guide</span>
            </>}
      </nav>

      <section className="footer-column">
        <h2>Project</h2>
        <a href="https://github.com/dok1o/Path2Uni" target="_blank" rel="noreferrer">GitHub repository <i>↗</i></a>
        <a href="mailto:aisardugasev@gmail.com">Contact the team</a>
        <p>134 Lyceum, Almaty<br/>with support from FIZTEX</p>
      </section>

      <section className="footer-column footer-team">
        <h2>Team</h2>
        <p><strong>Дугашев Айсар</strong><small>Team lead</small></p>
        <p><strong>Оралхан Нурланды</strong></p>
        <p><strong>Кензин Эльмир</strong></p>
        <p className="footer-mentor"><strong>Игорь Пак</strong><small>Mentor · FIZTEX</small></p>
      </section>
    </div>

    <div className="footer-note">
      <span>Path2Uni helps you organise research; always confirm requirements on the university’s official website.</span>
    </div>

    <div className="footer-bottom">
      <p>© {year} Path2Uni. Student project.</p>
      <p>Almaty, Kazakhstan</p>
    </div>
  </footer>
}
