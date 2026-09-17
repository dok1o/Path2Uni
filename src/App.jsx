import { useEffect, useState } from 'react'
import mascot from './assets/leo-mascot.png'
import { cloneAdmissionPlan } from './data/admissionGraph.js'
import WorldMap from './WorldMap.jsx'
import Auth from './Auth.jsx'
import Onboarding from './Onboarding.jsx'
import { countries, countryByIso, cityById, citiesOf, universitiesOf, universitiesIn, catalogCounts, catalogTotal, FIELD_LABELS } from './data/worldUniversities.js'

const icons = {
  home: '⌂', path: '⌁', search: '◌', uni: '⌘', friends: '♧', profile: '◉', bell: '♢',
  chevron: '›', check: '✓', lock: '•', arrow: '→', spark: '✦', book: '▤', target: '◎',
}

function TaskIcon({ type }) {
  if (type === 'documents') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M10 12h5M10 16h5"/></svg>
  if (type === 'application') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m1 1h11l-2 4 2 4H6"/><path d="M9 17l2 2 5-6"/></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="5"/><path d="m14 14 6 6M7 10h6M10 7v6"/></svg>
}

function NavItem({ item, active, onClick }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span>{icons[item.icon]}</span>{item.label}</button>
}

function GamePath({ setChatOpen, plan, setPage, focusTask, setFocusTask }) {
  // The selected level is the same thing as the selected node on the Decision Map, so it
  // lives in App and both pages read it. Falling back to the first task keeps a stale id
  // (from an older plan) from emptying the panel.
  const selectedId = plan.tasks.some(task => task.id === focusTask) ? focusTask : plan.tasks[0].id
  const selected = plan.tasks.findIndex(task => task.id === selectedId) + 1
  const setSelected = index => setFocusTask(plan.tasks[index - 1]?.id ?? plan.tasks[0].id)
  const levels = plan.tasks.map((task,index) => ({ ...task, taskId:task.id, id:index + 1, side:index % 2 ? 'right' : 'left', sub:task.due, top:16 + index * (68 / Math.max(plan.tasks.length - 1, 1)) }))
  const trail = levels.map((level,index) => { const x = level.side === 'left' ? 29 : 70; if (!index) return `M${x} ${level.top}`
    const prev = levels[index - 1], px = prev.side === 'left' ? 29 : 70, bend = px < x ? 26 : -26, lift = (level.top - prev.top) * .35
    return `C${px + bend} ${prev.top + lift} ${x - bend} ${level.top - lift} ${x} ${level.top}` }).join(' ')
  const midpoint = (a,b) => `${(levels[a].top + levels[b].top) / 2}%`
  const active = levels.find(level => level.id === selected) ?? levels[0]
  return <main className="page game-page"><section className="game-head"><div><span className="eyebrow purple">MY PATH · AI-GENERATED</span><h1>Your next chapter<br/>starts here.</h1><p>The task order comes from your profile, verified OSINT research and admission goals.</p><div className="ai-task-types">{['research','documents','application'].map(type => <span key={type}><i><TaskIcon type={type}/></i>{type}</span>)}</div></div><button className="game-leo-tip" onClick={() => setChatOpen(true)}><img src={mascot} alt="Leo mascot"/><span><b>Leo’s hint</b><small>Small actions create momentum.</small></span><i>{icons.chevron}</i></button></section><section className="game-meta"><div><span className="game-stat-icon">✦</span><b>1,240</b><small>XP earned</small></div><div><span className="game-stat-icon fire">♨</span><b>7 days</b><small>current streak</small></div><div><span className="game-stat-icon gem">◆</span><b>{levels.length}</b><small>AI tasks</small></div><div><span className="game-stat-icon energy">⚡</span><b>0 / {levels.length}</b><small>tasks done</small></div></section><section className="game-map-shell"><div className="game-map-title"><span>AI ROADMAP · VERSION 01</span><h2>Research to application</h2><small>Built from your Decision Map</small></div><div className="game-map"><svg className="game-line" viewBox="0 0 100 100" preserveAspectRatio="none"><path d={trail}/></svg>{levels.map((level,index) => <button key={level.id} style={{top:`${level.top}%`}} className={`game-level ${level.state} ${level.side} ${selected === level.id ? 'selected' : ''}`} onClick={() => setSelected(level.id)}><span className="level-disc"><i><TaskIcon type={level.type}/></i><b>{level.id}</b></span><span className="level-label"><strong>{level.shortTitle}</strong><small>{level.sub}</small></span></button>)}{levels.length > 1 && <div className="path-reward reward-one" style={{left:'58%',top:midpoint(0,1)}}>♜<small>+ {levels[0].xp} XP</small></div>}{levels.length > 2 && <div className="path-reward reward-two" style={{left:'38%',top:midpoint(levels.length - 2, levels.length - 1)}}>✉<small>AI task</small></div>}</div><aside className="level-panel"><span className="panel-kicker">AI TASK · {active.id} OF {levels.length}</span><div className={`panel-task-icon ${active.type}`}><TaskIcon type={active.type}/></div><h2>{active.title}</h2><p>{active.description}</p><div className="level-quests">{active.subtasks.map((task,i) => <div key={task} className={active.state === 'current' && i === 0 ? 'quest complete' : 'quest'}><i>{active.state === 'current' && i === 0 ? '✓' : i + 1}</i><span>{task}</span>{i === 0 && <b>+{Math.round(active.xp/3)} XP</b>}</div>)}</div><div className="panel-actions"><button className="button primary" onClick={() => setChatOpen(true)}>{active.state === 'locked' ? 'Ask Leo about this' : 'Continue task'} <span>{icons.arrow}</span></button><button className="button soft" onClick={() => { setFocusTask(active.taskId); setPage('intel') }}>Why this step? <span>{icons.search}</span></button></div></aside></section></main>
}

function Profile({ user, profile }) {
  const sections = [['About you','Personal details, education and language'],['Your goals','Country, programme and intended start date'],['Your strengths','Activities, awards and portfolio']]
  return <main className="page profile-page"><section className="profile-hero"><div className="profile-avatar">{(user.displayName || user.username).trim().charAt(0).toUpperCase()}</div><div><span className="eyebrow purple">MY PROFILE</span><h1>{user.displayName || user.username}</h1><p>{profile.destinationLabel} · {profile.degree} · {profile.intake} intake</p></div><button className="button soft">Edit profile <span>✎</span></button></section><section className="profile-progress"><div><span className="eyebrow">PROFILE COMPLETION</span><h2>68% complete</h2><p>Just a few details left before Leo can tailor every recommendation.</p></div><div className="progress-circle"><b>68%</b></div></section><section className="profile-grid"><div className="profile-sections">{sections.map((section,index) => <button className="profile-section" key={section[0]}><span className="profile-number">0{index + 1}</span><span><h3>{section[0]}</h3><p>{section[1]}</p></span><i>{icons.chevron}</i></button>)}</div><aside className="profile-next"><img src={mascot} alt="Leo mascot"/><span className="eyebrow purple">NEXT BEST STEP</span><h3>Tell us about your academic results</h3><p>It takes about 3 minutes and improves your university matches.</p><button className="button dark">Complete now <span>{icons.arrow}</span></button></aside></section></main>
}

function Greeting({ setChatOpen, name }) {
  return <section className="greeting-card">
    <div className="greeting-copy"><span className="eyebrow purple">TUESDAY, 17 SEPTEMBER</span><h1>Good morning, {name} <span>✦</span></h1><p>You’re doing brilliantly. One small task today brings your Italian dream closer.</p><div className="daily-action"><div className="action-icon">✉</div><div><small>TODAY’S QUEST · 8 MIN</small><strong>Tell us what makes you curious</strong><span>Start your profile story to unlock tailored university matches.</span></div><button className="button dark" onClick={() => setChatOpen(true)}>Start <span>{icons.arrow}</span></button></div></div>
    <div className="mascot-scene"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="mascot-bubble">You’ve got this!<br/><span>Let’s take one step.</span></div><img src={mascot} alt="Leo, the Path2Uni mascot" className="mascot"/></div>
  </section>
}

function Stat({ icon, value, label, note, className = '' }) { return <article className={`stat-card ${className}`}><div className="stat-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span>{note && <small>{note}</small>}</div></article> }

function HomeQuestPath({ setPage }) {
  const steps = [
    { id: 1, icon: '✓', label: 'Destination', state: 'done' },
    { id: 2, icon: '✓', label: 'Programme', state: 'done' },
    { id: 3, icon: '✦', label: 'Your profile', state: 'active' },
    { id: 4, icon: 'A', label: 'IELTS plan', state: 'locked' },
  ]
  return <article className="home-game-card"><div className="home-game-head"><div><span className="eyebrow purple">TODAY ON YOUR PATH</span><h2>Three quests to level up</h2></div><div className="reward-chip">◆ +120 XP</div></div><div className="home-quest-track">{steps.map((step,index) => <div className={`home-quest ${step.state}`} key={step.id}>{index < steps.length - 1 && <i className="quest-rail"/>}<button onClick={() => setPage('roadmap')}><span>{step.state === 'locked' ? '⌑' : step.icon}</span><b>{step.id}</b></button><small>{step.label}</small></div>)}</div><div className="home-active-quest"><span className="mini-gem">✦</span><div><small>ACTIVE QUEST · 4 MIN</small><strong>Add your latest academic result</strong><p>Complete it to unlock your personalised IELTS plan.</p></div><button className="button primary" onClick={() => setPage('roadmap')}>Play <span>{icons.arrow}</span></button></div></article>
}

function Dashboard({ setChatOpen, setPage, name }) {
  return <main className="page dashboard-page"><Greeting setChatOpen={setChatOpen} name={name}/><section className="stats-row"><Stat icon="⚡" value="7 days" label="Current streak" note="Your longest: 12 days" className="orange"/><Stat icon="✦" value="1,240" label="Your XP" note="Top 18% this month" className="violet"/><Stat icon="◒" value="2 / 9" label="Stages complete" note="One task away from 3" className="blue"/></section><section className="dash-grid"><HomeQuestPath setPage={setPage}/><aside className="side-stack"><article className="deadline-card"><div className="card-top"><span className="warning-dot">!</span><span>UPCOMING DEADLINE</span><button>•••</button></div><h3>Complete your profile</h3><p>It helps Leo make your roadmap personal.</p><div className="deadline-bottom"><strong>5 days left</strong><button className="round-arrow" onClick={() => setPage('roadmap')}>{icons.arrow}</button></div></article><article className="friend-card"><div className="card-top"><span>YOUR CREW</span><button className="text-button" onClick={() => setPage('friends')}>See all</button></div><div className="avatars"><span className="avatar a1">A</span><span className="avatar a2">L</span><span className="avatar a3">N</span><span className="avatar a4">+4</span></div><p><b>Amir</b> just completed “Choose your test”. Send a high-five!</p><button className="high-five">✋ Send a high-five</button></article></aside></section></main>
}

function OSINT({ setPage, plan, onGenerate, profile, focusNode, setFocusNode }) {
  // Shared with My Path: selecting a task node here and selecting a level there are the
  // same act, seen from two sides.
  const selectedId = plan.graph.nodes.some(node => node.id === focusNode) ? focusNode : plan.tasks[0].id
  const setSelectedId = setFocusNode
  const [objective, setObjective] = useState(`Find the best ${profile.field} ${profile.degree} programmes in ${profile.destinationLabel} for ${profile.intake} and build my application plan`)
  const [isGenerating, setIsGenerating] = useState(false)
  const nodes = plan.graph.nodes
  const selected = nodes.find(node => node.id === selectedId) ?? nodes[0]
  const connectedIds = plan.graph.edges.filter(edge => edge.includes(selected.id)).flat().filter(id => id !== selected.id)
  const runGeneration = async () => { setIsGenerating(true); const next = await onGenerate(objective); setIsGenerating(false); setSelectedId(next.tasks[0].id) }
  return <main className="page osint-page"><section className="osint-hero"><div><span className="eyebrow purple">AI + OSINT ADMISSION ENGINE</span><h1>From your goal<br/>to a verified action graph.</h1><p>Your profile gives context. OSINT adds evidence. AI turns both into ordered tasks in My Path.</p></div><div className="ai-ready"><i>✦</i><span><b>AI-ready structure</b><small>Mock service connected · API contract prepared</small></span></div></section><section className="osint-pipeline"><div className="pipeline-step complete"><i>1</i><span><b>Profile</b><small>Goals & background</small></span></div><em>→</em><div className="pipeline-step complete"><i>2</i><span><b>OSINT research</b><small>Verified sources</small></span></div><em>→</em><div className="pipeline-step active"><i>3</i><span><b>AI graph</b><small>Logic & dependencies</small></span></div><em>→</em><div className="pipeline-step"><i>4</i><span><b>My Path</b><small>Sequential tasks</small></span></div></section><section className="osint-control"><div><span className="control-label">YOUR ADMISSION OBJECTIVE</span><textarea value={objective} onChange={event => setObjective(event.target.value)} aria-label="Admission objective"/><div className="profile-context">{[profile.destinationLabel, profile.degree, profile.field, `${profile.intake} intake`, `English ${profile.englishLevel}`].map(chip => <span key={chip}>{chip}</span>)}</div></div><button className={`button primary generate-button ${isGenerating ? 'loading' : ''}`} disabled={isGenerating || !objective.trim()} onClick={runGeneration}>{isGenerating ? <><i/>Researching sources…</> : <>Generate graph <span>✦</span></>}</button></section><section className="osint-workspace"><article className="osint-graph-card"><div className="graph-toolbar"><div><span className="eyebrow purple">LIVE KNOWLEDGE GRAPH</span><h2>Admission intelligence</h2></div><div className="source-health"><i/>{plan.sourceCount} sources verified</div></div><div className="osint-canvas"><svg viewBox="0 0 100 100" preserveAspectRatio="none">{plan.graph.edges.map(([from,to]) => { const a=nodes.find(n=>n.id===from); const b=nodes.find(n=>n.id===to); return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/> })}</svg>{nodes.map(node => <button key={node.id} onClick={() => setSelectedId(node.id)} style={{left:`${node.x}%`,top:`${node.y}%`}} className={`osint-node ${node.type} ${node.taskType || ''} ${selected.id === node.id ? 'selected' : ''}`}><i>{node.type === 'task' ? <TaskIcon type={node.taskType}/> : node.type === 'profile' ? '◉' : node.type === 'goal' ? '◎' : node.type === 'source' ? '⌕' : '✓'}</i><span><b>{node.label}</b><small>{node.meta}</small></span></button>)}</div><div className="osint-legend"><span><i className="profile"/>Profile data</span><span><i className="evidence"/>Verified evidence</span><span><i className="logic"/>Requirement</span><span><i className="task"/>Generated task</span></div></article><aside className="node-inspector"><span className={`node-kind ${selected.type}`}>{selected.type === 'task' ? `generated ${selected.taskType} task` : selected.type}</span><h2>{selected.label}</h2><p>{selected.detail}</p>{selected.type === 'source' && <div className="source-list"><span><b>Universitaly</b><small>Official · checked today</small></span><span><b>University admissions pages</b><small>8 sources · official</small></span><span><b>Italian visa portal</b><small>Official · checked today</small></span></div>}<div className="node-connections"><small>CONNECTED NODES</small>{connectedIds.map(id => { const node=nodes.find(n=>n.id===id); return <button key={id} onClick={() => setSelectedId(id)}>{node.label}<b>{icons.arrow}</b></button> })}</div>{selected.type === 'task' && <button className="button primary" onClick={() => { setFocusNode(selected.id); setPage('roadmap') }}>Open in My Path <span>{icons.arrow}</span></button>}</aside></section><section className="task-contract"><div><span className="eyebrow">OUTPUT FOR MY PATH</span><h2>Three starter task types</h2><p>The future AI can return any number of tasks using this same structure.</p></div>{plan.tasks.map((task,index) => <article key={task.id}><i className={task.type}><TaskIcon type={task.type}/></i><span><small>0{index+1} · {task.type}</small><b>{task.shortTitle}</b><em>{task.xp} XP</em></span></article>)}</section></main>
}

function Universities() {
  const [focus, setFocus] = useState(null)
  const [activeCity, setActiveCity] = useState(null)
  const country = focus ? countryByIso[focus] : null
  const city = activeCity ? cityById[activeCity] : null
  const list = city ? universitiesIn(city.id) : []
  const cityList = focus && !city ? citiesOf(focus).map(item => ({ ...item, count: universitiesIn(item.id).length })).sort((a, b) => b.count - a.count) : []
  const pickCountry = iso => { setFocus(iso); setActiveCity(null) }
  return <main className="page country-page">
    <section className="country-head">
      <div>
        <span className="eyebrow purple">EXPLORE YOUR DESTINATION</span>
        <h1>{city ? `${city.name}, ${country.name}` : country ? country.name : <>Where will your<br/>next chapter be?</>}</h1>
        <p>{city ? `${list.length} universities mapped in ${city.name}.`
          : country ? `${citiesOf(focus).length} student cities · ${universitiesOf(focus).length} universities in depth.`
          : 'Ten destinations mapped in depth, the rest of the world in the catalogue.'}</p>
      </div>
      <div className="country-picker">{countries.map(item => <button key={item.iso} className={focus === item.iso ? 'active' : ''} onClick={() => pickCountry(focus === item.iso ? null : item.iso)}><span className="flag-emoji">{item.flag}</span>{item.name}</button>)}</div>
    </section>
    <section className="country-explorer">
      <div className="country-stage">
        <WorldMap focus={focus} onFocus={pickCountry} activeCity={activeCity} onPickCity={setActiveCity}/>
      </div>
      <aside className="country-sidebar">
        <span className="country-badge"><span className="flag-emoji">{country?.flag ?? '\u25c9'}</span>{city ? 'YOUR CITY' : country ? 'YOUR DESTINATION' : 'THE WHOLE MAP'}</span>
        <h2>{city?.name ?? country?.name ?? 'Everywhere'}</h2>
        <p>{city ? 'Every programme below is taught at a real institution. Costs and deadlines come later, from verified sources.'
          : country ? 'Pick a city point to see which universities sit there.'
          : 'Ten countries carry city-level data. The rest of the world is searchable through the open catalogue.'}</p>
        <div className="country-facts">
          {city ? <><div><b>{list.length}</b><small>universities here</small></div><div><b>{new Set(list.flatMap(uni => uni.fields)).size}</b><small>fields of study</small></div></>
            : country ? <><div><b>{citiesOf(focus).length}</b><small>student cities</small></div><div><b>{catalogCounts[focus] ?? universitiesOf(focus).length}</b><small>in the catalogue</small></div></>
            : <><div><b>{countries.length}</b><small>destinations in depth</small></div><div><b>{catalogTotal.toLocaleString('en-US')}</b><small>universities catalogued</small></div></>}
        </div>
        {cityList.length > 0 && <div className="uni-scroll">{cityList.map(item => <button key={item.id} className="city-row" onClick={() => setActiveCity(item.id)}>{item.name}<b>{item.count}</b></button>)}</div>}
        {list.length > 0 && <div className="uni-scroll">{list.map((uni, index) => <a key={uni.id} className={`uni-row ${uni.web ? '' : 'no-link'}`} href={uni.web ?? undefined} target="_blank" rel="noreferrer">
          <i>{index + 1}</i>
          <span>
            <b>{uni.name}</b>
            <small>{cityById[uni.city]?.name} · {uni.levels.join(' · ')}</small>
            <span className="uni-tags">
              {uni.fields.slice(0, 3).map(field => <span key={field}>{FIELD_LABELS[field]}</span>)}
              {uni.langs.includes('en') && <span className="lang">English</span>}
            </span>
          </span>
        </a>)}</div>}
        {!focus && <div className="catalog-note"><b>Two layers, on purpose</b>The curated layer states city, fields and language of instruction. The open catalogue adds breadth but carries no tuition, deadlines or admission rates — those need a verified source and a year.</div>}
      </aside>
    </section>
  </main>
}

function Friends() { return <main className="page friends-page"><section className="list-hero"><span className="eyebrow purple">YOUR CREW</span><h1>Progress is better<br/>together.</h1><p>Cheer each other on through every brave step.</p></section><div className="friend-list">{[['Amir','Chose an English test','A'],['Lina','Finished profile basics','L'],['Noah','Saved 3 universities','N']].map((f,i)=><article key={f[0]}><span className={`avatar a${i+1}`}>{f[2]}</span><div><h3>{f[0]}</h3><p>{f[1]} · today</p></div><button className="high-five">✋ High-five</button></article>)}</div></main> }

function Chat({ open, onClose, name }) { const [messages, setMessages] = useState([{from:'leo', text:`Hi ${name}! I’m Leo, your admission guide. What would you like to make clearer today?`}]); const [draft, setDraft] = useState(''); const send = () => { if (!draft.trim()) return; setMessages(v => [...v, {from:'user', text:draft}, {from:'leo', text:'Great question. I’ve added that to your personal plan — let’s take it one piece at a time.'}]); setDraft('') }; return <aside className={`chat ${open ? 'open' : ''}`} aria-hidden={!open}><div className="chat-head"><div><img src={mascot} alt=""/><span><b>Leo AI</b><small>Here to guide you</small></span></div><button onClick={onClose}>×</button></div><div className="chat-messages">{messages.map((m,i)=><p className={m.from} key={i}>{m.text}</p>)}</div><div className="chat-quick"><button onClick={() => setDraft('Help me choose a language test')}>Choose a language test</button><button onClick={() => setDraft('What should I do this week?')}>Plan my week</button></div><form onSubmit={e=>{e.preventDefault();send()}}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Ask Leo anything…"/><button aria-label="Send message">{icons.arrow}</button></form></aside> }

export default function App() {
  // `undefined` means "still asking the server"; `null` means "definitely signed out".
  const [user, setUser] = useState(undefined)
  useEffect(() => {
    fetch('/api/auth/me')
      .then(response => response.json())
      .then(payload => setUser(payload.user ?? null))
      .catch(() => setUser(null))
  }, [])

  const [page, setPage] = useState('home'); const [chatOpen, setChatOpen] = useState(false)
  // `undefined` while loading, `null` when this account has not been through onboarding.
  const [profile, setProfile] = useState(undefined)
  const [admissionPlan, setAdmissionPlan] = useState(cloneAdmissionPlan)
  // Which task both pages are pointing at. One value, two views.
  const [focusTask, setFocusTask] = useState(null)

  useEffect(() => {
    if (!user) { setProfile(undefined); return }
    let alive = true
    Promise.all([
      fetch('/api/me/profile').then(response => response.json()).catch(() => ({ profile: null })),
      fetch('/api/me/plan').then(response => response.json()).catch(() => ({ plan: null })),
    ]).then(([profilePayload, planPayload]) => {
      if (!alive) return
      setProfile(profilePayload.profile ?? null)
      // A stored plan wins over the seed; a new account keeps the seed until it generates one.
      if (planPayload.plan) setAdmissionPlan(planPayload.plan)
    })
    return () => { alive = false }
  }, [user])

  const handleGeneratePlan = async objective => {
    const response = await fetch('/api/me/plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objective }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.plan) throw new Error(payload.error || 'Could not generate the plan')
    setAdmissionPlan(payload.plan)
    setFocusTask(payload.plan.tasks[0]?.id ?? null)
    return payload.plan
  }
  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null); setPage('home'); setProfile(undefined); setAdmissionPlan(cloneAdmissionPlan())
  }

  if (user === undefined) return <div className="auth-booting"><span className="map-spinner"/>Checking your session…</div>
  if (user === null) return <Auth onSignedIn={setUser}/>
  if (profile === undefined) return <div className="auth-booting"><span className="map-spinner"/>Loading your path…</div>
  if (profile === null) return <Onboarding user={user} onDone={setProfile}/>

  const firstName = (user.displayName || user.username).trim().split(/\s+/)[0]
  const nav = [{label:'Home',icon:'home',id:'home'}, {label:'My path',icon:'path',id:'roadmap'}, {label:'Decision map',icon:'search',id:'intel'}, {label:'Universities',icon:'uni',id:'universities'}, {label:'Friends',icon:'friends',id:'friends'}]
  const body = page === 'home' ? <Dashboard setChatOpen={setChatOpen} setPage={setPage} name={firstName}/> : page === 'roadmap' ? <GamePath setChatOpen={setChatOpen} plan={admissionPlan} setPage={setPage} focusTask={focusTask} setFocusTask={setFocusTask}/> : page === 'profile' ? <Profile user={user} profile={profile}/> : page === 'intel' ? <OSINT setPage={setPage} plan={admissionPlan} onGenerate={handleGeneratePlan} profile={profile} focusNode={focusTask} setFocusNode={setFocusTask}/> : page === 'universities' ? <Universities/> : <Friends/>
  return <div className="app-shell"><aside className="sidebar"><button className="brand" onClick={() => setPage('home')}><span className="brand-mark">P</span><span>path<span>2</span>uni</span></button><nav>{nav.map(item=><NavItem key={item.id} item={item} active={page===item.id || (page==='roadmap' && item.id==='roadmap')} onClick={() => setPage(item.id)}/>)}</nav><div className="sidebar-bottom"><button className="profile-mini" onClick={() => setPage('profile')}><span className="user-pic">{(user.displayName || user.username).trim().charAt(0).toUpperCase()}</span><span><b>{user.displayName || user.username}</b><small>My profile</small></span><i>{icons.chevron}</i></button><button className="sign-out" onClick={signOut}>Sign out</button></div></aside><header className="topbar"><button className="mobile-brand brand" onClick={() => setPage('home')}><span className="brand-mark">P</span>path<span>2</span>uni</button><div className="top-actions"><button className="xp-pill">✦ 1,240 XP</button><button className="bell" aria-label="Notifications">{icons.bell}<i/></button><button className="mobile-menu" onClick={() => setChatOpen(true)}>☰</button></div></header>{body}<button className="leo-fab" onClick={() => setChatOpen(true)} aria-label="Open Leo AI"><img src={mascot} alt=""/><span>Ask Leo <b>✦</b></span></button><Chat open={chatOpen} onClose={() => setChatOpen(false)} name={firstName}/>{chatOpen && <button className="overlay" onClick={() => setChatOpen(false)} aria-label="Close Leo AI"/>}</div>
}
