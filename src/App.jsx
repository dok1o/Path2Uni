import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import mascot from './assets/leo-mascot.png'
import cityFallback from './assets/cities/city-fallback.jpg'
import Auth from './Auth.jsx'
import Onboarding from './Onboarding.jsx'
import Advisor, { Comparison } from './Advisor.jsx'
import { countryCatalog, getCountryMap, MAP_VIEWBOX } from './data/countryMaps.js'
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

const friendProfiles = [
  { id:'amir', nickname:'@amirgoesglobal', name:'Amir', initials:'A', className:'a1', university:'Bocconi University' },
  { id:'lina', nickname:'@lina.study', name:'Lina', initials:'L', className:'a2', university:'University of Bologna' },
  { id:'noah', nickname:'@noahbuilds', name:'Noah', initials:'N', className:'a3', university:'Politecnico di Milano' },
  { id:'sofia', nickname:'@sofia.italia', name:'Sofia', initials:'S', className:'a4', university:'Sapienza University' },
]

function NavItem({ item, active, onClick }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span>{icons[item.icon]}</span>{item.label}</button>
}

function GamePath({ setChatOpen, plan, onOpenOSINT, onTaskDone }) {
  const [selected, setSelected] = useState(1)
  const levels = plan.tasks.map((task,index) => ({ ...task, id:index + 1, side:index % 2 ? 'right' : 'left', sub:task.due }))
  const doneCount = levels.filter(level => level.state === 'done').length
  const earned = levels.filter(level => level.state === 'done').reduce((sum, level) => sum + (level.xp ?? 0), 0)
  const progress = levels.length ? doneCount / levels.length * 100 : 0
  const active = levels.find(level => level.id === selected) ?? levels[0]
  return <main className="page game-page"><section className="game-head"><div><span className="eyebrow purple">MY PATH · AI-GENERATED</span><h1>Your next chapter<br/>starts here.</h1><p>The task order comes from your profile, verified OSINT research and admission goals.</p><div className="ai-task-types">{['research','documents','application'].map(type => <span key={type}><i><TaskIcon type={type}/></i>{type}</span>)}</div></div><button className="game-leo-tip" onClick={() => setChatOpen(true)}><img src={mascot} alt="Leo mascot"/><span><b>Leo’s hint</b><small>Tap a path point to see why AI created it.</small></span><i>{icons.chevron}</i></button></section><section className="game-meta"><div><span className="game-stat-icon">✦</span><b>{earned.toLocaleString('en-US')}</b><small>XP earned</small></div><div><span className="game-stat-icon fire">♨</span><b>{Math.round(progress)}%</b><small>of your plan</small></div><div><span className="game-stat-icon gem">◆</span><b>{levels.length}</b><small>AI tasks</small></div><div><span className="game-stat-icon energy">⚡</span><b>{doneCount} / {levels.length}</b><small>tasks done</small></div></section><section className="game-map-shell"><div className="game-map-title"><span>AI ROADMAP · CONNECTED TO OSINT</span><h2>Research to application</h2><small>Tap any point to open its evidence graph</small></div><div className="game-map"><svg className="game-line" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M29 17 C72 28 70 39 29 48 S28 68 70 80"/></svg>{levels.map((level,index) => <button key={level.id} style={{top:`${16 + index * 31}%`}} className={`game-level ${level.state} ${level.side} ${selected === level.id ? 'selected' : ''}`} onClick={() => { setSelected(level.id); onOpenOSINT(level.type) }}><span className="level-disc"><i><TaskIcon type={level.type}/></i><b>{level.id}</b></span><span className="level-label"><strong>{level.shortTitle}</strong><small>Open in OSINT graph →</small></span></button>)}<div className="path-reward reward-one">♜<small>+ 120 XP</small></div><div className="path-reward reward-two">✉<small>AI task</small></div></div><aside className="level-panel"><span className="panel-kicker">AI TASK · {active.id} OF {levels.length}</span><div className={`panel-task-icon ${active.type}`}><TaskIcon type={active.type}/></div><h2>{active.title}</h2><p>{active.description}</p><div className="level-quests">{active.subtasks.map((task,i) => <div key={task} className={active.state === 'current' && i === 0 ? 'quest complete' : 'quest'}><i>{active.state === 'current' && i === 0 ? '✓' : i + 1}</i><span>{task}</span>{i === 0 && <b>+{Math.round(active.xp/3)} XP</b>}</div>)}</div><div className="panel-actions"><button className={`button ${active.state === 'done' ? 'soft' : 'primary'}`} onClick={() => onTaskDone(active.position, active.state !== 'done')}>{active.state === 'done' ? 'Completed — undo' : 'Mark as done'} <span>{active.state === 'done' ? '↺' : '✓'}</span></button><button className="button soft" onClick={() => onOpenOSINT(active.type)}>Open evidence graph <span>{icons.arrow}</span></button></div></aside></section></main>
}

function Greeting({ setChatOpen, name }) {
  return <section className="greeting-card">
    <div className="greeting-copy"><span className="eyebrow purple">TUESDAY, 17 SEPTEMBER</span><h1>Good morning, {name} <span>✦</span></h1><p>You’re doing brilliantly. One small task today brings your Italian dream closer.</p><div className="daily-action"><div className="action-icon">✉</div><div><small>TODAY’S QUEST · 8 MIN</small><strong>Tell us what makes you curious</strong><span>Start your profile story to unlock tailored university matches.</span></div><button className="button dark" onClick={() => setChatOpen(true)}>Start <span>{icons.arrow}</span></button></div></div>
    <div className="mascot-scene"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="mascot-bubble">You’ve got this!<br/><span>Let’s take one step.</span></div><img src={mascot} alt="Leo, the Path2Uni mascot" className="mascot"/></div>
  </section>
}

function Stat({ icon, value, label, note, className = '' }) { return <article className={`stat-card ${className}`}><div className="stat-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span>{note && <small>{note}</small>}</div></article> }

function HomeQuestPath({ setPage, plan, profile }) {
  // Built from the plan this person actually has, so ticking a task off on My path moves
  // this too. The first two steps are what onboarding already answered.
  const mark = { done: '✓', current: '✦', locked: '·' }
  const steps = [
    { id: 1, icon: '✓', label: destinationSummary(profile), state: 'done' },
    { id: 2, icon: '✓', label: profile.field, state: 'done' },
    ...(plan?.tasks ?? []).slice(0, 3).map((task, index) => ({
      id: index + 3, icon: mark[task.state] ?? '·', label: task.shortTitle,
      state: task.state === 'current' ? 'active' : task.state,
    })),
  ]
  return <article className="home-game-card"><div className="home-game-head"><div><span className="eyebrow purple">TODAY ON YOUR PATH</span><h2>Three quests to level up</h2></div><div className="reward-chip">◆ +120 XP</div></div><div className="home-quest-track">{steps.map((step,index) => <div className={`home-quest ${step.state}`} key={step.id}>{index < steps.length - 1 && <i className="quest-rail"/>}<button onClick={() => setPage('roadmap')}><span>{step.state === 'locked' ? '⌑' : step.icon}</span><b>{step.id}</b></button><small>{step.label}</small></div>)}</div><div className="home-active-quest"><span className="mini-gem">✦</span><div><small>ACTIVE QUEST · 4 MIN</small><strong>Add your latest academic result</strong><p>Complete it to unlock your personalised IELTS plan.</p></div><button className="button primary" onClick={() => setPage('roadmap')}>Play <span>{icons.arrow}</span></button></div></article>
}

function Dashboard({ setChatOpen, setPage, name, plan, profile, tests }) {
  const list = plan?.tasks ?? []
  const done = list.filter(task => task.state === 'done').length
  const total = list.length
  const earned = list.filter(task => task.state === 'done').reduce((sum, task) => sum + (task.xp ?? 0), 0)
  const possible = list.reduce((sum, task) => sum + (task.xp ?? 0), 0)
  const exams = tests?.length ?? 0
  return <main className="page dashboard-page"><Greeting setChatOpen={setChatOpen} name={name}/><section className="stats-row"><Stat icon="⚡" value={`${done} / ${total}`} label="Tasks completed" note={total ? `${Math.round(done / total * 100)}% of your plan` : 'Generate your plan first'} className="orange"/><Stat icon="✦" value={earned.toLocaleString('en-US')} label="XP earned" note={`of ${possible.toLocaleString('en-US')} in this plan`} className="violet"/><Stat icon="◒" value={String(exams)} label={exams === 1 ? 'Exam recorded' : 'Exams recorded'} note={exams ? 'Used in your matches' : 'Add them in your profile'} className="blue"/></section><section className="dash-grid"><HomeQuestPath setPage={setPage} plan={plan} profile={profile}/><aside className="side-stack"><article className="deadline-card"><div className="card-top"><span className="warning-dot">!</span><span>UPCOMING DEADLINE</span><button>•••</button></div><h3>Complete your profile</h3><p>It helps Leo make your roadmap personal.</p><div className="deadline-bottom"><strong>5 days left</strong><button className="round-arrow" onClick={() => setPage('roadmap')}>{icons.arrow}</button></div></article><article className="friend-card"><div className="card-top"><span>YOUR CREW</span><button className="text-button" onClick={() => setPage('friends')}>See all</button></div><div className="avatars"><span className="avatar a1">A</span><span className="avatar a2">L</span><span className="avatar a3">N</span><span className="avatar a4">+4</span></div><p><b>Amir</b> just completed “Choose your test”. Send a high-five!</p><button className="high-five">✋ Send a high-five</button></article></aside></section></main>
}

function OSINTFlow({ setPage, plan, onGenerate, focusedNodeId, profile }) {
  const [selectedId, setSelectedId] = useState(focusedNodeId || 'research')
  const [objective, setObjective] = useState(`Find the best ${profile.field} ${profile.degree} programmes in ${profile.destinationLabel} for ${profile.intake} and build my application plan`)
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
    <section className="osint-control"><div><span className="control-label">YOUR ADMISSION OBJECTIVE</span><textarea value={objective} onChange={event => setObjective(event.target.value)} aria-label="Admission objective"/><div className="profile-context">{[...destinationLabels(profile), profile.degree, profile.field, `${profile.intake} intake`, `English ${profile.englishLevel}`].map(chip => <span key={chip}>{chip}</span>)}</div></div><motion.button whileHover={{scale:1.025}} whileTap={{scale:.97}} className={`button primary generate-button ${isGenerating ? 'loading' : ''}`} disabled={isGenerating || !objective.trim()} onClick={runGeneration}>{isGenerating ? <><i/>Researching sources…</> : <>Generate graph <span>✦</span></>}</motion.button></section>
    <section className="osint-workspace"><article className="osint-graph-card"><div className="graph-toolbar"><div><span className="eyebrow purple">INTERACTIVE KNOWLEDGE GRAPH</span><h2>Admission intelligence</h2></div><div className="source-health"><i/>12 sources verified</div></div><div className="flow-canvas"><ReactFlow nodes={flowNodes} edges={flowEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={handleNodeClick} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:.18}} minZoom={.55} maxZoom={1.7} nodesConnectable={false} deleteKeyCode={null} proOptions={{hideAttribution:true}}><Background gap={18} size={1} color="#d6d5e2"/><Controls showInteractive={false}/><MiniMap className={miniMapHidden ? 'minimap-hidden' : ''} pannable zoomable nodeStrokeWidth={3} nodeColor={node => node.data.type === 'source' ? '#45b979' : node.data.type === 'task' ? '#8a63d1' : '#7464cf'} maskColor="rgba(242,242,249,.72)"/></ReactFlow><div className="flow-hint">Drag nodes · scroll to zoom · click to inspect</div><button className={`minimap-toggle ${miniMapHidden ? 'is-hidden' : ''}`} onClick={() => setMiniMapHidden(value => !value)}>{miniMapHidden ? 'Show map' : 'Hide map'}</button></div><div className="osint-legend"><span><i className="profile"/>Profile data</span><span><i className="evidence"/>Verified evidence</span><span><i className="logic"/>Requirement</span><span><i className="task"/>Generated task</span></div></article>
      <AnimatePresence mode="wait"><motion.aside key={selected.id} className="node-inspector" initial={{opacity:0,x:22}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-12}} transition={{type:'spring',stiffness:260,damping:25}}><span className={`node-kind ${selected.type}`}>{selected.type === 'task' ? `generated ${selected.taskType} task` : selected.type}</span><h2>{selected.label}</h2><p>{selected.detail}</p>{selected.type === 'source' && <div className="source-list"><span><b>Universitaly</b><small>Official · checked today</small></span><span><b>University admissions pages</b><small>8 sources · official</small></span><span><b>Italian visa portal</b><small>Official · checked today</small></span></div>}<div className="node-connections"><small>CONNECTED NODES</small>{connectedIds.map(id => { const node=sourceNodes.find(item => item.id === id); return <button key={id} onClick={() => setSelectedId(id)}>{node.label}<b>{icons.arrow}</b></button> })}</div>{selected.type === 'task' && <motion.button whileHover={{y:-2}} whileTap={{scale:.97}} className="button primary" onClick={() => setPage('roadmap')}>Open in My Path <span>{icons.arrow}</span></motion.button>}</motion.aside></AnimatePresence>
    </section>
    <section className="task-contract"><div><span className="eyebrow">OUTPUT FOR MY PATH</span><h2>Three starter task types</h2><p>The future AI can return any number of tasks using this same structure.</p></div>{plan.tasks.map((task,index) => <motion.article key={task.id} initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{delay:.15+index*.08}} whileHover={{y:-6,rotate:index===1 ? 1 : -1}}><i className={task.type}><TaskIcon type={task.type}/></i><span><small>0{index+1} · {task.type}</small><b>{task.shortTitle}</b><em>{task.xp} XP</em></span></motion.article>)}</section>
  </main>
}

function CountryFlag({ country }) {
  return <i className={`flag flag-${country.id}`} aria-hidden="true" />
}

const cityImageCache = new Map()
function CityBackdrop({ city }) {
  const [image,setImage]=useState(()=>cityImageCache.get(city)?.image||cityFallback)
  const [source,setSource]=useState(()=>cityImageCache.get(city)?.source||'')
  useEffect(()=>{
    let active=true
    const cached=cityImageCache.get(city)
    if(cached){setImage(cached.image);setSource(cached.source);return()=>{active=false}}
    setImage(cityFallback);setSource('')
    const params=new URLSearchParams({action:'query',format:'json',origin:'*',prop:'pageimages|info',inprop:'url',piprop:'thumbnail',pithumbsize:'1600',titles:city})
    fetch(`https://en.wikipedia.org/w/api.php?${params}`).then(response=>response.ok?response.json():Promise.reject()).then(data=>{
      const page=Object.values(data.query?.pages||{})[0]
      if(!active||!page?.thumbnail?.source)return
      const result={image:page.thumbnail.source,source:page.fullurl||''}
      cityImageCache.set(city,result);setImage(result.image);setSource(result.source)
    }).catch(()=>{})
    return()=>{active=false}
  },[city])
  return <div className="city-photo-backdrop" style={{backgroundImage:`url("${image}")`}}>{source&&<a href={source} target="_blank" rel="noreferrer">Photo: Wikimedia</a>}</div>
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
        <AnimatePresence mode="wait">{city && <motion.div key={`${country.id}-${city.name}`} className="city-scene visible social-city-scene" initial={{ opacity: 0, scale: .92, x: 45 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: .96, x: -30 }} transition={{ type:'spring',stiffness:170,damping:22 }}><CityBackdrop city={city.name}/><button className="city-back" onClick={() => setCity(null)}>← Back to {country.name}</button><div className="city-title"><span className="eyebrow">WELCOME TO</span><h2>{city.name}</h2><p>{city.note}</p></div><div className="city-universities">{city.universities.map((university,index)=>{const saved=Boolean(savedItem(university));const people=friends.filter(friend=>friend.university===university.name);return <motion.article layout key={university.id} className={`city-uni-card social-uni-card ${saved?'is-saved':''}`} whileHover={{y:-4}}><span className="uni-pin">{index+1}</span><span className="uni-card-main"><strong>{university.name}</strong><small>{university.focus}</small><span className="uni-social-proof"><span className="friend-stack">{people.slice(0,3).map(friend=><i key={friend.id} title={`${friend.name} ${friend.nickname}`} className={`friend-dot ${friend.className}`}>{friend.initials}</i>)}</span><em>{people.length?`${people.slice(0,2).map(friend=>friend.name).join(' & ')}${people.length>2?` +${people.length-2}`:''} chose this university`:saved?'Saved to your shortlist':'Explore programmes and admissions'}</em></span></span><motion.button whileTap={{scale:.78,rotate:-15}} className={`favorite-star ${saved?'saved':''}`} onClick={()=>toggleUniversity(university)} aria-label={saved?`Remove ${university.name} from saved`:`Save ${university.name}`}>{saved?'★':'☆'}</motion.button></motion.article>})}</div></motion.div>}</AnimatePresence>
      </div>
      <aside className="country-sidebar"><span className="country-badge"><CountryFlag country={country}/>DESTINATION MAP</span><h2>{city?.name || country.name}</h2><p>{city ? `Compare universities in ${city.name} and save the ones you want to revisit.` : 'Pick a glowing city point, or drag the country contour to see it from another angle.'}</p><div className="country-facts">{city ? <><div><b>{city.universities.length}</b><small>universities shown</small></div><div><b>{countryFavorites.length}</b><small>saved here</small></div></> : <><div><b>{country.cities.length}</b><small>cities mapped</small></div><div><b>{totalUniversities}</b><small>universities to explore</small></div></>}</div>{!city && <div className="map-legend"><span><i className="legend-pulse"/>Tap a glowing point</span><small>Every outline uses its national flag colours and can rotate in 3D.</small></div>}<button className="button primary" onClick={() => setCity(city || country.cities[0])}>{city ? 'Review city shortlist' : `Explore ${country.cities[0].name}`} <span>{icons.arrow}</span></button></aside>
    </section>
  </main>
}

// The profile is edited in two places, and they must never become two sources of truth for
// the same fact. Destination, degree, field and intake live in the database and decide the
// shortlist, so "Your goals" reopens the real onboarding editor rather than a second form.
// The rest has no column yet and stays in localStorage until one exists — and nothing here
// is prefilled with an invented person, because a name you did not type is not your profile.
const profileDefaults = { firstName:'',lastName:'',birthDate:'',citizenship:'',city:'',education:'',school:'',graduationYear:'',language:'',budget:'',activities:'',awards:'',skills:'',portfolio:'' }
const profileEditorFields = {
  about:{title:'About you',subtitle:'Personal details, education and language',fields:[['firstName','First name','text'],['lastName','Last name','text'],['birthDate','Date of birth','date'],['citizenship','Citizenship','text'],['city','Current city','text'],['education','Education level','text'],['school','School or university','text'],['graduationYear','Graduation year','number'],['language','Other languages','text']]},
  strengths:{title:'Your strengths',subtitle:'Activities, awards and portfolio',fields:[['activities','Activities','textarea'],['awards','Awards and achievements','textarea'],['skills','Skills','textarea'],['portfolio','Portfolio link','url'],['budget','Annual budget (EUR)','number']]},
}

function ProfileEditor({ section, values, onSave, onClose }) {
  const config=profileEditorFields[section]
  const [draft,setDraft]=useState(values)
  return <div className="profile-editor-backdrop" onMouseDown={event => event.target===event.currentTarget && onClose()}><motion.form className="profile-editor" onSubmit={event => { event.preventDefault(); onSave(draft) }} initial={{opacity:0,y:20,scale:.98}} animate={{opacity:1,y:0,scale:1}} role="dialog" aria-modal="true"><header><div><span className="eyebrow purple">PROFILE DETAILS</span><h2>{config.title}</h2><p>{config.subtitle}</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></header><div className="profile-editor-fields">{config.fields.map(([key,label,type]) => <label key={key} className={type==='textarea'?'wide':''}><span>{label}</span>{type==='textarea'?<textarea value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})} placeholder={`Add ${label.toLowerCase()}`}/>:<input type={type} value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})}/>}</label>)}</div><footer><button type="button" className="button soft" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Save changes <span>✓</span></button></footer></motion.form></div>
}

function ProfileV2({ favorites, setPage, onToggleFavorite, friends, onLogout, user, profile, applicantProfile, onOpenExamStep, onEditProfile }) {
  const [tab, setTab] = useState('overview')
  const [editor,setEditor]=useState(null)
  const [highFives,setHighFives]=useState(()=>new Set())
  const [details,setDetails]=useState(()=>{try{return {...profileDefaults,...JSON.parse(localStorage.getItem('path2uni:profileDetails'))}}catch{return profileDefaults}})
  const saveDetails=next=>{setDetails(next);localStorage.setItem('path2uni:profileDetails',JSON.stringify(next));setEditor(null)}
  const testSummary = applicantProfile.tests?.length ? `${applicantProfile.tests.length} test${applicantProfile.tests.length === 1 ? '' : 's'} added` : 'Add completed and planned exams'
  const sections=[{title:'About you',description:'Personal details, education and language',action:'about'},{title:'Your goals',description:`${destinationLabels(profile).join(', ')} · ${profile.field} · ${profile.intake}`,action:'goals'},{title:'Test results',description:testSummary,action:'tests'},{title:'Your strengths',description:'Activities, awards and portfolio',action:'strengths'}]
  const tabs = [{id:'overview',label:'Overview'}, {id:'saved',label:'Saved',count:favorites.length}, {id:'friends',label:'Friends',count:friends.length}]
  const tracked=['firstName','lastName','birthDate','citizenship','city','education','school','graduationYear','language','budget','activities','awards','skills','portfolio']
  // Goals and the account name are already on file — onboarding required them — so they count
  // as done rather than sitting forever as two missing items nobody can fill in from here.
  const completion=Math.round((tracked.filter(key=>String(details[key]||'').trim()).length+2+(applicantProfile.tests?.length?1:0))/(tracked.length+3)*100)
  const initials=(user.displayName||user.username).trim().charAt(0).toUpperCase()
  const toggleHighFive=id=>setHighFives(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next})

  return <main className="page profile-page profile-v2"><section className="profile-hero"><div className="profile-avatar">{initials}</div><div><span className="eyebrow purple">MY PROFILE</span><h1>{user.displayName || user.username}</h1><p>{destinationLabels(profile).join(' · ')} · {profile.degree} · {profile.intake} intake</p></div><div className="profile-actions"><button className="button soft" onClick={onEditProfile}>Edit profile <span>✎</span></button><button className="logout-button" onClick={onLogout}>Log out ↗</button></div></section><nav className="profile-tabs" aria-label="Profile sections">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}{item.count != null && <span>{item.count}</span>}</button>)}</nav>
    <AnimatePresence mode="wait"><motion.section key={tab} className="profile-tab-panel" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.2}}>{tab === 'overview' && <><section className="profile-progress"><div><span className="eyebrow">PROFILE COMPLETION</span><h2>{completion}% complete</h2><p>{completion===100?'Your profile is complete and ready for personalised recommendations.':'Complete the remaining details so Leo can tailor every recommendation.'}</p></div><div className="progress-circle" style={{background:`conic-gradient(#6653d8 0 ${completion}%,#ebeafd ${completion}%)`}}><b>{completion}%</b></div></section><section className="profile-grid"><div className="profile-sections">{sections.map((section,index) => <button className="profile-section" key={section.title} onClick={()=>section.action==='tests'?onOpenExamStep():section.action==='goals'?onEditProfile():setEditor(section.action)}><span className="profile-number">0{index + 1}</span><span><h3>{section.title}</h3><p>{section.description}</p></span><i>{icons.chevron}</i></button>)}</div><aside className="profile-next"><img src={mascot} alt="Leo mascot"/><span className="eyebrow purple">NEXT BEST STEP</span><h3>Tell us about your test results</h3><p>It takes about 3 minutes and improves your university matches.</p><button className="button dark" onClick={onOpenExamStep}>Complete now <span>{icons.arrow}</span></button></aside></section></>}
      {tab === 'saved' && <section className="saved-panel"><div className="tab-intro"><span className="eyebrow purple">YOUR SHORTLIST</span><h2>Universities worth coming back to.</h2><p>Every gold star from the country map is collected here.</p></div>{favorites.length ? <div className="saved-grid">{favorites.map((university,index) => { const people = friends.filter(friend => friend.university === university.name); return <motion.article layout key={university.id} className="saved-university" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:index*.05}}><button className="favorite-star saved" onClick={() => onToggleFavorite(university)} aria-label={`Remove ${university.name} from saved`}>★</button><span className="saved-rank">0{index+1}</span><small>{university.city}, {university.country}</small><h3>{university.name}</h3><p>{university.match} · English programmes</p><div className="saved-card-bottom"><span className="friend-stack">{people.slice(0,3).map(friend => <i key={friend.id} className={`friend-dot ${friend.className}`}>{friend.initials}</i>)}</span><button onClick={() => setPage('universities')}>View on map {icons.arrow}</button></div></motion.article> })}</div> : <div className="profile-empty"><span>☆</span><h3>No saved universities yet</h3><p>Explore a country and tap a star on any university you want to compare later.</p><button className="button primary" onClick={() => setPage('universities')}>Explore universities <span>{icons.arrow}</span></button></div>}</section>}
      {tab === 'friends' && <section className="profile-friends-panel"><div className="tab-intro tab-intro-row"><div><span className="eyebrow purple">YOUR ADMISSION CREW</span><h2>See where your friends are heading.</h2><p>Their university choices also appear directly on the city cards.</p></div><button className="button soft" onClick={() => setPage('friends')}>+ Add by nickname</button></div><div className="profile-friend-grid">{friends.map((friend,index) => <motion.article key={friend.id} initial={{opacity:0,x:-12}} animate={{opacity:1,x:0}} transition={{delay:index*.06}}><span className={`avatar ${friend.className}`}>{friend.initials}</span><div><h3>{friend.name} <small>{friend.nickname}</small></h3><p>{friend.university === 'Not selected yet' ? 'Choosing a destination' : <>Chose <b>{friend.university}</b></>}</p></div><span className="friend-choice-star">★</span><button className={`high-five ${highFives.has(friend.id)?'sent':''}`} onClick={()=>toggleHighFive(friend.id)}>{highFives.has(friend.id)?'✓ Sent':'✋ High-five'}</button></motion.article>)}</div></section>}</motion.section></AnimatePresence>{editor&&<ProfileEditor section={editor} values={details} onSave={saveDetails} onClose={()=>setEditor(null)}/>}
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

function Chat({ open, onClose, name, hasPlan }) {
  const [messages, setMessages] = useState([{ from: 'leo', text: `Hi ${name}! I\u2019m Leo, your admission guide. What would you like to make clearer today?` }])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, thinking])

  const send = async event => {
    event?.preventDefault()
    const question = draft.trim()
    if (!question || thinking) return
    const history = messages
    setMessages(current => [...current, { from: 'user', text: question }])
    setDraft(''); setThinking(true)
    try {
      const response = await fetch('/api/me/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history }),
      })
      const payload = await response.json().catch(() => ({}))
      setMessages(current => [...current, { from: 'leo', text: payload.reply || payload.error || 'Something went wrong on my side.', offline: payload.source?.kind === 'rules' }])
    } catch {
      setMessages(current => [...current, { from: 'leo', text: 'I can\u2019t reach the server right now.', offline: true }])
    } finally { setThinking(false) }
  }

  const quick = hasPlan
    ? ['What should I do this week?', 'Why is this task first?', 'Tell me about my universities']
    : ['How do I start?', 'What is the Decision Map for?']

  return <aside className={`chat ${open ? 'open' : ''}`} aria-hidden={!open}>
    <div className="chat-head"><div><img src={mascot} alt=""/><span><b>Leo AI</b><small>Here to guide you</small></span></div><button onClick={onClose} aria-label="Close">×</button></div>
    <div className="chat-messages" aria-live="polite">
      {messages.map((message, index) => <p className={`${message.from} ${message.offline ? 'offline' : ''}`} key={index}>{message.text}</p>)}
      {thinking && <p className="leo thinking"><i/><i/><i/></p>}
      <div ref={endRef}/>
    </div>
    <div className="chat-quick">{quick.map(text => <button key={text} onClick={() => setDraft(text)} disabled={thinking}>{text}</button>)}</div>
    <form onSubmit={send}>
      <input value={draft} onChange={event => setDraft(event.target.value)} placeholder={thinking ? 'Leo is thinking\u2026' : 'Ask Leo anything\u2026'} disabled={thinking}/>
      <button aria-label="Send message" disabled={thinking || !draft.trim()}>{icons.arrow}</button>
    </form>
  </aside>
}

// A profile saved before several destinations existed carries only the single label, so both
// helpers fall back to it rather than rendering an empty chip row.
const destinationLabels = profile => (profile.destinationLabels?.length ? profile.destinationLabels : [profile.destinationLabel]).filter(Boolean)
const destinationSummary = profile => { const list = destinationLabels(profile); return list.length > 2 ? `${list[0]} +${list.length - 1}` : list.join(' · ') }

export default function App() {
  const [page, setPage] = useState('home'); const [chatOpen, setChatOpen] = useState(false)
  const [focusedNodeId, setFocusedNodeId] = useState(null)
  // `undefined` = still asking the server, `null` = definitely signed out.
  const [user, setUser] = useState(undefined)
  const [profile, setProfile] = useState(undefined)
  const [admissionPlan, setAdmissionPlan] = useState(null)
  const [building, setBuilding] = useState(false)
  useEffect(() => {
    fetch('/api/auth/me').then(response => response.json())
      .then(payload => setUser(payload.user ?? null)).catch(() => setUser(null))
  }, [])

  const [applicantProfile, setApplicantProfile] = useState(loadApplicantProfile)
  const [examStepOpen, setExamStepOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  // Stage 5 opens over stage 4 rather than as its own page: the comparison only makes sense
  // against the shortlist you just picked from.
  const [comparing, setComparing] = useState(null)
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
  useEffect(() => {
    if (!user) { setProfile(undefined); return }
    let alive = true
    Promise.all([
      fetch('/api/me/profile').then(response => response.json()).catch(() => ({ profile: null })),
      fetch('/api/me/plan').then(response => response.json()).catch(() => ({ plan: null })),
    ]).then(async ([profilePayload, planPayload]) => {
      if (!alive) return
      const loaded = profilePayload.profile ?? null
      setProfile(loaded)
      if (planPayload.plan) { setAdmissionPlan(planPayload.plan); return }
      // Otherwise every page would show the Italy/Economics demo as if it were theirs.
      if (loaded) await buildFirstPlan(loaded, () => alive)
    })
    return () => { alive = false }
  }, [user])
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
  const saveTests = async tests => setApplicantProfile(await saveApplicantTests(tests))

  const setTaskDone = async (position, done) => {
    const response = await fetch('/api/me/task', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position, done }),
    })
    const payload = await response.json().catch(() => ({}))
    if (payload.plan) setAdmissionPlan(payload.plan)
  }

  const logOut = async () => {
    setChatOpen(false)
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null); setPage('home'); setProfile(undefined); setAdmissionPlan(null)
  }

  const defaultObjective = item =>
    `Find the best ${item.field} ${item.degree} programmes in ${item.destinationLabel} for ${item.intake} and build my application plan`

  const postPlan = async objective => {
    const response = await fetch('/api/me/plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objective }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.plan) throw new Error(payload.error || 'Could not generate the plan')
    return payload.plan
  }

  const buildFirstPlan = async (item, stillHere = () => true) => {
    setBuilding(true)
    try {
      const plan = await postPlan(defaultObjective(item))
      if (stillHere()) { setAdmissionPlan(plan); setFocusedNodeId(plan.tasks[0]?.id ?? null) }
    } catch { /* the Generate button is still there */ }
    finally { if (stillHere()) setBuilding(false) }
  }

  const handleGeneratePlan = async objective => {
    const plan = await postPlan(objective)
    setAdmissionPlan(plan); setFocusedNodeId(plan.tasks[0]?.id ?? null)
    return plan
  }
  const nav = [{label:'Home',icon:'home',id:'home'}, {label:'My matches',icon:'target',id:'advisor'}, {label:'My path',icon:'path',id:'roadmap'}, {label:'Decision map',icon:'search',id:'intel'}, {label:'Universities',icon:'uni',id:'universities'}, {label:'Friends',icon:'friends',id:'friends'}]
  if (user === undefined) return <div className="auth-booting"><span className="map-spinner"/>Checking your session…</div>
  if (user === null) return <Auth onSignedIn={setUser}/>
  if (profile === undefined) return <div className="auth-booting"><span className="map-spinner"/>Loading your path…</div>
  if (profile === null) return <Onboarding user={user} onDone={async item => { setProfile(item); await buildFirstPlan(item) }}/>
  // Re-answering rebuilds the plan, and the diagnosis cache keys on the answers, so the
  // matches change with it. That is the brief's "a changed answer visibly changes the result".
  if (editingProfile) return <Onboarding user={user} initial={profile} onCancel={() => setEditingProfile(false)}
    onDone={async item => { setProfile(item); setEditingProfile(false); await buildFirstPlan(item) }}/>
  if (building || !admissionPlan) return <div className="auth-booting"><span className="map-spinner"/>Building your path from your answers…</div>

  const firstName = (user.displayName || user.username).trim().split(/\s+/)[0]
  const initial = firstName.charAt(0).toUpperCase()
  const body = page === 'advisor' ? <Advisor profile={profile} onCompare={setComparing} onOpenPlan={() => setPage('roadmap')}/> : page === 'home' ? <Dashboard setChatOpen={setChatOpen} setPage={setPage} name={firstName} plan={admissionPlan} profile={profile} tests={applicantProfile.tests}/> : page === 'roadmap' ? <GamePath setChatOpen={setChatOpen} plan={admissionPlan} onOpenOSINT={openOSINT} onTaskDone={setTaskDone}/> : page === 'profile' ? <ProfileV2 favorites={favorites} setPage={setPage} onToggleFavorite={toggleFavorite} friends={friends} onLogout={logOut} user={user} profile={profile} applicantProfile={applicantProfile} onOpenExamStep={() => setExamStepOpen(true)} onEditProfile={() => setEditingProfile(true)}/> : page === 'intel' ? <OSINTFlow setPage={setPage} plan={admissionPlan} onGenerate={handleGeneratePlan} focusedNodeId={focusedNodeId} profile={profile}/> : page === 'universities' ? <UniversityExplorer favorites={favorites} onToggleFavorite={toggleFavorite} friends={friends}/> : <Friends friends={friends} onAddFriend={addFriend}/>
  return <div className="app-shell"><aside className="sidebar"><button className="brand" onClick={() => setPage('home')}><span className="brand-mark">P</span><span>path<span>2</span>uni</span></button><nav>{nav.map(item=><NavItem key={item.id} item={item} active={page===item.id || (page==='roadmap' && item.id==='roadmap')} onClick={() => { if (item.id === 'intel') setFocusedNodeId(null); setPage(item.id) }}/>)}</nav><div className="sidebar-bottom"><button className="profile-mini" onClick={() => setPage('profile')}><span className="user-pic">{initial}</span><span><b>{user.displayName || user.username}</b><small>My profile</small></span><i>{icons.chevron}</i></button></div></aside><header className="topbar"><button className="mobile-brand brand" onClick={() => setPage('home')}><span className="brand-mark">P</span>path<span>2</span>uni</button><div className="top-actions"><button className="xp-pill">✦ {(admissionPlan?.tasks ?? []).filter(task => task.state === 'done').reduce((sum, task) => sum + (task.xp ?? 0), 0).toLocaleString('en-US')} XP</button><button className="bell" aria-label="Notifications">{icons.bell}<i/></button><button className="mobile-menu" onClick={() => setChatOpen(true)}>☰</button></div></header><AnimatePresence mode="wait"><motion.div key={page} className="page-transition" initial={{opacity:0,y:14,filter:'blur(5px)'}} animate={{opacity:1,y:0,filter:'blur(0px)'}} exit={{opacity:0,y:-8,filter:'blur(3px)'}} transition={{duration:.28,ease:[.22,1,.36,1]}}>{body}</motion.div></AnimatePresence><Footer/><motion.button whileHover={{scale:1.06,y:-3}} whileTap={{scale:.93}} className="leo-fab" onClick={() => setChatOpen(true)} aria-label="Open Leo AI"><img src={mascot} alt=""/><span>Ask Leo <b>✦</b></span></motion.button><Chat open={chatOpen} onClose={() => setChatOpen(false)} name={firstName} hasPlan={Boolean(admissionPlan)}/>{chatOpen && <button className="overlay" onClick={() => setChatOpen(false)} aria-label="Close Leo AI"/>}{comparing && <Comparison items={comparing} onClose={() => setComparing(null)}/>}{examStepOpen && <ExamResultsStep initialTests={applicantProfile.tests} onSave={saveTests} onClose={() => setExamStepOpen(false)}/>}</div>}
