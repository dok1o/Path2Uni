import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import mascot from './assets/leo-mascot.png'
import { admissionProfile, cloneAdmissionPlan } from './data/admissionGraph.js'
import { countryCatalog, getCountryMap, MAP_VIEWBOX } from './data/countryMaps.js'
import { generateAdmissionPlan } from './services/roadmapAI.js'
import { loadApplicantProfile, saveApplicantTests } from './services/applicantProfile.js'

const icons = {
  home: '⌂', path: '⌁', search: '◌', uni: '⌘', friends: '♧', profile: '◉', bell: '♢',
  chevron: '›', check: '✓', lock: '•', arrow: '→', spark: '✦', book: '▤', target: '◎',
}

function TaskIcon({ type }) {
  if (type === 'documents') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M10 12h5M10 16h5"/></svg>
  if (type === 'application') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m1 1h11l-2 4 2 4H6"/><path d="M9 17l2 2 5-6"/></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="5"/><path d="m14 14 6 6M7 10h6M10 7v6"/></svg>
}

function AdmissionNode({ data, selected }) {
  const symbol = data.type === 'task' ? <TaskIcon type={data.taskType}/> : data.type === 'profile' ? '◉' : data.type === 'goal' ? '◎' : data.type === 'source' ? '⌕' : '✓'
  return <div className={`flow-admission-node ${data.type} ${data.taskType || ''} ${selected ? 'selected' : ''}`}><Handle type="target" position={Position.Left}/><span className="flow-node-icon">{symbol}</span><span><b>{data.label}</b><small>{data.meta}</small></span><i className="node-signal"/><Handle type="source" position={Position.Right}/></div>
}

const nodeTypes = { admission: AdmissionNode }
const toFlowNodes = nodes => nodes.map(node => ({ id:node.id, type:'admission', position:{x:node.x * 7.1,y:node.y * 3.65}, data:node }))
const toFlowEdges = edges => edges.map(([source,target],index) => ({ id:`edge-${index}-${source}-${target}`, source, target, type:'smoothstep', animated:true, style:{stroke:'#9586df',strokeWidth:1.6} }))

function useDraggableMiniMap() {
  useEffect(() => {
    const map = document.querySelector('.flow-canvas .react-flow__minimap')
    const canvas = map?.closest('.flow-canvas')
    if (!map || !canvas) return undefined

    map.title = 'Drag the minimap · double-click to reset'
    let dragging = false
    let pointerId = null
    let startX = 0
    let startY = 0
    let originX = Number(map.dataset.dragX || 0)
    let originY = Number(map.dataset.dragY || 0)

    const place = (x, y) => {
      const minX = Math.min(0, -(canvas.clientWidth - map.offsetWidth - 28))
      const maxY = Math.max(0, canvas.clientHeight - map.offsetHeight - 28)
      const nextX = Math.max(minX, Math.min(0, x))
      const nextY = Math.max(0, Math.min(maxY, y))
      map.dataset.dragX = String(nextX)
      map.dataset.dragY = String(nextY)
      map.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`
    }
    const onPointerDown = event => {
      if (event.button !== 0) return
      dragging = true
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      originX = Number(map.dataset.dragX || 0)
      originY = Number(map.dataset.dragY || 0)
      map.classList.add('dragging')
      map.setPointerCapture?.(pointerId)
      event.stopPropagation()
    }
    const onPointerMove = event => {
      if (!dragging || event.pointerId !== pointerId) return
      place(originX + event.clientX - startX, originY + event.clientY - startY)
      event.preventDefault()
    }
    const stopDragging = event => {
      if (!dragging || (event.pointerId != null && event.pointerId !== pointerId)) return
      dragging = false
      map.classList.remove('dragging')
      map.releasePointerCapture?.(pointerId)
      pointerId = null
    }
    const resetPosition = event => {
      event.stopPropagation()
      place(0, 0)
    }

    map.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove, { passive:false })
    window.addEventListener('pointerup', stopDragging)
    map.addEventListener('dblclick', resetPosition)
    return () => {
      map.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopDragging)
      map.removeEventListener('dblclick', resetPosition)
    }
  }, [])
}

const stages = [
  { id: 1, title: 'Set your destination', tag: 'Started', state: 'done', xp: 80, tasks: ['Italy selected', 'Bachelor’s programme chosen'], description: 'Your destination shapes every next step.' },
  { id: 2, title: 'Build your profile', tag: 'Complete today', state: 'active', xp: 120, tasks: ['Add academic results', 'Tell us about your activities', 'Upload your passport'], description: 'A complete profile unlocks personal deadlines and university matches.' },
  { id: 3, title: 'Prepare for exams', tag: 'Jun 12 — Aug 20', state: 'upcoming', xp: 200, tasks: ['Choose an English test', 'Book your exam', 'Make a study plan'], description: 'Get the score your dream programme asks for.' },
  { id: 4, title: 'Find your best-fit universities', tag: 'Opens after exams', state: 'locked', xp: 150, tasks: ['Compare programmes', 'Save a shortlist'], description: 'We will turn your goals into a focused university list.' },
  { id: 5, title: 'Write your application', tag: 'Autumn 2026', state: 'locked', xp: 300, tasks: ['Draft motivation letter', 'Request recommendations'], description: 'Tell admissions teams the story behind your ambitions.' },
]

const friendProfiles = [
  { id:'amir', nickname:'@amirgoesglobal', name:'Amir', initials:'A', className:'a1', university:'Bocconi University' },
  { id:'lina', nickname:'@lina.study', name:'Lina', initials:'L', className:'a2', university:'University of Bologna' },
  { id:'noah', nickname:'@noahbuilds', name:'Noah', initials:'N', className:'a3', university:'Politecnico di Milano' },
  { id:'sofia', nickname:'@sofia.italia', name:'Sofia', initials:'S', className:'a4', university:'Sapienza University' },
]

const cityCatalog = {
  Milan: { position:[39,24], note:'Design, engineering & business', universities:[
    { id:'polimi', name:'Politecnico di Milano', match:'88% match', friends:['noah','amir'] },
    { id:'bocconi', name:'Bocconi University', match:'84% match', friends:['amir','sofia'] },
    { id:'unimi', name:'University of Milan', match:'79% match', friends:['lina'] },
  ]},
  Bologna: { position:[52,43], note:'Historic student city', universities:[
    { id:'unibo', name:'University of Bologna', match:'92% match', friends:['lina','sofia','amir'] },
    { id:'bbs', name:'Bologna Business School', match:'81% match', friends:['noah'] },
  ]},
  Rome: { position:[58,62], note:'Culture, research & opportunity', universities:[
    { id:'sapienza', name:'Sapienza University', match:'86% match', friends:['sofia','lina'] },
    { id:'luiss', name:'LUISS Guido Carli', match:'82% match', friends:['amir'] },
    { id:'roma-tre', name:'University of Roma Tre', match:'76% match', friends:[] },
  ]},
  Turin: { position:[25,30], note:'Innovation and technology', universities:[
    { id:'polito', name:'Politecnico di Torino', match:'87% match', friends:['noah'] },
    { id:'unito', name:'University of Turin', match:'80% match', friends:['lina'] },
  ]},
  Florence: { position:[48,51], note:'Arts, architecture & humanities', universities:[
    { id:'unifi', name:'University of Florence', match:'83% match', friends:['sofia'] },
    { id:'polimoda', name:'Polimoda', match:'77% match', friends:['noah','sofia'] },
  ]},
}

function NavItem({ item, active, onClick }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span>{icons[item.icon]}</span>{item.label}</button>
}

function StageCard({ stage, expanded, onExpand, onAction }) {
  const locked = stage.state === 'locked'
  return <article className={`stage-card ${stage.state} ${expanded ? 'expanded' : ''}`}>
    <button className="stage-head" onClick={onExpand} aria-expanded={expanded}>
      <div className="stage-status">{stage.state === 'done' ? icons.check : locked ? icons.lock : stage.id}</div>
      <div className="stage-copy"><small>{stage.tag}</small><h3>{stage.title}</h3></div>
      <span className="stage-xp">+{stage.xp} XP</span><span className="stage-chevron">{expanded ? '⌃' : '⌄'}</span>
    </button>
    {expanded && <div className="stage-body">
      <p>{stage.description}</p>
      <div className="task-list">{stage.tasks.map((task, index) => <div key={task} className={locked ? 'task locked-task' : 'task'}><i>{stage.state === 'done' || (stage.state === 'active' && index === 0) ? icons.check : '○'}</i>{task}</div>)}</div>
      {!locked && <button className="button primary mini" onClick={onAction}>{stage.state === 'done' ? 'View details' : 'Continue this step'} <span>{icons.arrow}</span></button>}
    </div>}
  </article>
}

function Roadmap({ compact = false, onOpen }) {
  const [expanded, setExpanded] = useState(compact ? 2 : null)
  const [notice, setNotice] = useState('')
  return <section className={`roadmap ${compact ? 'compact-roadmap' : ''}`}>
    {!compact && <div className="section-heading"><div><span className="eyebrow">YOUR ADMISSION PATH</span><h2>Small steps. Big future.</h2><p>One clear action at a time, just like a game you’ll want to keep playing.</p></div><button className="text-button" onClick={onOpen}>See your full path <span>{icons.arrow}</span></button></div>}
    <div className="roadmap-track">
      {stages.map((stage, index) => <div className="stage-wrap" key={stage.id}>
        {index < stages.length - 1 && <div className={`track-line ${stage.state === 'done' ? 'done-line' : ''}`} />}
        <StageCard stage={stage} expanded={expanded === stage.id} onExpand={() => setExpanded(expanded === stage.id ? null : stage.id)} onAction={() => setNotice(stage.state === 'done' ? 'This stage is already complete — great work!' : 'Nice! Your next task is now pinned at the top of your dashboard.')} />
      </div>)}
    </div>
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
  </section>
}

function GamePath({ setChatOpen, plan, onOpenOSINT }) {
  const [selected, setSelected] = useState(1)
  const levels = plan.tasks.map((task,index) => ({ ...task, id:index + 1, side:index % 2 ? 'right' : 'left', sub:task.due }))
  const active = levels.find(level => level.id === selected) ?? levels[0]
  return <main className="page game-page"><section className="game-head"><div><span className="eyebrow purple">MY PATH · AI-GENERATED</span><h1>Your next chapter<br/>starts here.</h1><p>The task order comes from your profile, verified OSINT research and admission goals.</p><div className="ai-task-types">{['research','documents','application'].map(type => <span key={type}><i><TaskIcon type={type}/></i>{type}</span>)}</div></div><button className="game-leo-tip" onClick={() => setChatOpen(true)}><img src={mascot} alt="Leo mascot"/><span><b>Leo’s hint</b><small>Tap a path point to see why AI created it.</small></span><i>{icons.chevron}</i></button></section><section className="game-meta"><div><span className="game-stat-icon">✦</span><b>1,240</b><small>XP earned</small></div><div><span className="game-stat-icon fire">♨</span><b>7 days</b><small>current streak</small></div><div><span className="game-stat-icon gem">◆</span><b>{levels.length}</b><small>AI tasks</small></div><div><span className="game-stat-icon energy">⚡</span><b>0 / {levels.length}</b><small>tasks done</small></div></section><section className="game-map-shell"><div className="game-map-title"><span>AI ROADMAP · CONNECTED TO OSINT</span><h2>Research to application</h2><small>Tap any point to open its evidence graph</small></div><div className="game-map"><svg className="game-line" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M29 17 C72 28 70 39 29 48 S28 68 70 80"/></svg>{levels.map((level,index) => <button key={level.id} style={{top:`${16 + index * 31}%`}} className={`game-level ${level.state} ${level.side} ${selected === level.id ? 'selected' : ''}`} onClick={() => { setSelected(level.id); onOpenOSINT(level.type) }}><span className="level-disc"><i><TaskIcon type={level.type}/></i><b>{level.id}</b></span><span className="level-label"><strong>{level.shortTitle}</strong><small>Open in OSINT graph →</small></span></button>)}<div className="path-reward reward-one">♜<small>+ 120 XP</small></div><div className="path-reward reward-two">✉<small>AI task</small></div></div><aside className="level-panel"><span className="panel-kicker">AI TASK · {active.id} OF {levels.length}</span><div className={`panel-task-icon ${active.type}`}><TaskIcon type={active.type}/></div><h2>{active.title}</h2><p>{active.description}</p><div className="level-quests">{active.subtasks.map((task,i) => <div key={task} className={active.state === 'current' && i === 0 ? 'quest complete' : 'quest'}><i>{active.state === 'current' && i === 0 ? '✓' : i + 1}</i><span>{task}</span>{i === 0 && <b>+{Math.round(active.xp/3)} XP</b>}</div>)}</div><button className="button primary" onClick={() => onOpenOSINT(active.type)}>Open evidence graph <span>{icons.arrow}</span></button></aside></section></main>
}

function Profile() {
  const sections = [['About you','Personal details, education and language'],['Your goals','Country, programme and intended start date'],['Your strengths','Activities, awards and portfolio']]
  return <main className="page profile-page"><section className="profile-hero"><div className="profile-avatar">M</div><div><span className="eyebrow purple">MY PROFILE</span><h1>Mila Akhmetova</h1><p>Italy · Bachelor’s · 2027 intake</p></div><button className="button soft">Edit profile <span>✎</span></button></section><section className="profile-progress"><div><span className="eyebrow">PROFILE COMPLETION</span><h2>68% complete</h2><p>Just a few details left before Leo can tailor every recommendation.</p></div><div className="progress-circle"><b>68%</b></div></section><section className="profile-grid"><div className="profile-sections">{sections.map((section,index) => <button className="profile-section" key={section[0]}><span className="profile-number">0{index + 1}</span><span><h3>{section[0]}</h3><p>{section[1]}</p></span><i>{icons.chevron}</i></button>)}</div><aside className="profile-next"><img src={mascot} alt="Leo mascot"/><span className="eyebrow purple">NEXT BEST STEP</span><h3>Tell us about your academic results</h3><p>It takes about 3 minutes and improves your university matches.</p><button className="button dark">Complete now <span>{icons.arrow}</span></button></aside></section></main>
}

function Greeting({ setChatOpen }) {
  return <section className="greeting-card">
    <div className="greeting-copy"><span className="eyebrow purple">TUESDAY, 17 SEPTEMBER</span><h1>Good morning, Mila <span>✦</span></h1><p>You’re doing brilliantly. One small task today brings your Italian dream closer.</p><div className="daily-action"><div className="action-icon">✉</div><div><small>TODAY’S QUEST · 8 MIN</small><strong>Tell us what makes you curious</strong><span>Start your profile story to unlock tailored university matches.</span></div><button className="button dark" onClick={() => setChatOpen(true)}>Start <span>{icons.arrow}</span></button></div></div>
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

function Dashboard({ setChatOpen, setPage }) {
  return <main className="page dashboard-page"><Greeting setChatOpen={setChatOpen}/><section className="stats-row"><Stat icon="⚡" value="7 days" label="Current streak" note="Your longest: 12 days" className="orange"/><Stat icon="✦" value="1,240" label="Your XP" note="Top 18% this month" className="violet"/><Stat icon="◒" value="2 / 9" label="Stages complete" note="One task away from 3" className="blue"/></section><section className="dash-grid"><HomeQuestPath setPage={setPage}/><aside className="side-stack"><article className="deadline-card"><div className="card-top"><span className="warning-dot">!</span><span>UPCOMING DEADLINE</span><button>•••</button></div><h3>Complete your profile</h3><p>It helps Leo make your roadmap personal.</p><div className="deadline-bottom"><strong>5 days left</strong><button className="round-arrow" onClick={() => setPage('roadmap')}>{icons.arrow}</button></div></article><article className="friend-card"><div className="card-top"><span>YOUR CREW</span><button className="text-button" onClick={() => setPage('friends')}>See all</button></div><div className="avatars"><span className="avatar a1">A</span><span className="avatar a2">L</span><span className="avatar a3">N</span><span className="avatar a4">+4</span></div><p><b>Amir</b> just completed “Choose your test”. Send a high-five!</p><button className="high-five">✋ Send a high-five</button></article></aside></section></main>
}

function OSINT({ setPage, plan, onGenerate }) {
  const [selectedId, setSelectedId] = useState('research')
  const [objective, setObjective] = useState('Find the best Economics bachelor programmes in Italy for 2027 and build my application plan')
  const [isGenerating, setIsGenerating] = useState(false)
  const nodes = plan.graph.nodes
  const selected = nodes.find(node => node.id === selectedId) ?? nodes[0]
  const connectedIds = plan.graph.edges.filter(edge => edge.includes(selected.id)).flat().filter(id => id !== selected.id)
  const runGeneration = async () => { setIsGenerating(true); await onGenerate(objective); setIsGenerating(false); setSelectedId('research') }
  return <main className="page osint-page"><section className="osint-hero"><div><span className="eyebrow purple">AI + OSINT ADMISSION ENGINE</span><h1>From your goal<br/>to a verified action graph.</h1><p>Your profile gives context. OSINT adds evidence. AI turns both into ordered tasks in My Path.</p></div><div className="ai-ready"><i>✦</i><span><b>AI-ready structure</b><small>Mock service connected · API contract prepared</small></span></div></section><section className="osint-pipeline"><div className="pipeline-step complete"><i>1</i><span><b>Profile</b><small>Goals & background</small></span></div><em>→</em><div className="pipeline-step complete"><i>2</i><span><b>OSINT research</b><small>Verified sources</small></span></div><em>→</em><div className="pipeline-step active"><i>3</i><span><b>AI graph</b><small>Logic & dependencies</small></span></div><em>→</em><div className="pipeline-step"><i>4</i><span><b>My Path</b><small>Sequential tasks</small></span></div></section><section className="osint-control"><div><span className="control-label">YOUR ADMISSION OBJECTIVE</span><textarea value={objective} onChange={event => setObjective(event.target.value)} aria-label="Admission objective"/><div className="profile-context"><span>Italy</span><span>Bachelor</span><span>Economics</span><span>2027 intake</span><span>English B2</span></div></div><button className={`button primary generate-button ${isGenerating ? 'loading' : ''}`} disabled={isGenerating || !objective.trim()} onClick={runGeneration}>{isGenerating ? <><i/>Researching sources…</> : <>Generate graph <span>✦</span></>}</button></section><section className="osint-workspace"><article className="osint-graph-card"><div className="graph-toolbar"><div><span className="eyebrow purple">LIVE KNOWLEDGE GRAPH</span><h2>Admission intelligence</h2></div><div className="source-health"><i/>12 sources verified</div></div><div className="osint-canvas"><svg viewBox="0 0 100 100" preserveAspectRatio="none">{plan.graph.edges.map(([from,to]) => { const a=nodes.find(n=>n.id===from); const b=nodes.find(n=>n.id===to); return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/> })}</svg>{nodes.map(node => <button key={node.id} onClick={() => setSelectedId(node.id)} style={{left:`${node.x}%`,top:`${node.y}%`}} className={`osint-node ${node.type} ${node.taskType || ''} ${selected.id === node.id ? 'selected' : ''}`}><i>{node.type === 'task' ? <TaskIcon type={node.taskType}/> : node.type === 'profile' ? '◉' : node.type === 'goal' ? '◎' : node.type === 'source' ? '⌕' : '✓'}</i><span><b>{node.label}</b><small>{node.meta}</small></span></button>)}</div><div className="osint-legend"><span><i className="profile"/>Profile data</span><span><i className="evidence"/>Verified evidence</span><span><i className="logic"/>Requirement</span><span><i className="task"/>Generated task</span></div></article><aside className="node-inspector"><span className={`node-kind ${selected.type}`}>{selected.type === 'task' ? `generated ${selected.taskType} task` : selected.type}</span><h2>{selected.label}</h2><p>{selected.detail}</p>{selected.type === 'source' && <div className="source-list"><span><b>Universitaly</b><small>Official · checked today</small></span><span><b>University admissions pages</b><small>8 sources · official</small></span><span><b>Italian visa portal</b><small>Official · checked today</small></span></div>}<div className="node-connections"><small>CONNECTED NODES</small>{connectedIds.map(id => { const node=nodes.find(n=>n.id===id); return <button key={id} onClick={() => setSelectedId(id)}>{node.label}<b>{icons.arrow}</b></button> })}</div>{selected.type === 'task' && <button className="button primary" onClick={() => setPage('roadmap')}>Open in My Path <span>{icons.arrow}</span></button>}</aside></section><section className="task-contract"><div><span className="eyebrow">OUTPUT FOR MY PATH</span><h2>Three starter task types</h2><p>The future AI can return any number of tasks using this same structure.</p></div>{plan.tasks.map((task,index) => <article key={task.id}><i className={task.type}><TaskIcon type={task.type}/></i><span><small>0{index+1} · {task.type}</small><b>{task.shortTitle}</b><em>{task.xp} XP</em></span></article>)}</section></main>
}

function OSINTFlow({ setPage, plan, onGenerate, focusedNodeId }) {
  const [selectedId, setSelectedId] = useState(focusedNodeId || 'research')
  const [objective, setObjective] = useState('Find the best Economics bachelor programmes in Italy for 2027 and build my application plan')
  const [isGenerating, setIsGenerating] = useState(false)
  const [miniMapHidden, setMiniMapHidden] = useState(false)
  useDraggableMiniMap()
  const sourceNodes = plan.graph.nodes
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(toFlowNodes(sourceNodes))
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(toFlowEdges(plan.graph.edges))
  useEffect(() => { setFlowNodes(toFlowNodes(plan.graph.nodes)); setFlowEdges(toFlowEdges(plan.graph.edges)) }, [plan, setFlowNodes, setFlowEdges])
  useEffect(() => { if (focusedNodeId) setSelectedId(focusedNodeId) }, [focusedNodeId])
  useEffect(() => { setFlowNodes(nodes => nodes.map(node => ({ ...node, selected:node.id === selectedId }))) }, [selectedId, setFlowNodes])
  const selected = sourceNodes.find(node => node.id === selectedId) ?? sourceNodes[0]
  const connectedIds = plan.graph.edges.filter(edge => edge.includes(selected.id)).flat().filter(id => id !== selected.id)
  const handleNodeClick = useCallback((_, node) => setSelectedId(node.id), [])
  const runGeneration = async () => { setIsGenerating(true); await onGenerate(objective); setIsGenerating(false); setSelectedId('research') }
  return <main className="page osint-page">
    {focusedNodeId && <button className="osint-backlink" onClick={() => setPage('roadmap')}>← Back to My Path <span>Opened task: {selected?.label}</span></button>}
    <motion.section className="osint-hero" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{duration:.45}}><div><span className="eyebrow purple">AI + OSINT ADMISSION ENGINE</span><h1>From your goal<br/>to a verified action graph.</h1><p>Your profile gives context. OSINT adds evidence. AI turns both into ordered tasks in My Path.</p></div><motion.div className="ai-ready" whileHover={{y:-4,scale:1.02}}><i>✦</i><span><b>{focusedNodeId ? 'Opened from My Path' : 'Live graph workspace'}</b><small>{focusedNodeId ? 'Inspect evidence and dependencies' : 'Drag · zoom · inspect · regenerate'}</small></span></motion.div></motion.section>
    <section className="osint-pipeline">{[['Profile','Goals & background'],['OSINT research','Verified sources'],['AI graph','Logic & dependencies'],['My Path','Sequential tasks']].map((step,index) => <div className="pipeline-fragment" key={step[0]}><motion.div className={`pipeline-step ${index < 2 ? 'complete' : index === 2 ? 'active' : ''}`} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:index*.08}}><i>{index+1}</i><span><b>{step[0]}</b><small>{step[1]}</small></span></motion.div>{index < 3 && <em>→</em>}</div>)}</section>
    <section className="osint-control"><div><span className="control-label">YOUR ADMISSION OBJECTIVE</span><textarea value={objective} onChange={event => setObjective(event.target.value)} aria-label="Admission objective"/><div className="profile-context"><span>Italy</span><span>Bachelor</span><span>Economics</span><span>2027 intake</span><span>English B2</span></div></div><motion.button whileHover={{scale:1.025}} whileTap={{scale:.97}} className={`button primary generate-button ${isGenerating ? 'loading' : ''}`} disabled={isGenerating || !objective.trim()} onClick={runGeneration}>{isGenerating ? <><i/>Researching sources…</> : <>Generate graph <span>✦</span></>}</motion.button></section>
    <section className="osint-workspace"><article className="osint-graph-card"><div className="graph-toolbar"><div><span className="eyebrow purple">INTERACTIVE KNOWLEDGE GRAPH</span><h2>Admission intelligence</h2></div><div className="source-health"><i/>12 sources verified</div></div><div className="flow-canvas"><ReactFlow nodes={flowNodes} edges={flowEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={handleNodeClick} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:.18}} minZoom={.55} maxZoom={1.7} nodesConnectable={false} deleteKeyCode={null} proOptions={{hideAttribution:true}}><Background gap={18} size={1} color="#d6d5e2"/><Controls showInteractive={false}/><MiniMap className={miniMapHidden ? 'minimap-hidden' : ''} pannable zoomable nodeStrokeWidth={3} nodeColor={node => node.data.type === 'source' ? '#45b979' : node.data.type === 'task' ? '#8a63d1' : '#7464cf'} maskColor="rgba(242,242,249,.72)"/></ReactFlow><div className="flow-hint">Drag nodes · scroll to zoom · click to inspect</div><button className={`minimap-toggle ${miniMapHidden ? 'is-hidden' : ''}`} onClick={() => setMiniMapHidden(value => !value)}>{miniMapHidden ? 'Show map' : 'Hide map'}</button></div><div className="osint-legend"><span><i className="profile"/>Profile data</span><span><i className="evidence"/>Verified evidence</span><span><i className="logic"/>Requirement</span><span><i className="task"/>Generated task</span></div></article>
      <AnimatePresence mode="wait"><motion.aside key={selected.id} className="node-inspector" initial={{opacity:0,x:22}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-12}} transition={{type:'spring',stiffness:260,damping:25}}><span className={`node-kind ${selected.type}`}>{selected.type === 'task' ? `generated ${selected.taskType} task` : selected.type}</span><h2>{selected.label}</h2><p>{selected.detail}</p>{selected.type === 'source' && <div className="source-list"><span><b>Universitaly</b><small>Official · checked today</small></span><span><b>University admissions pages</b><small>8 sources · official</small></span><span><b>Italian visa portal</b><small>Official · checked today</small></span></div>}<div className="node-connections"><small>CONNECTED NODES</small>{connectedIds.map(id => { const node=sourceNodes.find(item => item.id === id); return <button key={id} onClick={() => setSelectedId(id)}>{node.label}<b>{icons.arrow}</b></button> })}</div>{selected.type === 'task' && <motion.button whileHover={{y:-2}} whileTap={{scale:.97}} className="button primary" onClick={() => setPage('roadmap')}>Open in My Path <span>{icons.arrow}</span></motion.button>}</motion.aside></AnimatePresence>
    </section>
    <section className="task-contract"><div><span className="eyebrow">OUTPUT FOR MY PATH</span><h2>Three starter task types</h2><p>The future AI can return any number of tasks using this same structure.</p></div>{plan.tasks.map((task,index) => <motion.article key={task.id} initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{delay:.15+index*.08}} whileHover={{y:-6,rotate:index===1 ? 1 : -1}}><i className={task.type}><TaskIcon type={task.type}/></i><span><small>0{index+1} · {task.type}</small><b>{task.shortTitle}</b><em>{task.xp} XP</em></span></motion.article>)}</section>
  </main>
}

function Universities() {
  const cityData = {
    Milan: { position:[39,24], note:'Design, engineering & business', universities:[['Politecnico di Milano','88% match'],['Bocconi University','84% match'],['University of Milan','79% match']] },
    Bologna: { position:[52,43], note:'Historic student city', universities:[['University of Bologna','92% match'],['Bologna Business School','81% match']] },
    Rome: { position:[58,62], note:'Culture, research & opportunity', universities:[['Sapienza University','86% match'],['LUISS Guido Carli','82% match'],['University of Roma Tre','76% match']] },
    Turin: { position:[25,30], note:'Innovation and technology', universities:[['Politecnico di Torino','87% match'],['University of Turin','80% match']] },
    Florence: { position:[48,51], note:'Arts, architecture & humanities', universities:[['University of Florence','83% match'],['Polimoda','77% match']] },
  }
  const [city, setCity] = useState(null)
  const [country] = useState('Italy')
  const chosen = city ? cityData[city] : null
  return <main className="page country-page"><section className="country-head"><div><span className="eyebrow purple">EXPLORE YOUR DESTINATION</span><h1>{city ? `${city}, Italy` : 'Your Italy map'}</h1><p>{city ? chosen.note : 'Every point is a place where your next chapter could begin.'}</p></div><div className="country-picker"><button className={country === 'Italy' ? 'active' : ''} onClick={() => setCity(null)}><i className="flag italy"/>Italy</button><button disabled><i className="flag spain"/>Spain <small>Soon</small></button><button disabled><i className="flag germany"/>Germany <small>Soon</small></button></div></section><section className={`country-explorer ${city ? 'city-open' : ''}`}><div className="country-stage"><div className={`italy-shape-wrap ${city ? 'is-zoomed' : ''}`}><svg className="italy-map" viewBox="0 0 420 560" role="img" aria-label="Contour map of Italy in the colours of the Italian flag"><defs><linearGradient id="italianFlag" x1="0" x2="1"><stop offset="0" stopColor="#29a55c"/><stop offset=".34" stopColor="#29a55c"/><stop offset=".34" stopColor="#f7f5ee"/><stop offset=".67" stopColor="#f7f5ee"/><stop offset=".67" stopColor="#e84d4f"/></linearGradient><filter id="mapShadow"><feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#313756" floodOpacity=".16"/></filter></defs><g fill="url(#italianFlag)" stroke="#fff" strokeWidth="4" filter="url(#mapShadow)"><path d="M204 20l-17 35 9 34-23 26-4 36 20 26-7 29 22 31 22 27 21 27 19 28 9 29 11 29 31 16 28 23-14 19-33-5-22-17-24 6-12 33-15 38-22 39-22 10-12-21 13-26 8-35-12-29-16-31-12-34-18-25-21-13-17-23 10-24 23-16 13-29-5-30 10-30 7-35 17-27 8-34z"/><path d="M170 472c-29 2-51 13-57 31 11 19 38 29 64 20 18-7 31-22 30-38-12-9-23-14-37-13z"/><path d="M78 341c-14 15-18 46-6 66 9-3 18-13 22-28 5-16 3-32-4-43z"/></g></svg>{Object.entries(cityData).map(([name,data]) => <button key={name} style={{left:`${data.position[0]}%`,top:`${data.position[1]}%`}} className="map-poi" onClick={() => setCity(name)}><span><i>⌂</i></span><b>{name}</b><small>{data.universities.length} universities</small></button>)}</div><div className={`city-scene ${city ? 'visible' : ''}`}><button className="city-back" onClick={() => setCity(null)}>← Back to Italy</button><div className="city-sky"><span className="building b1"/><span className="building b2"/><span className="building b3"/><span className="building dome"/></div><div className="city-title"><span className="eyebrow">WELCOME TO</span><h2>{city}</h2><p>{chosen?.note}</p></div><div className="city-universities">{chosen?.universities.map((uni,index) => <button key={uni[0]} className="city-uni-card"><span className="uni-pin">{index + 1}</span><span><strong>{uni[0]}</strong><small>{uni[1]} · English programmes</small></span><b>{icons.chevron}</b></button>)}</div></div></div><aside className="country-sidebar"><span className="country-badge"><i className="flag italy"/>YOUR DESTINATION</span><h2>{city || 'Italy'}</h2><p>{city ? `Explore universities in ${city}, compare programmes and save your favourites.` : 'Choose a city point to fly closer and discover universities that match your profile.'}</p><div className="country-facts">{city ? <><div><b>{chosen.universities.length}</b><small>universities shown</small></div><div><b>€900</b><small>est. monthly budget</small></div></> : <><div><b>5</b><small>cities mapped</small></div><div><b>12</b><small>matching universities</small></div></>}</div>{!city && <div className="map-legend"><span><i className="legend-pulse"/>Tap a glowing point</span><small>The map uses the country’s flag colours.</small></div>}<button className="button primary" onClick={() => setCity(city || 'Bologna')}>{city ? 'Open city shortlist' : 'Explore Bologna'} <span>{icons.arrow}</span></button></aside></section></main>
}

function LegacyUniversityExplorer({ favorites, onToggleFavorite }) {
  const [city, setCity] = useState(null)
  const chosen = city ? cityCatalog[city] : null
  const isSaved = id => favorites.some(item => item.id === id)
  const saveUniversity = university => onToggleFavorite({ ...university, city, country:'Italy' })

  return <main className="page country-page"><section className="country-head"><div><span className="eyebrow purple">EXPLORE YOUR DESTINATION</span><h1>{city ? `${city}, Italy` : 'Your Italy map'}</h1><p>{city ? chosen.note : 'Every point is a place where your next chapter could begin.'}</p></div><div className="country-picker"><button className="active" onClick={() => setCity(null)}><i className="flag italy"/>Italy</button><button disabled><i className="flag spain"/>Spain <small>Soon</small></button><button disabled><i className="flag germany"/>Germany <small>Soon</small></button></div></section>
    <section className={`country-explorer ${city ? 'city-open' : ''}`}><div className="country-stage"><div className={`italy-shape-wrap ${city ? 'is-zoomed' : ''}`}><svg className="italy-map" viewBox="0 0 420 560" role="img" aria-label="Contour map of Italy in the colours of the Italian flag"><defs><linearGradient id="italianFlagSocial" x1="0" x2="1"><stop offset="0" stopColor="#29a55c"/><stop offset=".34" stopColor="#29a55c"/><stop offset=".34" stopColor="#f7f5ee"/><stop offset=".67" stopColor="#f7f5ee"/><stop offset=".67" stopColor="#e84d4f"/></linearGradient><filter id="mapShadowSocial"><feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#313756" floodOpacity=".16"/></filter></defs><g fill="url(#italianFlagSocial)" stroke="#fff" strokeWidth="4" filter="url(#mapShadowSocial)"><path d="M204 20l-17 35 9 34-23 26-4 36 20 26-7 29 22 31 22 27 21 27 19 28 9 29 11 29 31 16 28 23-14 19-33-5-22-17-24 6-12 33-15 38-22 39-22 10-12-21 13-26 8-35-12-29-16-31-12-34-18-25-21-13-17-23 10-24 23-16 13-29-5-30 10-30 7-35 17-27 8-34z"/><path d="M170 472c-29 2-51 13-57 31 11 19 38 29 64 20 18-7 31-22 30-38-12-9-23-14-37-13z"/><path d="M78 341c-14 15-18 46-6 66 9-3 18-13 22-28 5-16 3-32-4-43z"/></g></svg>{Object.entries(cityCatalog).map(([name,data]) => <button key={name} style={{left:`${data.position[0]}%`,top:`${data.position[1]}%`}} className="map-poi" onClick={() => setCity(name)}><span><i>⌂</i></span><b>{name}</b><small>{data.universities.length} universities</small></button>)}</div>
      <AnimatePresence mode="wait">{city && <motion.div key={city} className="city-scene visible social-city-scene" initial={{opacity:0,scale:.92,x:45}} animate={{opacity:1,scale:1,x:0}} exit={{opacity:0,scale:.96,x:-30}} transition={{type:'spring',stiffness:170,damping:22}}><button className="city-back" onClick={() => setCity(null)}>← Back to Italy</button><div className="city-sky"><span className="building b1"/><span className="building b2"/><span className="building b3"/><span className="building dome"/></div><div className="city-title"><span className="eyebrow">WELCOME TO</span><h2>{city}</h2><p>{chosen.note}</p></div><div className="city-universities">{chosen.universities.map((university,index) => { const people = university.friends.map(id => friendProfiles.find(friend => friend.id === id)).filter(Boolean); const saved = isSaved(university.id); return <motion.article layout key={university.id} className={`city-uni-card social-uni-card ${saved ? 'is-saved' : ''}`} whileHover={{y:-4}}><span className="uni-pin">{index + 1}</span><span className="uni-card-main"><strong>{university.name}</strong><small>{university.match} · English programmes</small><span className="uni-social-proof"><span className="friend-stack">{people.slice(0,3).map(friend => <i key={friend.id} title={friend.name} className={`friend-dot ${friend.className}`}>{friend.initials}</i>)}</span><em>{people.length ? `${people.slice(0,2).map(friend => friend.name).join(' & ')}${people.length > 2 ? ` +${people.length - 2}` : ''} chose this university` : 'Be the first from your crew'}</em></span></span><motion.button whileTap={{scale:.78,rotate:-15}} className={`favorite-star ${saved ? 'saved' : ''}`} onClick={() => saveUniversity(university)} aria-label={saved ? `Remove ${university.name} from saved` : `Save ${university.name}`}>{saved ? '★' : '☆'}</motion.button></motion.article> })}</div></motion.div>}</AnimatePresence></div>
      <aside className="country-sidebar"><span className="country-badge"><i className="flag italy"/>YOUR DESTINATION</span><h2>{city || 'Italy'}</h2><p>{city ? `Explore universities in ${city}, see where your friends are heading and build your shortlist.` : 'Choose a city point to fly closer and discover universities that match your profile.'}</p><div className="country-facts">{city ? <><div><b>{chosen.universities.length}</b><small>universities shown</small></div><div><b>{favorites.length}</b><small>saved with stars</small></div></> : <><div><b>5</b><small>cities mapped</small></div><div><b>{favorites.length}</b><small>saved universities</small></div></>}</div>{!city && <div className="map-legend"><span><i className="legend-pulse"/>Tap a glowing point</span><small>The map uses the country’s flag colours.</small></div>}<button className="button primary" onClick={() => setCity(city || 'Bologna')}>{city ? 'Review city shortlist' : 'Explore Bologna'} <span>{icons.arrow}</span></button></aside></section>
  </main>
}

function CountryFlag({ country }) {
  return <i className={`flag flag-${country.id}`} aria-hidden="true" />
}

function CountryFlagPattern({ country }) {
  const id = `country-flag-${country.id}`
  const patternProps = { id, width: '1', height: '1', patternUnits: 'objectBoundingBox', patternContentUnits: 'objectBoundingBox' }
  const stripes = colors => colors.map((color, index) => <rect key={`${color}-${index}`} x="0" y={index / colors.length} width="1" height={1 / colors.length} fill={color}/>)
  const stars = Array.from({ length: 12 }, (_, index) => <circle key={index} cx={.055 + (index % 4) * .09} cy={.055 + Math.floor(index / 4) * .11} r=".012" fill="#fff"/>)

  if (country.id === 'italy') return <pattern {...patternProps}><rect width=".333" height="1" fill="#15984d"/><rect x=".333" width=".334" height="1" fill="#fff"/><rect x=".667" width=".333" height="1" fill="#d93e45"/></pattern>
  if (country.id === 'usa') return <pattern {...patternProps}>{stripes(['#b22234','#fff','#b22234','#fff','#b22234','#fff','#b22234','#fff','#b22234','#fff','#b22234','#fff','#b22234'])}<rect width=".42" height=".54" fill="#3c3b6e"/>{stars}</pattern>
  if (country.id === 'england') return <pattern {...patternProps}><rect width="1" height="1" fill="#fff"/><rect x=".39" width=".22" height="1" fill="#c8102e"/><rect y=".39" width="1" height=".22" fill="#c8102e"/></pattern>
  if (country.id === 'hungary') return <pattern {...patternProps}>{stripes(['#ce2939','#fff','#477050'])}</pattern>
  if (country.id === 'china') return <pattern {...patternProps}><rect width="1" height="1" fill="#de2910"/><polygon points=".16,.08 .19,.15 .27,.15 .205,.2 .23,.28 .16,.23 .09,.28 .115,.2 .05,.15 .13,.15" fill="#ffde00"/><circle cx=".33" cy=".12" r=".025" fill="#ffde00"/><circle cx=".37" cy=".2" r=".022" fill="#ffde00"/><circle cx=".33" cy=".28" r=".02" fill="#ffde00"/><circle cx=".26" cy=".32" r=".018" fill="#ffde00"/></pattern>
  if (country.id === 'uae') return <pattern {...patternProps}><rect width="1" height=".333" fill="#00843d"/><rect y=".333" width="1" height=".334" fill="#fff"/><rect y=".667" width="1" height=".333" fill="#000"/><rect width=".25" height="1" fill="#ef3340"/></pattern>
  if (country.id === 'malaysia') return <pattern {...patternProps}>{stripes(Array.from({ length: 14 }, (_, index) => index % 2 ? '#fff' : '#cc0001'))}<rect width=".5" height=".54" fill="#010066"/><circle cx=".24" cy=".27" r=".145" fill="#ffcc00"/><circle cx=".285" cy=".235" r=".145" fill="#010066"/><circle cx=".39" cy=".27" r=".043" fill="#ffcc00"/></pattern>
  if (country.id === 'switzerland') return <pattern {...patternProps}><rect width="1" height="1" fill="#d52b1e"/><rect x=".39" y=".2" width=".22" height=".6" fill="#fff"/><rect x=".2" y=".39" width=".6" height=".22" fill="#fff"/></pattern>
  if (country.id === 'netherlands') return <pattern {...patternProps}>{stripes(['#ae1c28','#fff','#21468b'])}</pattern>
  return <pattern {...patternProps}>{stripes(['#111','#dd0000','#ffce00'])}</pattern>
}

function CountryMap3D({ country, city, onSelectCity }) {
  const map = useMemo(() => getCountryMap(country), [country])
  const [rotation, setRotation] = useState({ x: -9, y: -12 })
  const [drag, setDrag] = useState(null)

  useEffect(() => { setRotation({ x: -9, y: -12 }); setDrag(null) }, [country.id])

  const startDrag = event => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, rotation })
  }
  const moveDrag = event => {
    if (!drag || event.pointerId !== drag.pointerId) return
    setRotation({
      x: Math.max(-42, Math.min(31, drag.rotation.x - (event.clientY - drag.y) * .18)),
      y: Math.max(-48, Math.min(48, drag.rotation.y + (event.clientX - drag.x) * .18)),
    })
  }
  const stopDrag = event => {
    if (drag && event.pointerId === drag.pointerId) setDrag(null)
  }

  return <div className="country-map-3d-shell">
    <div className={`country-map-3d ${drag ? 'is-dragging' : ''}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <div className="country-map-frame">
        <div className="country-map-rotation" style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}>
          <svg className="country-contour-map" viewBox={MAP_VIEWBOX} role="img" aria-label={`${country.name} contour map in its flag colours`}>
            <defs><CountryFlagPattern country={country}/><filter id={`country-shadow-${country.id}`} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="18" stdDeviation="14" floodColor="#2b3158" floodOpacity=".28"/></filter></defs>
            <path d={map.path} fill={`url(#country-flag-${country.id})`} fillRule="evenodd" filter={`url(#country-shadow-${country.id})`}/>
            <path d={map.path} fill="none" stroke="rgba(255,255,255,.94)" strokeWidth="3" strokeLinejoin="round" fillRule="evenodd"/>
          </svg>
          <div className="country-pois">{country.cities.map(place => {
            const [x, y] = map.project(place.coordinates)
            return <button key={place.name} style={{ left: `${x / 7.2}%`, top: `${y / 5.4}%` }} className={`map-poi country-map-poi ${city?.name === place.name ? 'active' : ''}`} onPointerDown={event => event.stopPropagation()} onClick={() => onSelectCity(place)} aria-label={`Explore universities in ${place.name}`}><span><i>⌂</i></span><b>{place.name}</b><small>{place.universities.length} universities</small></button>
          })}</div>
        </div>
      </div>
    </div>
    <button className="country-spin-control" onClick={() => setRotation({ x: -9, y: -12 })} aria-label="Reset 3D map orientation"><span>↻</span> Reset 3D view</button>
    <p className="country-map-gesture">Drag the map to rotate it in 3D</p>
  </div>
}

function UniversityExplorer({ favorites, onToggleFavorite, friends }) {
  const [countryId, setCountryId] = useState('italy')
  const [city, setCity] = useState(null)
  const country = countryCatalog.find(item => item.id === countryId) ?? countryCatalog[0]
  const totalUniversities = country.cities.reduce((total, place) => total + place.universities.length, 0)
  const countryFavorites = favorites.filter(item => item.country === country.name)
  const uniqueId = university => `${country.id}-${university.id}`
  const savedItem = university => favorites.find(item => item.id === uniqueId(university) || (country.id === 'italy' && item.id === university.id))
  const toggleUniversity = university => {
    const existing = savedItem(university)
    if (existing) return onToggleFavorite(existing)
    onToggleFavorite({ ...university, id: uniqueId(university), sourceId: university.id, friends: university.friends ?? [], city: city.name, country: country.name })
  }
  const switchCountry = id => { setCountryId(id); setCity(null) }

  return <main className="page country-page country-library-page">
    <section className="country-head"><div><span className="eyebrow purple">EXPLORE YOUR DESTINATION</span><h1>{city ? `${city.name}, ${country.name}` : `${country.name} map`}</h1><p>{city ? city.note : 'Explore accurate country contours, map out university cities and build a shortlist.'}</p></div><div className="country-picker" aria-label="Choose a country">{countryCatalog.map(item => <button key={item.id} className={item.id === country.id ? 'active' : ''} onClick={() => switchCountry(item.id)}><CountryFlag country={item}/>{item.shortName}</button>)}</div></section>
    <section className={`country-explorer country-explorer-3d ${city ? 'city-open' : ''}`}>
      <div className="country-stage country-stage-3d"><CountryMap3D country={country} city={city} onSelectCity={setCity}/>
        <AnimatePresence mode="wait">{city && <motion.div key={`${country.id}-${city.name}`} className="city-scene visible social-city-scene" initial={{ opacity: 0, scale: .92, x: 45 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: .96, x: -30 }} transition={{ type: 'spring', stiffness: 170, damping: 22 }}><button className="city-back" onClick={() => setCity(null)}>← Back to {country.name}</button><div className="city-sky"><span className="building b1"/><span className="building b2"/><span className="building b3"/><span className="building dome"/></div><div className="city-title"><span className="eyebrow">WELCOME TO</span><h2>{city.name}</h2><p>{city.note}</p></div><div className="city-universities">{city.universities.map((university, index) => { const saved = Boolean(savedItem(university)); const people = friends.filter(friend => friend.university === university.name); return <motion.article layout key={university.id} className={`city-uni-card social-uni-card ${saved ? 'is-saved' : ''}`} whileHover={{ y: -4 }}><span className="uni-pin">{index + 1}</span><span className="uni-card-main"><strong>{university.name}</strong><small>{university.match} · English programmes</small><span className="uni-social-proof"><span className="friend-stack">{people.slice(0,3).map(friend => <i key={friend.id} title={`${friend.name} ${friend.nickname}`} className={`friend-dot ${friend.className}`}>{friend.initials}</i>)}</span><em>{people.length ? `${people.slice(0,2).map(friend => friend.name).join(' & ')}${people.length > 2 ? ` +${people.length - 2}` : ''} chose this university` : saved ? 'Saved to your shortlist' : 'Explore programmes and admissions'}</em></span></span><motion.button whileTap={{ scale: .78, rotate: -15 }} className={`favorite-star ${saved ? 'saved' : ''}`} onClick={() => toggleUniversity(university)} aria-label={saved ? `Remove ${university.name} from saved` : `Save ${university.name}`}>{saved ? '★' : '☆'}</motion.button></motion.article> })}</div></motion.div>}</AnimatePresence>
      </div>
      <aside className="country-sidebar"><span className="country-badge"><CountryFlag country={country}/>DESTINATION MAP</span><h2>{city?.name || country.name}</h2><p>{city ? `Compare universities in ${city.name} and save the ones you want to revisit.` : 'Pick a glowing city point, or drag the country contour to see it from another angle.'}</p><div className="country-facts">{city ? <><div><b>{city.universities.length}</b><small>universities shown</small></div><div><b>{countryFavorites.length}</b><small>saved here</small></div></> : <><div><b>{country.cities.length}</b><small>cities mapped</small></div><div><b>{totalUniversities}</b><small>universities to explore</small></div></>}</div>{!city && <div className="map-legend"><span><i className="legend-pulse"/>Tap a glowing point</span><small>Every outline uses its national flag colours and can rotate in 3D.</small></div>}<button className="button primary" onClick={() => setCity(city || country.cities[0])}>{city ? 'Review city shortlist' : `Explore ${country.cities[0].name}`} <span>{icons.arrow}</span></button></aside>
    </section>
  </main>
}

const profileDefaults = { firstName:'Mila',lastName:'Akhmetova',birthDate:'',citizenship:'Kazakhstan',city:'Almaty',education:'High school',school:'',graduationYear:'2027',language:'English B2',destination:'Italy',degree:'Bachelor’s',field:'Economics',intake:'2027',budget:'',activities:'',awards:'',skills:'',portfolio:'' }
const profileEditorFields = {
  about:{title:'About you',subtitle:'Personal details, education and language',fields:[['firstName','First name','text'],['lastName','Last name','text'],['birthDate','Date of birth','date'],['citizenship','Citizenship','text'],['city','Current city','text'],['education','Education level','text'],['school','School or university','text'],['graduationYear','Graduation year','number'],['language','Language level','text']]},
  goals:{title:'Your goals',subtitle:'Tell us where and what you want to study',fields:[['destination','Destination country','text'],['degree','Degree level','text'],['field','Field of study','text'],['intake','Intake year','number'],['budget','Annual budget (€)','number']]},
  strengths:{title:'Your strengths',subtitle:'Activities, awards and portfolio',fields:[['activities','Activities','textarea'],['awards','Awards and achievements','textarea'],['skills','Skills','textarea'],['portfolio','Portfolio link','url']]},
}

function ProfileEditor({ section, values, onSave, onClose }) {
  const config=profileEditorFields[section]
  const [draft,setDraft]=useState(values)
  return <div className="profile-editor-backdrop" onMouseDown={event => event.target===event.currentTarget && onClose()}><motion.form className="profile-editor" onSubmit={event => { event.preventDefault(); onSave(draft) }} initial={{opacity:0,y:20,scale:.98}} animate={{opacity:1,y:0,scale:1}} role="dialog" aria-modal="true"><header><div><span className="eyebrow purple">PROFILE DETAILS</span><h2>{config.title}</h2><p>{config.subtitle}</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></header><div className="profile-editor-fields">{config.fields.map(([key,label,type]) => <label key={key} className={type==='textarea'?'wide':''}><span>{label}</span>{type==='textarea'?<textarea value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})} placeholder={`Add ${label.toLowerCase()}`}/>:<input type={type} value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})} required={['firstName','lastName','destination','degree','field','intake'].includes(key)} min={key==='intake'?'2026':undefined} max={key==='intake'?'2040':undefined}/>}</label>)}</div><footer><button type="button" className="button soft" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Save changes <span>✓</span></button></footer></motion.form></div>
}

function ProfileV2({ favorites, setPage, onToggleFavorite, friends, onLogout, applicantProfile, onOpenExamStep }) {
  const [tab, setTab] = useState('overview')
  const [editor,setEditor]=useState(null)
  const [highFives,setHighFives]=useState(()=>new Set())
  const [profile,setProfile]=useState(()=>{try{return {...profileDefaults,...JSON.parse(localStorage.getItem('path2uni:profileDetails'))}}catch{return profileDefaults}})
  const saveProfile=next=>{setProfile(next);localStorage.setItem('path2uni:profileDetails',JSON.stringify(next));setEditor(null)}
  const testSummary = applicantProfile.tests?.length ? `${applicantProfile.tests.length} test${applicantProfile.tests.length === 1 ? '' : 's'} added` : 'Add completed and planned exams'
  const sections=[{title:'About you',description:'Personal details, education and language',action:'about'},{title:'Your goals',description:'Country, programme and intended start date',action:'goals'},{title:'Test results',description:testSummary,action:'tests'},{title:'Your strengths',description:'Activities, awards and portfolio',action:'strengths'}]
  const tabs = [{id:'overview',label:'Overview'}, {id:'saved',label:'Saved',count:favorites.length}, {id:'friends',label:'Friends',count:friends.length}]
  const tracked=['firstName','lastName','birthDate','citizenship','city','education','school','graduationYear','language','destination','degree','field','intake','budget','activities','awards','skills','portfolio']
  const completion=Math.round((tracked.filter(key=>String(profile[key]||'').trim()).length+(applicantProfile.tests?.length?1:0))/(tracked.length+1)*100)
  const initials=`${profile.firstName?.[0]||''}${profile.lastName?.[0]||''}`.toUpperCase()
  const toggleHighFive=id=>setHighFives(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next})

  return <main className="page profile-page profile-v2"><section className="profile-hero"><div className="profile-avatar">{initials||'U'}</div><div><span className="eyebrow purple">MY PROFILE</span><h1>{profile.firstName} {profile.lastName}</h1><p>{profile.destination} · {profile.degree} · {profile.intake} intake</p></div><div className="profile-actions"><button className="button soft" onClick={()=>setEditor('about')}>Edit profile <span>✎</span></button><button className="logout-button" onClick={onLogout}>Log out ↗</button></div></section><nav className="profile-tabs" aria-label="Profile sections">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}{item.count != null && <span>{item.count}</span>}</button>)}</nav>
    <AnimatePresence mode="wait"><motion.section key={tab} className="profile-tab-panel" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.2}}>{tab === 'overview' && <><section className="profile-progress"><div><span className="eyebrow">PROFILE COMPLETION</span><h2>{completion}% complete</h2><p>{completion===100?'Your profile is complete and ready for personalised recommendations.':'Complete the remaining details so Leo can tailor every recommendation.'}</p></div><div className="progress-circle" style={{background:`conic-gradient(#6653d8 0 ${completion}%,#ebeafd ${completion}%)`}}><b>{completion}%</b></div></section><section className="profile-grid"><div className="profile-sections">{sections.map((section,index) => <button className="profile-section" key={section.title} onClick={()=>section.action==='tests'?onOpenExamStep():setEditor(section.action)}><span className="profile-number">0{index + 1}</span><span><h3>{section.title}</h3><p>{section.description}</p></span><i>{icons.chevron}</i></button>)}</div><aside className="profile-next"><img src={mascot} alt="Leo mascot"/><span className="eyebrow purple">NEXT BEST STEP</span><h3>Tell us about your test results</h3><p>It takes about 3 minutes and improves your university matches.</p><button className="button dark" onClick={onOpenExamStep}>Complete now <span>{icons.arrow}</span></button></aside></section></>}
      {tab === 'saved' && <section className="saved-panel"><div className="tab-intro"><span className="eyebrow purple">YOUR SHORTLIST</span><h2>Universities worth coming back to.</h2><p>Every gold star from the country map is collected here.</p></div>{favorites.length ? <div className="saved-grid">{favorites.map((university,index) => { const people = friends.filter(friend => friend.university === university.name); return <motion.article layout key={university.id} className="saved-university" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:index*.05}}><button className="favorite-star saved" onClick={() => onToggleFavorite(university)} aria-label={`Remove ${university.name} from saved`}>★</button><span className="saved-rank">0{index+1}</span><small>{university.city}, {university.country}</small><h3>{university.name}</h3><p>{university.match} · English programmes</p><div className="saved-card-bottom"><span className="friend-stack">{people.slice(0,3).map(friend => <i key={friend.id} className={`friend-dot ${friend.className}`}>{friend.initials}</i>)}</span><button onClick={() => setPage('universities')}>View on map {icons.arrow}</button></div></motion.article> })}</div> : <div className="profile-empty"><span>☆</span><h3>No saved universities yet</h3><p>Explore a country and tap a star on any university you want to compare later.</p><button className="button primary" onClick={() => setPage('universities')}>Explore universities <span>{icons.arrow}</span></button></div>}</section>}
      {tab === 'friends' && <section className="profile-friends-panel"><div className="tab-intro tab-intro-row"><div><span className="eyebrow purple">YOUR ADMISSION CREW</span><h2>See where your friends are heading.</h2><p>Their university choices also appear directly on the city cards.</p></div><button className="button soft" onClick={() => setPage('friends')}>+ Add by nickname</button></div><div className="profile-friend-grid">{friends.map((friend,index) => <motion.article key={friend.id} initial={{opacity:0,x:-12}} animate={{opacity:1,x:0}} transition={{delay:index*.06}}><span className={`avatar ${friend.className}`}>{friend.initials}</span><div><h3>{friend.name} <small>{friend.nickname}</small></h3><p>{friend.university === 'Not selected yet' ? 'Choosing a destination' : <>Chose <b>{friend.university}</b></>}</p></div><span className="friend-choice-star">★</span><button className={`high-five ${highFives.has(friend.id)?'sent':''}`} onClick={()=>toggleHighFive(friend.id)}>{highFives.has(friend.id)?'✓ Sent':'✋ High-five'}</button></motion.article>)}</div></section>}</motion.section></AnimatePresence>{editor&&<ProfileEditor section={editor} values={profile} onSave={saveProfile} onClose={()=>setEditor(null)}/>}
  </main>
}

function Friends({ friends, onAddFriend }) {
  const [nickname, setNickname] = useState('')
  const [notice, setNotice] = useState(null)
  const submit = event => {
    event.preventDefault()
    const result = onAddFriend(nickname)
    setNotice(result)
    if (result.ok) setNickname('')
  }
  return <main className="page friends-page"><section className="friends-hero-grid"><section className="list-hero"><span className="eyebrow purple">YOUR CREW</span><h1>Progress is better<br/>together.</h1><p>Find a Path2Uni student by nickname and add them to your admission crew.</p></section><form className="add-friend-card" onSubmit={submit}><span className="add-friend-icon">＋</span><div><span className="eyebrow purple">ADD A FRIEND</span><h2>Find by nickname</h2></div><label><span>@</span><input value={nickname} onChange={event => { setNickname(event.target.value); setNotice(null) }} placeholder="nickname" aria-label="Friend nickname"/><button type="submit">Add friend</button></label>{notice && <p className={notice.ok ? 'success' : 'error'}>{notice.message}</p>}<small>Try a unique nickname, for example <b>@alex.abroad</b>.</small></form></section><div className="friend-list">{friends.map(friend => <article key={friend.id}><span className={`avatar ${friend.className}`}>{friend.initials}</span><div><h3>{friend.name} <small>{friend.nickname}</small></h3><p>{friend.university === 'Not selected yet' ? 'Choosing a destination' : <><span className="inline-friend-star">★</span> Chose {friend.university}</>} · today</p></div><button className="high-five">✋ High-five</button></article>)}</div></main>
}

const examCatalog = [
  { code:'SAT', name:'SAT', range:'400–1600', min:400, max:1600, step:10 },
  { code:'IELTS', name:'IELTS Academic', range:'0–9', min:0, max:9, step:0.5 },
  { code:'UNT', name:'ЕНТ / ҰБТ', range:'0–140', min:0, max:140, step:1 },
  { code:'DET', name:'Duolingo English Test', range:'10–160', min:10, max:160, step:5 },
  { code:'TOEFL_IBT', name:'TOEFL iBT', range:'0–120', min:0, max:120, step:1 },
  { code:'ACT', name:'ACT', range:'1–36', min:1, max:36, step:1 },
  { code:'CAMBRIDGE', name:'Cambridge English', range:'Score' },
  { code:'IB', name:'IB Diploma', range:'0–45', min:0, max:45, step:1 },
  { code:'AP', name:'AP Exams', range:'1–5', min:1, max:5, step:1 },
  { code:'A_LEVEL', name:'A-level', range:'Grade' },
  { code:'OTHER', name:'Other exam', range:'Result' },
]

function ExamResultsStep({ initialTests, onSave, onClose }) {
  const [tests, setTests] = useState(() => examCatalog.map(exam => {
    const saved = initialTests?.find(test => test.test_code === exam.code || test.code === exam.code)
    return { ...exam, selected:Boolean(saved), status:saved?.status || 'completed', score:saved?.score ?? '', scoreText:saved?.score_text || '', date:saved?.test_date || saved?.planned_date || '' }
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const update = (code, changes) => setTests(current => current.map(test => test.code === code ? { ...test, ...changes } : test))
  const submit = async event => {
    event.preventDefault()
    const testWithoutDate = tests.find(test => test.selected && !test.date)
    if (testWithoutDate) {
      setError(`${testWithoutDate.name}: select a test date before saving.`)
      return
    }
    const invalidTest = tests.find(test => test.selected && test.min != null && test.score !== '' && (
      Number(test.score) < test.min || Number(test.score) > test.max || Math.abs((Number(test.score) - test.min) / test.step - Math.round((Number(test.score) - test.min) / test.step)) > 1e-9
    ))
    if (invalidTest) {
      setError(`${invalidTest.name}: enter a score from ${invalidTest.min} to ${invalidTest.max} in increments of ${invalidTest.step}.`)
      return
    }
    setSaving(true); setError('')
    try {
      await onSave(tests.filter(test => test.selected))
      onClose()
    } catch (saveError) {
      setError(saveError.message || 'Could not save your test results.')
    } finally { setSaving(false) }
  }

  return <div className="exam-step-backdrop"><motion.form className="exam-step" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="exam-step-title" initial={{opacity:0,y:24,scale:.98}} animate={{opacity:1,y:0,scale:1}}>
    <header><div><span className="eyebrow purple">PROFILE · TEST RESULTS</span><h1 id="exam-step-title">Which exams have you taken?</h1><p>Add completed tests or exams you are planning. You can update them later.</p></div><button type="button" className="exam-close" onClick={onClose} aria-label="Close">×</button></header>
    <div className="exam-list">{tests.map(test => <article key={test.code} className={test.selected ? 'selected' : ''}>
      <label className="exam-select"><input type="checkbox" checked={test.selected} onChange={event => update(test.code,{selected:event.target.checked})}/><span><b>{test.name}</b><small>{test.range}</small></span></label>
      {test.selected && <div className="exam-fields"><label><span>Status</span><select value={test.status} onChange={event => update(test.code,{status:event.target.value,date:''})}><option value="completed">Completed</option><option value="mock">МОК тест</option><option value="planned">Planned</option></select></label><label><span>{['OTHER','CAMBRIDGE','A_LEVEL'].includes(test.code) ? 'Result' : 'Score'}</span>{['OTHER','CAMBRIDGE','A_LEVEL'].includes(test.code) ? <input value={test.scoreText} onChange={event => update(test.code,{scoreText:event.target.value})} placeholder="Enter result"/> : <input type="number" min={test.min} max={test.max} step={test.step} value={test.score} onChange={event => update(test.code,{score:event.target.value})} placeholder={test.range}/>}</label><label><span>{test.status === 'planned' ? 'Planned date' : 'Test date'} *</span><input type="date" required value={test.date} onChange={event => update(test.code,{date:event.target.value})}/></label></div>}
    </article>)}</div>
    {error && <p className="exam-error">{error}</p>}
    <footer><small>These results will be used to match admission requirements.</small><button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save and continue'} <span>{icons.arrow}</span></button></footer>
  </motion.form></div>
}

function LoginScreen({ onLogin }) {
  return <main className="login-screen"><motion.section className="login-card" initial={{opacity:0,y:20,scale:.98}} animate={{opacity:1,y:0,scale:1}}><div className="login-brand"><span className="brand-mark">P</span><b>path<span>2</span>uni</b></div><img src={mascot} alt="Leo mascot"/><span className="eyebrow purple">SEE YOU SOON, MILA</span><h1>You’ve logged out.</h1><p>Your roadmap, saved universities and friends are still safely stored on this device.</p><button className="button primary" onClick={onLogin}>Log back in <span>{icons.arrow}</span></button></motion.section></main>
}

function Footer() {
  return <footer className="site-footer"><div className="footer-main"><div className="footer-left"><div className="footer-school"><span>134 лицей</span><p>Дугашев Айсар <b>командир</b></p><p>Оралхан Нурланды</p><p>Кензин Эльмир</p></div><div className="footer-partner"><span>FIZTEX</span><p>Игорь Пак</p></div></div><div className="footer-contact"><span>Почта руководителя</span><a href="mailto:aisardugasev@gmail.com">aisardugasev@gmail.com</a></div></div><div className="footer-place"><span>Алматы</span><b>2026</b></div></footer>
}

function Chat({ open, onClose }) { const [messages, setMessages] = useState([{from:'leo', text:'Hi Mila! I’m Leo, your admission guide. What would you like to make clearer today?'}]); const [draft, setDraft] = useState(''); const send = () => { if (!draft.trim()) return; setMessages(v => [...v, {from:'user', text:draft}, {from:'leo', text:'Great question. I’ve added that to your personal plan — let’s take it one piece at a time.'}]); setDraft('') }; return <aside className={`chat ${open ? 'open' : ''}`} aria-hidden={!open}><div className="chat-head"><div><img src={mascot} alt=""/><span><b>Leo AI</b><small>Here to guide you</small></span></div><button onClick={onClose}>×</button></div><div className="chat-messages">{messages.map((m,i)=><p className={m.from} key={i}>{m.text}</p>)}</div><div className="chat-quick"><button onClick={() => setDraft('Help me choose a language test')}>Choose a language test</button><button onClick={() => setDraft('What should I do this week?')}>Plan my week</button></div><form onSubmit={e=>{e.preventDefault();send()}}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Ask Leo anything…"/><button aria-label="Send message">{icons.arrow}</button></form></aside> }

export default function App() {
  const [page, setPage] = useState('home'); const [chatOpen, setChatOpen] = useState(false)
  const [focusedNodeId, setFocusedNodeId] = useState(null)
  const [loggedIn, setLoggedIn] = useState(() => localStorage.getItem('path2uni:loggedIn') !== 'false')
  const [applicantProfile, setApplicantProfile] = useState(loadApplicantProfile)
  const [examStepOpen, setExamStepOpen] = useState(false)
  const [admissionPlan, setAdmissionPlan] = useState(cloneAdmissionPlan)
  const [favorites, setFavorites] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('path2uni:favorites')); return Array.isArray(saved) ? saved : [] } catch { return [] }
  })
  const [friends, setFriends] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('path2uni:friends'))
      return Array.isArray(saved) ? saved.map(friend => ({ ...friend, nickname:friend.nickname || `@${friend.id}` })) : friendProfiles
    } catch { return friendProfiles }
  })
  useEffect(() => { localStorage.setItem('path2uni:favorites', JSON.stringify(favorites)) }, [favorites])
  useEffect(() => { localStorage.setItem('path2uni:friends', JSON.stringify(friends)) }, [friends])
  useEffect(() => { localStorage.setItem('path2uni:loggedIn', String(loggedIn)) }, [loggedIn])
  const toggleFavorite = university => setFavorites(current => current.some(item => item.id === university.id) ? current.filter(item => item.id !== university.id) : [...current, university])
  const addFriend = rawNickname => {
    const clean = rawNickname.trim().replace(/^@+/, '').replace(/\s+/g, '')
    if (clean.length < 3) return { ok:false, message:'Enter at least 3 characters after @.' }
    if (!/^[a-zA-Z0-9._-]+$/.test(clean)) return { ok:false, message:'Use letters, numbers, dots, underscores or dashes.' }
    if (friends.some(friend => friend.nickname?.replace(/^@/, '').toLowerCase() === clean.toLowerCase())) return { ok:false, message:`@${clean} is already in your crew.` }
    const readable = clean.split(/[._-]/)[0]
    const name = readable.charAt(0).toUpperCase() + readable.slice(1)
    const friend = { id:`friend-${Date.now()}`, nickname:`@${clean}`, name, initials:name.charAt(0) || '?', className:`a${friends.length % 4 + 1}`, university:'Not selected yet' }
    setFriends(current => [...current, friend])
    return { ok:true, message:`${friend.nickname} was added to your crew.` }
  }
  const openOSINT = nodeId => { setFocusedNodeId(nodeId); setPage('intel') }
  const logOut = () => { setChatOpen(false); setLoggedIn(false) }
  const logIn = () => { setLoggedIn(true); setPage('home'); setExamStepOpen(true) }
  const saveTests = async tests => setApplicantProfile(await saveApplicantTests(tests))
  const handleGeneratePlan = async objective => setAdmissionPlan(await generateAdmissionPlan({ profile:admissionProfile, objective }))
  const nav = [{label:'Home',icon:'home',id:'home'}, {label:'My path',icon:'path',id:'roadmap'}, {label:'Decision map',icon:'search',id:'intel'}, {label:'Universities',icon:'uni',id:'universities'}, {label:'Friends',icon:'friends',id:'friends'}]
  if (!loggedIn) return <LoginScreen onLogin={logIn}/>
  const body = page === 'home' ? <Dashboard setChatOpen={setChatOpen} setPage={setPage}/> : page === 'roadmap' ? <GamePath setChatOpen={setChatOpen} plan={admissionPlan} onOpenOSINT={openOSINT}/> : page === 'profile' ? <ProfileV2 favorites={favorites} setPage={setPage} onToggleFavorite={toggleFavorite} friends={friends} onLogout={logOut} applicantProfile={applicantProfile} onOpenExamStep={() => setExamStepOpen(true)}/> : page === 'intel' ? <OSINTFlow setPage={setPage} plan={admissionPlan} onGenerate={handleGeneratePlan} focusedNodeId={focusedNodeId}/> : page === 'universities' ? <UniversityExplorer favorites={favorites} onToggleFavorite={toggleFavorite} friends={friends}/> : <Friends friends={friends} onAddFriend={addFriend}/>
  return <div className="app-shell"><aside className="sidebar"><button className="brand" onClick={() => setPage('home')}><span className="brand-mark">P</span><span>path<span>2</span>uni</span></button><nav>{nav.map(item=><NavItem key={item.id} item={item} active={page===item.id || (page==='roadmap' && item.id==='roadmap')} onClick={() => { if (item.id === 'intel') setFocusedNodeId(null); setPage(item.id) }}/>)}</nav><div className="sidebar-bottom"><button className="profile-mini" onClick={() => setPage('profile')}><span className="user-pic">M</span><span><b>Mila A.</b><small>My profile</small></span><i>{icons.chevron}</i></button></div></aside><header className="topbar"><button className="mobile-brand brand" onClick={() => setPage('home')}><span className="brand-mark">P</span>path<span>2</span>uni</button><div className="top-actions"><button className="xp-pill">✦ 1,240 XP</button><button className="bell" aria-label="Notifications">{icons.bell}<i/></button><button className="mobile-menu" onClick={() => setChatOpen(true)}>☰</button></div></header><AnimatePresence mode="wait"><motion.div key={page} className="page-transition" initial={{opacity:0,y:14,filter:'blur(5px)'}} animate={{opacity:1,y:0,filter:'blur(0px)'}} exit={{opacity:0,y:-8,filter:'blur(3px)'}} transition={{duration:.28,ease:[.22,1,.36,1]}}>{body}</motion.div></AnimatePresence><Footer/><motion.button whileHover={{scale:1.06,y:-3}} whileTap={{scale:.93}} className="leo-fab" onClick={() => setChatOpen(true)} aria-label="Open Leo AI"><img src={mascot} alt=""/><span>Ask Leo <b>✦</b></span></motion.button><Chat open={chatOpen} onClose={() => setChatOpen(false)}/>{chatOpen && <button className="overlay" onClick={() => setChatOpen(false)} aria-label="Close Leo AI"/>}{examStepOpen && <ExamResultsStep initialTests={applicantProfile.tests} onSave={saveTests} onClose={() => setExamStepOpen(false)}/>}</div>
}
