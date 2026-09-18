import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import mascot from './assets/leo-mascot.png'
import cityFallback from './assets/cities/city-fallback.jpg'
import Auth from './Auth.jsx'
import Onboarding from './Onboarding.jsx'
import Advisor, { Comparison } from './Advisor.jsx'
import StreakWidget, { StreakCelebration } from './StreakWidget.jsx'
import SiteFooter from './SiteFooter.jsx'
import { useT, LanguageSwitch } from './i18n.jsx'
import { countryCatalog, getCountryMap, MAP_VIEWBOX } from './data/countryMaps.js'
import { cityLife, loadCityLife } from './data/cityLife.js'
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
  const { t } = useT()
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span>{icons[item.icon]}</span>{t(item.label)}</button>
}

// A stage's reward split across its quests without creating or losing XP to rounding, the same
// way server/activity.js does it — 100 XP over 3 quests is 34 + 33 + 33.
const xpForQuest = (total, count, index) =>
  count < 1 ? 0 : Math.floor((Number(total) || 0) / count) + (index < (Number(total) || 0) % count ? 1 : 0)

function GamePath({ setChatOpen, plan, onOpenOSINT, onTaskDone, onCompleteQuest, activity }) {
  const { t, n } = useT()
  const [selected, setSelected] = useState(1)
  const levels = plan.tasks.map((task,index) => ({ ...task, id:index + 1, side:index % 2 ? 'right' : 'left', sub:task.due }))
  const doneCount = levels.filter(level => level.state === 'done').length
  // Earned XP is whatever the server counted, so ticking one quest of three shows a third of
  // the stage rather than nothing until the whole stage is finished.
  const earned = activity?.xp?.earned ?? levels.filter(level => level.state === 'done').reduce((sum, level) => sum + (level.xp ?? 0), 0)
  const progress = levels.length ? doneCount / levels.length * 100 : 0
  const active = levels.find(level => level.id === selected) ?? levels[0]
  const completed = new Set(active.completedSubtasks ?? [])
  const streak = activity?.streak?.current ?? 0
  return <main className="page game-page"><section className="game-head"><div><span className="eyebrow purple">{t('MY PATH · AI-GENERATED')}</span><h1>{t('Your next chapter starts here.')}</h1><p>{t('The task order comes from your profile, verified sources and your admission goals.')}</p><div className="ai-task-types">{['research','documents','application'].map(type => <span key={type}><i><TaskIcon type={type}/></i>{t(type)}</span>)}</div></div><button className="game-leo-tip" onClick={() => setChatOpen(true)}><img src={mascot} alt="" /><span><b>{t('Leo’s hint')}</b><small>{t('Tap a path point to see why it was created.')}</small></span><i>{icons.chevron}</i></button></section><section className="game-meta"><div><span className="game-stat-icon">✦</span><b>{n(earned)}</b><small>{t('XP earned')}</small></div><div><span className="game-stat-icon fire">♨</span><b>{streak}</b><small>{t('day streak')}</small></div><div><span className="game-stat-icon">◉</span><b>{Math.round(progress)}%</b><small>{t('of your plan')}</small></div><div><span className="game-stat-icon gem">◆</span><b>{levels.length}</b><small>{t('AI tasks')}</small></div><div><span className="game-stat-icon energy">⚡</span><b>{doneCount} / {levels.length}</b><small>{t('tasks done')}</small></div></section><section className="game-map-shell"><div className="game-map-title"><span>{t('AI ROADMAP · CONNECTED TO SOURCES')}</span><h2>{t('Research to application')}</h2><small>{t('Tap any point to open its evidence graph')}</small></div><div className="game-map"><svg className="game-line" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M29 17 C72 28 70 39 29 48 S28 68 70 80"/></svg>{levels.map((level,index) => <button key={level.id} style={{top:`${16 + index * 31}%`}} className={`game-level ${level.state} ${level.side} ${selected === level.id ? 'selected' : ''}`} onClick={() => { setSelected(level.id); onOpenOSINT(level.type) }}><span className="level-disc"><i><TaskIcon type={level.type}/></i><b>{level.id}</b></span><span className="level-label"><strong>{level.shortTitle}</strong><small>{t('Open in the decision map')} →</small></span></button>)}<div className="path-reward reward-one">♜<small>+ {n(active.xp ?? 0)} XP</small></div><div className="path-reward reward-two">✉<small>{t('AI task')}</small></div></div><aside className="level-panel"><span className="panel-kicker">{t('AI TASK · {index} OF {total}', { index: active.id, total: levels.length })}</span><div className={`panel-task-icon ${active.type}`}><TaskIcon type={active.type}/></div><h2>{active.title}</h2><p>{active.description}</p><div className="level-quests">{active.subtasks.map((task,i) => { const isDone = completed.has(i); return <button type="button" key={task} className={`quest ${isDone ? 'complete' : ''}`} disabled={active.state === 'locked' || !active.taskId} onClick={() => onCompleteQuest(active.taskId, i, !isDone)}><i>{isDone ? '✓' : i + 1}</i><span>{task}</span><b>{isDone ? t('earned') : `+${xpForQuest(active.xp, active.subtasks.length, i)} XP`}</b></button> })}</div><div className="panel-actions"><button className={`button ${active.state === 'done' ? 'soft' : 'primary'}`} onClick={() => onTaskDone(active.position, active.state !== 'done')}>{t(active.state === 'done' ? 'Completed — undo' : 'Mark as done')} <span>{active.state === 'done' ? '↺' : '✓'}</span></button><button className="button soft" onClick={() => onOpenOSINT(active.type)}>{t('Open evidence graph')} <span>{icons.arrow}</span></button></div></aside></section></main>
}

// Everything on this card used to be a literal: a fixed Tuesday, an "Italian dream" for people
// not going to Italy, and a quest nobody could complete. It now reads the same plan the rest
// of the app does, so opening Home after ticking a task shows the next one.
const TODAY_FORMAT = { weekday: 'long', day: 'numeric', month: 'long' }

function Greeting({ setChatOpen, setPage, name, plan, profile, tests }) {
  const { t, locale } = useT()
  const today = new Date().toLocaleDateString(locale, TODAY_FORMAT).toUpperCase()
  const current = plan?.tasks?.find(task => task.state === 'current') ?? plan?.tasks?.find(task => task.state !== 'done')
  const places = destinationLabels(profile)
  const named = places.map(place => t(place))
  const where = named.length > 1 ? t('{list} or {last}', { list: named.slice(0, -1).join(', '), last: named[named.length - 1] }) : named[0]
  const noExams = !tests?.length
  // The first thing actually missing, in the order it blocks the rest.
  const quest = noExams
    ? { label: t('PROFILE · 3 MIN'), title: t('Add your exam results'), lead: t('Scores you already have change which universities we put in front of you.'), go: () => setPage('profile') }
    : current
      ? { label: `${t('NEXT STEP')} · ${t(current.due)}`, title: current.shortTitle, lead: current.subtasks[0] ?? current.description, go: () => setPage('roadmap') }
      : { label: t('YOUR PLAN'), title: t('Every task is done'), lead: t('Open your path to review what you finished, or ask Leo what comes after.'), go: () => setChatOpen(true) }
  return <section className="greeting-card">
    <div className="greeting-copy"><span className="eyebrow purple">{today}</span><h1>{t('Good to see you, {name}', { name })} <span>✦</span></h1><p>{current ? t('One step today brings {where} closer.', { where }) : t('Your {where} plan is complete — nice work.', { where })}</p><div className="daily-action"><div className="action-icon">✉</div><div><small>{quest.label}</small><strong>{quest.title}</strong><span>{quest.lead}</span></div><button className="button dark" onClick={quest.go}>{t('Start')} <span>{icons.arrow}</span></button></div></div>
    <div className="mascot-scene"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="mascot-bubble">{t('You’ve got this!')}<br/><span>{t('Let’s take one step.')}</span></div><img src={mascot} alt="" className="mascot"/></div>
  </section>
}

function Stat({ icon, value, label, note, className = '' }) { const { t } = useT(); return <article className={`stat-card ${className}`}><div className="stat-icon">{icon}</div><div><strong>{value}</strong><span>{t(label)}</span>{note && <small>{t(note)}</small>}</div></article> }

function HomeQuestPath({ setPage, plan, profile }) {
  const { t, n } = useT()
  // Built from the plan this person actually has, so ticking a task off on My path moves
  // this too. The first two steps are what onboarding already answered.
  const mark = { done: '✓', current: '✦', locked: '·' }
  const steps = [
    { id: 1, icon: '✓', label: destinationSummary(profile, t), state: 'done' },
    { id: 2, icon: '✓', label: t(profile.field), state: 'done' },
    ...(plan?.tasks ?? []).map((task, index) => ({
      id: index + 3, icon: mark[task.state] ?? '·', label: task.shortTitle,
      state: task.state === 'current' ? 'active' : task.state,
    })),
  ]
  const open = (plan?.tasks ?? []).filter(task => task.state !== 'done')
  const left = open.reduce((sum, task) => sum + (task.xp ?? 0), 0)
  const current = (plan?.tasks ?? []).find(task => task.state === 'current') ?? open[0]
  return <article className="home-game-card"><div className="home-game-head"><div><span className="eyebrow purple">{t('TODAY ON YOUR PATH')}</span><h2>{open.length ? t('{count} steps left to level up', { count: open.length }) : t('Every step is done')}</h2></div><div className="reward-chip">◆ {left ? t('+{xp} XP left', { xp: n(left) }) : t('All XP earned')}</div></div><div className="home-quest-track" style={{gridTemplateColumns:`repeat(${steps.length},1fr)`}}>{steps.map((step,index) => <div className={`home-quest ${step.state}`} key={step.id}>{index < steps.length - 1 && <i className="quest-rail"/>}<button onClick={() => setPage('roadmap')}><span>{step.state === 'locked' ? '⌑' : step.icon}</span><b>{step.id}</b></button><small>{step.label}</small></div>)}</div>{current && <div className="home-active-quest"><span className="mini-gem">✦</span><div><small>{t('ACTIVE QUEST')} · {t(current.due)}</small><strong>{current.shortTitle}</strong><p>{current.subtasks[0] ?? current.description}</p></div><button className="button primary" onClick={() => setPage('roadmap')}>{t('Play')} <span>{icons.arrow}</span></button></div>}</article>
}

function Dashboard({ setChatOpen, setPage, name, plan, profile, tests, friends }) {
  const { t, n } = useT()
  const list = plan?.tasks ?? []
  const done = list.filter(task => task.state === 'done').length
  const total = list.length
  const earned = list.filter(task => task.state === 'done').reduce((sum, task) => sum + (task.xp ?? 0), 0)
  const possible = list.reduce((sum, task) => sum + (task.xp ?? 0), 0)
  const exams = tests?.length ?? 0
  const crew = friends ?? []
  // A real deadline needs a real date. The only one this app holds is an exam the person
  // booked themselves, so that is what the card counts down to; otherwise it shows the step
  // they are on, with the plan's own wording for when it comes due. "5 days left" was neither.
  const planned = (tests ?? [])
    .filter(item => item.status === 'planned' && item.planned_date)
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date))[0]
  const current = list.find(task => task.state === 'current') ?? list.find(task => task.state !== 'done')
  const days = planned ? Math.ceil((new Date(planned.planned_date) - new Date()) / 86400000) : null
  const next = planned
    ? { kicker: t('YOUR NEXT EXAM'), title: planned.test_name || planned.test_code, lead: t('You booked this for {date}.', { date: planned.planned_date }), when: days > 0 ? t('{count} days left', { count: days }) : days === 0 ? t('Today') : t('Date has passed'), go: () => setPage('profile') }
    : current
      ? { kicker: t('YOUR CURRENT STEP'), title: current.shortTitle, lead: current.description, when: t(current.due), go: () => setPage('roadmap') }
      : { kicker: t('NOTHING PENDING'), title: t('Your plan is complete'), lead: t('Add a planned exam date and it will count down here.'), when: t('All done'), go: () => setPage('profile') }
  return <main className="page dashboard-page"><Greeting setChatOpen={setChatOpen} setPage={setPage} name={name} plan={plan} profile={profile} tests={tests}/><section className="stats-row"><Stat icon="⚡" value={`${done} / ${total}`} label="Tasks completed" note={total ? t('{percent}% of your plan', { percent: Math.round(done / total * 100) }) : 'Generate your plan first'} className="orange"/><Stat icon="✦" value={n(earned)} label="XP earned" note={t('of {total} in this plan', { total: n(possible) })} className="violet"/><Stat icon="◒" value={String(exams)} label={exams === 1 ? 'Exam recorded' : 'Exams recorded'} note={exams ? 'Used in your matches' : 'Add them in your profile'} className="blue"/></section><section className="dash-grid"><HomeQuestPath setPage={setPage} plan={plan} profile={profile}/><aside className="side-stack"><article className="deadline-card"><div className="card-top"><span className="warning-dot">!</span><span>{next.kicker}</span><button aria-label={t('More')}>•••</button></div><h3>{next.title}</h3><p>{next.lead}</p><div className="deadline-bottom"><strong>{next.when}</strong><button className="round-arrow" onClick={next.go}>{icons.arrow}</button></div></article><article className="friend-card"><div className="card-top"><span>{t('YOUR CREW')}</span><button className="text-button" onClick={() => setPage('friends')}>{t('See all')}</button></div><div className="avatars">{crew.slice(0,3).map(friend => <span key={friend.id} className={`avatar ${friend.className}`}>{friend.initials}</span>)}{crew.length > 3 && <span className="avatar a4">+{crew.length - 3}</span>}</div><p>{crew.length ? <>{t('{done} of {total} have chosen a university.', { done: crew.filter(friend => friend.university !== 'Not selected yet').length, total: crew.length })} <span className="demo-badge compact"><i>!</i>{t('demo crew')}</span></> : t('Nobody in your crew yet — add a friend by nickname.')}</p><button className="high-five" onClick={() => setPage('friends')}>{t(crew.length ? 'Open your crew' : 'Add a friend')}</button></article></aside></section></main>
}

function OSINTFlow({ setPage, plan, onGenerate, focusedNodeId, profile }) {
  const { t } = useT()
  const [selectedId, setSelectedId] = useState(focusedNodeId || 'research')
  // The objective is sent to the model, so it stays in the profile's own terms rather than
  // being translated: the shortlist is matched on these words.
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
    <section className="osint-control"><div><span className="control-label">{t('YOUR ADMISSION OBJECTIVE')}</span><textarea value={objective} onChange={event => setObjective(event.target.value)} aria-label={t('Admission objective')}/><div className="profile-context">{[...destinationLabels(profile, t), t(profile.degree), t(profile.field), t('{year} intake', { year: profile.intake }), t('English {level}', { level: profile.englishLevel })].map(chip => <span key={chip}>{chip}</span>)}</div></div><motion.button whileHover={{scale:1.025}} whileTap={{scale:.97}} className={`button primary generate-button ${isGenerating ? 'loading' : ''}`} disabled={isGenerating || !objective.trim()} onClick={runGeneration}>{isGenerating ? <><i/>{t('Researching sources…')}</> : <>{t('Generate graph')} <span>✦</span></>}</motion.button></section>
    <section className="osint-workspace"><article className="osint-graph-card"><div className="graph-toolbar"><div><span className="eyebrow purple">{t('INTERACTIVE KNOWLEDGE GRAPH')}</span><h2>{t('Admission intelligence')}</h2></div><div className="source-health"><i/>{t('{count} official pages to check', { count: plan.sourceCount })}</div></div><div className="flow-canvas"><ReactFlow nodes={flowNodes} edges={flowEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={handleNodeClick} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:.18}} minZoom={.55} maxZoom={1.7} nodesConnectable={false} deleteKeyCode={null} proOptions={{hideAttribution:true}}><Background gap={18} size={1} color="#d6d5e2"/><Controls showInteractive={false}/><MiniMap className={miniMapHidden ? 'minimap-hidden' : ''} pannable zoomable nodeStrokeWidth={3} nodeColor={node => node.data.type === 'source' ? '#45b979' : node.data.type === 'task' ? '#8a63d1' : '#7464cf'} maskColor="rgba(242,242,249,.72)"/></ReactFlow><div className="flow-hint">{t('Drag nodes · scroll to zoom · click to inspect')}</div><button className={`minimap-toggle ${miniMapHidden ? 'is-hidden' : ''}`} onClick={() => setMiniMapHidden(value => !value)}>{t(miniMapHidden ? 'Show map' : 'Hide map')}</button></div><div className="osint-legend"><span><i className="profile"/>{t('Profile data')}</span><span><i className="evidence"/>{t('Official sources')}</span><span><i className="logic"/>{t('Requirement')}</span><span><i className="task"/>{t('Generated task')}</span></div></article>
      <AnimatePresence mode="wait"><motion.aside key={selected.id} className="node-inspector" initial={{opacity:0,x:22}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-12}} transition={{type:'spring',stiffness:260,damping:25}}><span className={`node-kind ${selected.type}`}>{selected.type === 'task' ? t('generated {type} task', { type: t(selected.taskType) }) : t(selected.type)}</span><h2>{selected.label}</h2><p>{selected.detail}</p>{selected.type === 'source' && <div className="source-list">{(plan.shortlist ?? []).slice(0,6).map(entry => entry.website
        ? <a key={entry.name} href={entry.website} target="_blank" rel="noreferrer"><b>{entry.name}</b><small>{t(entry.city)}, {t(entry.country)} · {t('official site')}</small></a>
        : <span key={entry.name} className="unlinked"><b>{entry.name}</b><small>{t(entry.city)}, {t(entry.country)} · {t('no confirmed address — search for it yourself')}</small></span>)}<span><b>{selected.portal}</b><small>{t('National application portal')}</small></span></div>}<div className="node-connections"><small>{t('CONNECTED NODES')}</small>{connectedIds.map(id => { const node=sourceNodes.find(item => item.id === id); return <button key={id} onClick={() => setSelectedId(id)}>{node.label}<b>{icons.arrow}</b></button> })}</div>{selected.type === 'task' && <motion.button whileHover={{y:-2}} whileTap={{scale:.97}} className="button primary" onClick={() => setPage('roadmap')}>{t('Open in My Path')} <span>{icons.arrow}</span></motion.button>}</motion.aside></AnimatePresence>
    </section>
    <section className="task-contract"><div><span className="eyebrow">{t('OUTPUT FOR MY PATH')}</span><h2>{t('{count} tasks in this plan', { count: plan.tasks.length })}</h2><p>{t('Every one is generated from your answers and the sources above, in the order they unlock.')}</p></div>{plan.tasks.map((task,index) => <motion.article key={task.id} initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{delay:.15+index*.08}} whileHover={{y:-6,rotate:index===1 ? 1 : -1}}><i className={task.type}><TaskIcon type={task.type}/></i><span><small>0{index+1} · {t(task.type)}</small><b>{task.shortTitle}</b><em>{task.xp} XP</em></span></motion.article>)}</section>
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
  const { t } = useT()
  const [countryId, setCountryId] = useState('italy')
  const [city, setCity] = useState(null)
  const [shortlistOpen, setShortlistOpen] = useState(false)
  // The override file is fetched at runtime, so editing it needs no rebuild.
  const [cityLifeTable, setCityLifeTable] = useState({})
  useEffect(() => { loadCityLife().then(setCityLifeTable).catch(() => {}) }, [])
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
  const life = city ? cityLife(city, country, cityLifeTable) : null
  const selectCity = place => { setCity(place); setShortlistOpen(false) }
  const switchCountry = id => { setCountryId(id); setCity(null); setShortlistOpen(false) }

  return <main className="page country-page country-library-page">
    <section className="country-head"><div><span className="eyebrow purple">{t('EXPLORE YOUR DESTINATION')}</span><h1>{city ? `${t(city.name)}, ${t(country.name)}` : t('{country} map', { country: t(country.name) })}</h1><p>{city ? t(city.note) : t('Explore accurate country contours, map out university cities and build a shortlist.')}</p></div><div className="country-picker" aria-label={t('Choose a country')}>{countryCatalog.map(item => <button key={item.id} className={item.id === country.id ? 'active' : ''} onClick={() => switchCountry(item.id)}><CountryFlag country={item}/>{t(item.shortName)}</button>)}</div></section>
    <section className={`country-explorer country-explorer-3d ${city ? 'city-open' : ''}`}>
      <div className="country-stage country-stage-3d"><CountryMap3D country={country} city={city} onSelectCity={selectCity}/>
        <AnimatePresence mode="wait">{city && <motion.div key={`${country.id}-${city.name}`} className="city-scene visible social-city-scene" initial={{ opacity: 0, scale: .92, x: 45 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: .96, x: -30 }} transition={{ type:'spring',stiffness:170,damping:22 }}><CityBackdrop city={city.name}/><button className="city-back" onClick={() => setCity(null)}>← {t('Back to {country}', { country: t(country.name) })}</button><div className="city-title"><span className="eyebrow">{t('WELCOME TO')}</span><h2>{t(city.name)}</h2><p>{t(city.note)}</p></div><div className="city-universities">{city.universities.map((university,index)=>{const saved=Boolean(savedItem(university));const people=friends.filter(friend=>friend.university===university.name);return <motion.article layout key={university.id} className={`city-uni-card social-uni-card ${saved?'is-saved':''}`} whileHover={{y:-4}}><span className="uni-pin">{index+1}</span><span className="uni-card-main"><strong>{university.name}</strong><small>{t(university.focus)}</small><span className="uni-social-proof"><span className="friend-stack">{people.slice(0,3).map(friend=><i key={friend.id} title={`${friend.name} ${friend.nickname}`} className={`friend-dot ${friend.className}`}>{friend.initials}</i>)}</span><em>{people.length?`${people.slice(0,2).map(friend=>friend.name).join(' & ')}${people.length>2?` +${people.length-2}`:''} chose this university`:saved?t('Saved to your shortlist'):t('Explore programmes and admissions')}</em></span></span><motion.button whileTap={{scale:.78,rotate:-15}} className={`favorite-star ${saved?'saved':''}`} onClick={()=>toggleUniversity(university)} aria-label={saved?`Remove ${university.name} from saved`:`Save ${university.name}`}>{saved?'★':'☆'}</motion.button></motion.article>})}</div></motion.div>}</AnimatePresence>
      </div>
      <aside className="country-sidebar"><span className="country-badge"><CountryFlag country={country}/>{t('DESTINATION MAP')}</span><h2>{t(city?.name || country.name)}</h2><p>{city ? t('Compare universities in {city} and save the ones you want to revisit.', { city: t(city.name) }) : t('Pick a glowing city point, or drag the country contour to see it from another angle.')}</p><div className="country-facts">{city ? <><div><b>{city.universities.length}</b><small>{t('universities shown')}</small></div><div><b>{countryFavorites.length}</b><small>{t('saved here')}</small></div></> : <><div><b>{country.cities.length}</b><small>{t('cities mapped')}</small></div><div><b>{totalUniversities}</b><small>{t('universities to explore')}</small></div></>}</div>{!city && <div className="map-legend"><span><i className="legend-pulse"/>{t('Tap a glowing point')}</span><small>{t('Every outline uses its national flag colours and can rotate in 3D.')}</small></div>}<button className="button primary" onClick={() => city ? setShortlistOpen(true) : selectCity(country.cities[0])}>{city ? t('What’s on in {city}', { city: t(city.name) }) : t('Explore {city}', { city: t(country.cities[0].name) })} <span>{icons.arrow}</span></button></aside>
    </section>
    <AnimatePresence>{shortlistOpen && city && <motion.div className="city-shortlist-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setShortlistOpen(false)}><motion.section className="city-shortlist-modal" initial={{opacity:0,y:42,scale:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:30,scale:.98}} transition={{type:'spring',stiffness:220,damping:24}} onClick={event => event.stopPropagation()}><header><div><span className="eyebrow purple">{t('CITY LIFE')}</span><h2>{t(city.name)}, {t(country.name)}</h2><p>{t('What studying here actually looks like.')}</p></div><button onClick={() => setShortlistOpen(false)} aria-label={t('Close')}>×</button></header><div className="city-life-body">
      <section className="city-life-unis"><h3>{t('Universities here')}</h3><div className="city-life-uni-list">{life.universities.map((uni, index) => <article key={uni.name}><span className="shortlist-number">0{index + 1}</span><div><h4>{uni.name}</h4><p>{t(uni.focus)}</p></div>{uni.web ? <a href={uni.web} target="_blank" rel="noreferrer">{t('official site')} ↗</a> : <span className="no-link">{t('no confirmed address')}</span>}</article>)}</div></section>
      <section className="city-life-what"><h3>{t('What to look for')} <span className="demo-badge compact"><i>!</i>{t('demo')}</span></h3><div className="city-life-grid">{life.items.map(item => <article key={item.title}><i>{item.icon}</i><div><h4>{t(item.title)}</h4><p>{t(item.text)}</p></div></article>)}</div></section>
    </div><footer><small>{t('Activity descriptions are demonstration data — check the current programme on the organiser’s own page.')}</small><button className="button soft" onClick={() => setShortlistOpen(false)}>{t('Back to {city}', { city: t(city.name) })}</button></footer></motion.section></motion.div>}</AnimatePresence>
  </main>
}

// The profile is edited in two places, and they must never become two sources of truth for
// the same fact. Destination, degree, field and intake live in the database and decide the
// shortlist, so "Your goals" reopens the real onboarding editor rather than a second form.
// The rest has no column yet and stays in localStorage until one exists — and nothing here
// is prefilled with an invented person, because a name you did not type is not your profile.
const profileDefaults = { firstName:'',lastName:'',birthDate:'',citizenship:'',city:'',education:'',school:'',graduationYear:'',language:'',budget:'',activities:'',awards:'',skills:'',portfolio:'',essay:'' }
const profileEditorFields = {
  about:{title:'About you',subtitle:'Personal details, education and language',fields:[['firstName','First name','text'],['lastName','Last name','text'],['birthDate','Date of birth','date'],['citizenship','Citizenship','text'],['city','Current city','text'],['education','Education level','text'],['school','School or university','text'],['graduationYear','Graduation year','number'],['language','Other languages','text']]},
  strengths:{title:'Your strengths',subtitle:'Activities, awards and portfolio',fields:[['activities','Activities','textarea'],['awards','Awards and achievements','textarea'],['skills','Skills','textarea'],['portfolio','Portfolio link','url'],['budget','Annual budget (EUR)','number']]},
  essay:{title:'Motivation letter',subtitle:'Plan it yourself, with Leo asking the questions',fields:[['essay','Your draft','textarea']]},
}

function EssayWorkshop({ details }) {
  const { t, lang } = useT()
  const [state, setState] = useState({ loading: true })
  const [shared, setShared] = useState(false)
  const activities = [details.activities, details.awards, details.skills].filter(Boolean).join('\n').trim()

  const ask = (withActivities) => {
    setState({ loading: true })
    setShared(withActivities)
    fetch('/api/me/essay', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, activities: withActivities ? activities : '' }),
    })
      .then(response => (response.ok ? response.json() : Promise.reject()))
      .then(payload => setState({ loading: false, ...payload }))
      .catch(() => setState({ loading: false, sections: [] }))
  }
  useEffect(() => { ask(false) }, [lang])

  const words = String(details.essay || '').trim().split(/\s+/).filter(Boolean).length

  return <div className="essay-workshop">
    <div className="hint-panel">
      <div className="hint-head"><img src={mascot} alt=""/><div><b>{t('Leo does not write your letter')}</b><small>{t('It is your letter, and a generated paragraph is a statement about you that you did not make. Leo gives the shape and asks the questions only you can answer.')}</small></div></div>
      {state.loading ? <div className="hint-panel loading"><span className="map-spinner"/>{t('Working out the shape of your letter…')}</div> : <>
        <div className="essay-sections">{(state.sections ?? []).map((section, index) => <article key={section.title}>
          <span className="essay-step">0{index + 1}</span>
          <div><h4>{section.title}</h4><p>{section.purpose}</p>
            <ul>{section.questions.map(question => <li key={question}>{question}</li>)}</ul></div>
        </article>)}</div>
        {state.weakest && <p className="essay-warn"><i>!</i>{state.weakest}</p>}
        {state.evidence?.length ? <div className="essay-evidence">
          <h4>{t('Turning what you did into evidence')}</h4>
          {state.evidence.map(item => <article key={item.activity}>
            <b>{item.activity}</b><p>{item.shows}</p><p className="essay-sharpen">{item.sharpen}</p>
          </article>)}
        </div> : null}
        {!shared && activities && <button type="button" className="button soft essay-share" onClick={() => ask(true)}>
          {t('Read what I wrote under Your strengths and comment on it')}
        </button>}
        {!shared && activities && <small className="essay-consent">{t('That sends only those three boxes to the model, once, to comment on. Your draft is never sent and never leaves this browser.')}</small>}
      </>}
    </div>
    <p className="essay-count">{t('{count} words in your draft', { count: words })} · {t('saved in this browser only')}</p>
  </div>
}

const KIND_ICON = { competition: '♜', project: '✦', volunteering: '♧', research: '◎', course: '▤', community: '☕' }

function OpportunityHints() {
  const { t, lang } = useT()
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    let alive = true
    fetch(`/api/me/opportunities?lang=${lang}`)
      .then(response => (response.ok ? response.json() : Promise.reject()))
      .then(payload => { if (alive) setState({ loading: false, ...payload }) })
      .catch(() => { if (alive) setState({ loading: false, ideas: [] }) })
    return () => { alive = false }
  }, [lang])

  if (state.loading) return <div className="hint-panel loading"><span className="map-spinner"/>{t('Leo is looking for places you could take part…')}</div>
  if (!state.ideas?.length) return null
  return <div className="hint-panel">
    <div className="hint-head"><img src={mascot} alt=""/><div><b>{t('Where you could take part')}</b><small>{t('Chosen for your field and level. Check on the organiser’s own page that it still runs, and what the dates and rules are — we do not hold them.')}</small></div></div>
    <div className="hint-list">{state.ideas.map(idea => <article key={idea.title}>
      <i>{KIND_ICON[idea.kind] ?? '✦'}</i>
      <div><h4>{idea.title}</h4><p>{idea.why}</p>{idea.start && <p className="hint-start"><b>{t('First move')}:</b> {idea.start}</p>}</div>
    </article>)}</div>
  </div>
}

function ProfileEditor({ section, values, onSave, onClose }) {
  const { t } = useT()
  const config=profileEditorFields[section]
  const [draft,setDraft]=useState(values)
  return <div className="profile-editor-backdrop" onMouseDown={event => event.target===event.currentTarget && onClose()}><motion.form className="profile-editor" onSubmit={event => { event.preventDefault(); onSave(draft) }} initial={{opacity:0,y:20,scale:.98}} animate={{opacity:1,y:0,scale:1}} role="dialog" aria-modal="true"><header><div><span className="eyebrow purple">{t('PROFILE DETAILS')}</span><h2>{t(config.title)}</h2><p>{t(config.subtitle)}</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>{section === 'strengths' && <OpportunityHints/>}{section === 'essay' && <EssayWorkshop details={draft}/>}<div className="profile-editor-fields">{config.fields.map(([key,label,type]) => <label key={key} className={type==='textarea'?'wide':''}><span>{t(label)}</span>{type==='textarea'?<textarea value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})} placeholder={t('Add {field}', { field: t(label).toLowerCase() })}/>:<input type={type} value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})}/>}</label>)}</div><footer><button type="button" className="button soft" onClick={onClose}>{t('Cancel')}</button><button className="button primary" type="submit">{t('Save changes')} <span>✓</span></button></footer></motion.form></div>
}

function ProfileV2({ favorites, setPage, onToggleFavorite, friends, onLogout, user, profile, applicantProfile, onOpenExamStep, onEditProfile }) {
  const { t } = useT()
  const [tab, setTab] = useState('overview')
  const [editor,setEditor]=useState(null)
  const [highFives,setHighFives]=useState(()=>new Set())
  const [details,setDetails]=useState(()=>{try{return {...profileDefaults,...JSON.parse(localStorage.getItem('path2uni:profileDetails'))}}catch{return profileDefaults}})
  const saveDetails=next=>{setDetails(next);localStorage.setItem('path2uni:profileDetails',JSON.stringify(next));setEditor(null)}
  const testSummary = applicantProfile.tests?.length ? t('{count} exams added', { count: applicantProfile.tests.length }) : t('Add completed and planned exams')
  const sections=[{title:'About you',description:t('Personal details, education and language'),action:'about'},{title:'Your goals',description:`${destinationLabels(profile, t).join(', ')} · ${t(profile.field)} · ${profile.intake}`,action:'goals'},{title:'Test results',description:testSummary,action:'tests'},{title:'Your strengths',description:t('Activities, awards and portfolio'),action:'strengths'},{title:'Motivation letter',description:details.essay ? t('{count} words drafted', { count: String(details.essay).trim().split(/\s+/).filter(Boolean).length }) : t('Plan it with Leo'),action:'essay'}]
  const tabs = [{id:'overview',label:'Overview'}, {id:'saved',label:'Saved',count:favorites.length}, {id:'friends',label:'Friends',count:friends.length}]
  const tracked=['firstName','lastName','birthDate','citizenship','city','education','school','graduationYear','language','budget','activities','awards','skills','portfolio']
  // Goals and the account name are already on file — onboarding required them — so they count
  // as done rather than sitting forever as two missing items nobody can fill in from here.
  const completion=Math.round((tracked.filter(key=>String(details[key]||'').trim()).length+2+(applicantProfile.tests?.length?1:0))/(tracked.length+3)*100)
  const initials=(user.displayName||user.username).trim().charAt(0).toUpperCase()
  const toggleHighFive=id=>setHighFives(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next})

  return <main className="page profile-page profile-v2"><section className="profile-hero"><div className="profile-avatar">{initials}</div><div><span className="eyebrow purple">{t('MY PROFILE')}</span><h1>{user.displayName || user.username}</h1><p>{destinationLabels(profile, t).join(' · ')} · {t(profile.degree)} · {t('{year} intake', { year: profile.intake })}</p></div><div className="profile-actions"><LanguageSwitch compact/><button className="button soft" onClick={onEditProfile}>{t('Edit profile')} <span>✎</span></button><button className="logout-button" onClick={onLogout}>{t('Log out')} ↗</button></div></section><nav className="profile-tabs" aria-label="Profile sections">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{t(item.label)}{item.count != null && <span>{item.count}</span>}</button>)}</nav>
    <AnimatePresence mode="wait"><motion.section key={tab} className="profile-tab-panel" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.2}}>{tab === 'overview' && <><section className="profile-progress"><div><span className="eyebrow">{t('PROFILE COMPLETION')}</span><h2>{t('{percent}% complete', { percent: completion })}</h2><p>{t(completion===100?'Your profile is complete and ready for personalised recommendations.':'Complete the remaining details so Leo can tailor every recommendation.')}</p></div><div className="progress-circle" style={{background:`conic-gradient(#6653d8 0 ${completion}%,#ebeafd ${completion}%)`}}><b>{completion}%</b></div></section><section className="profile-grid"><div className="profile-sections">{sections.map((section,index) => <button className="profile-section" key={section.title} onClick={()=>section.action==='tests'?onOpenExamStep():section.action==='goals'?onEditProfile():setEditor(section.action)}><span className="profile-number">0{index + 1}</span><span><h3>{t(section.title)}</h3><p>{section.description}</p></span><i>{icons.chevron}</i></button>)}</div><aside className="profile-next"><img src={mascot} alt="Leo mascot"/><span className="eyebrow purple">{t('NEXT BEST STEP')}</span><h3>{t('Tell us about your test results')}</h3><p>{t('It takes about 3 minutes and improves your university matches.')}</p><button className="button dark" onClick={onOpenExamStep}>{t('Complete now')} <span>{icons.arrow}</span></button></aside></section></>}
      {tab === 'saved' && <section className="saved-panel"><div className="tab-intro"><span className="eyebrow purple">{t('YOUR SHORTLIST')}</span><h2>{t('Universities worth coming back to.')}</h2><p>{t('Every gold star from the country map is collected here.')}</p></div>{favorites.length ? <div className="saved-grid">{favorites.map((university,index) => { const people = friends.filter(friend => friend.university === university.name); return <motion.article layout key={university.id} className="saved-university" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:index*.05}}><button className="favorite-star saved" onClick={() => onToggleFavorite(university)} aria-label={`Remove ${university.name} from saved`}>★</button><span className="saved-rank">0{index+1}</span><small>{t(university.city)}, {t(university.country)}</small><h3>{university.name}</h3><p>{t(university.focus)}</p><div className="saved-card-bottom"><span className="friend-stack">{people.slice(0,3).map(friend => <i key={friend.id} className={`friend-dot ${friend.className}`}>{friend.initials}</i>)}</span><button onClick={() => setPage('universities')}>{t('View on map')} {icons.arrow}</button></div></motion.article> })}</div> : <div className="profile-empty"><span>☆</span><h3>{t('No saved universities yet')}</h3><p>{t('Explore a country and tap a star on any university you want to compare later.')}</p><button className="button primary" onClick={() => setPage('universities')}>{t('Explore universities')} <span>{icons.arrow}</span></button></div>}</section>}
      {tab === 'friends' && <section className="profile-friends-panel"><div className="tab-intro tab-intro-row"><div><span className="eyebrow purple">{t('YOUR ADMISSION CREW')}</span><h2>{t('See where your friends are heading.')}</h2><p>{t('Their university choices also appear directly on the city cards.')}</p></div><button className="button soft" onClick={() => setPage('friends')}>+ {t('Add by nickname')}</button></div><div className="profile-friend-grid">{friends.map((friend,index) => <motion.article key={friend.id} initial={{opacity:0,x:-12}} animate={{opacity:1,x:0}} transition={{delay:index*.06}}><span className={`avatar ${friend.className}`}>{friend.initials}</span><div><h3>{friend.name} <small>{friend.nickname}</small></h3><p>{friend.university === 'Not selected yet' ? t('Choosing a destination') : <>{t('Chose')} <b>{friend.university}</b></>}</p></div><span className="friend-choice-star">★</span><button className={`high-five ${highFives.has(friend.id)?'sent':''}`} onClick={()=>toggleHighFive(friend.id)}>{highFives.has(friend.id)?`✓ ${t('Sent')}`:`✋ ${t('High-five')}`}</button></motion.article>)}</div></section>}</motion.section></AnimatePresence>{editor&&<ProfileEditor section={editor} values={details} onSave={saveDetails} onClose={()=>setEditor(null)}/>}
  </main>
}

function Friends({ friends, onAddFriend }) {
  const { t } = useT()
  const [nickname, setNickname] = useState('')
  const [notice, setNotice] = useState(null)
  const submit = event => {
    event.preventDefault()
    const result = onAddFriend(nickname)
    setNotice(result)
    if (result.ok) setNickname('')
  }
  return <main className="page friends-page"><section className="friends-hero-grid"><section className="list-hero"><span className="eyebrow purple">{t('YOUR CREW')}</span><h1>{t('Progress is better together.')}</h1><p>{t('Find a Path2Uni student by nickname and add them to your admission crew.')}</p></section><form className="add-friend-card" onSubmit={submit}><span className="add-friend-icon">＋</span><div><span className="eyebrow purple">{t('ADD A FRIEND')}</span><h2>{t('Find by nickname')}</h2></div><label><span>@</span><input value={nickname} onChange={event => { setNickname(event.target.value); setNotice(null) }} placeholder={t('nickname')} aria-label={t('Friend nickname')}/><button type="submit">{t('Add friend')}</button></label>{notice && <p className={notice.ok ? 'success' : 'error'}>{t(notice.message, notice.vars)}</p>}<small>{t('Try a unique nickname, for example')} <b>@alex.abroad</b>.</small></form></section><div className="friend-list">{friends.map(friend => <article key={friend.id}><span className={`avatar ${friend.className}`}>{friend.initials}</span><div><h3>{friend.name} <small>{friend.nickname}</small></h3><p>{friend.university === 'Not selected yet' ? 'Choosing a destination' : <><span className="inline-friend-star">★</span> Chose {friend.university}</>} · today</p></div><button className="high-five">✋ High-five</button></article>)}</div></main>
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
  const { t } = useT()
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
      setError(t('{exam}: select a test date before saving.', { exam: testWithoutDate.name }))
      return
    }
    const invalidTest = tests.find(test => test.selected && test.min != null && test.score !== '' && (
      Number(test.score) < test.min || Number(test.score) > test.max || Math.abs((Number(test.score) - test.min) / test.step - Math.round((Number(test.score) - test.min) / test.step)) > 1e-9
    ))
    if (invalidTest) {
      setError(t('{exam}: enter a score from {min} to {max} in increments of {step}.', { exam: invalidTest.name, min: invalidTest.min, max: invalidTest.max, step: invalidTest.step }))
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
    <header><div><span className="eyebrow purple">{t('PROFILE · TEST RESULTS')}</span><h1 id="exam-step-title">{t('Which exams have you taken?')}</h1><p>{t('Add completed tests or exams you are planning. You can update them later.')}</p></div><button type="button" className="exam-close" onClick={onClose} aria-label={t('Close')}>×</button></header>
    <div className="exam-list">{tests.map(test => <article key={test.code} className={test.selected ? 'selected' : ''}>
      <label className="exam-select"><input type="checkbox" checked={test.selected} onChange={event => update(test.code,{selected:event.target.checked})}/><span><b>{test.name}</b><small>{t(test.range)}</small></span></label>
      {test.selected && <div className="exam-fields"><label><span>{t('Status')}</span><select value={test.status} onChange={event => update(test.code,{status:event.target.value,date:''})}><option value="completed">{t('Completed')}</option><option value="mock">{t('Mock test')}</option><option value="planned">{t('Planned')}</option></select></label><label><span>{t(['OTHER','CAMBRIDGE','A_LEVEL'].includes(test.code) ? 'Result' : 'Score')}</span>{['OTHER','CAMBRIDGE','A_LEVEL'].includes(test.code) ? <input value={test.scoreText} onChange={event => update(test.code,{scoreText:event.target.value})} placeholder={t('Enter result')}/> : <input type="number" min={test.min} max={test.max} step={test.step} value={test.score} onChange={event => update(test.code,{score:event.target.value})} placeholder={test.range}/>}</label><label><span>{t(test.status === 'planned' ? 'Planned date' : 'Test date')} *</span><input type="date" required value={test.date} onChange={event => update(test.code,{date:event.target.value})}/></label></div>}
    </article>)}</div>
    {error && <p className="exam-error">{t(error)}</p>}
    <footer><small>{t('These results will be used to match admission requirements.')}</small><button className="button primary" type="submit" disabled={saving}>{t(saving ? 'Saving…' : 'Save and continue')} <span>{icons.arrow}</span></button></footer>
  </motion.form></div>
}

function LoginScreen({ onLogin }) {
  return <main className="login-screen"><motion.section className="login-card" initial={{opacity:0,y:20,scale:.98}} animate={{opacity:1,y:0,scale:1}}><div className="login-brand"><span className="brand-mark">P</span><b>path<span>2</span>uni</b></div><img src={mascot} alt="Leo mascot"/><span className="eyebrow purple">SEE YOU SOON, MILA</span><h1>You’ve logged out.</h1><p>Your roadmap, saved universities and friends are still safely stored on this device.</p><button className="button primary" onClick={onLogin}>Log back in <span>{icons.arrow}</span></button></motion.section></main>
}

function Chat({ open, onClose, name, hasPlan }) {
  const { t, lang } = useT()
  const [messages, setMessages] = useState([{ from: 'leo', text: t('Hi {name}! I’m Leo, your admission guide. What would you like to make clearer today?', { name }) }])
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
      setMessages(current => [...current, { from: 'leo', text: payload.reply || t(payload.error || 'Something went wrong on my side.'), offline: payload.source?.kind === 'rules' }])
    } catch {
      setMessages(current => [...current, { from: 'leo', text: t('I can’t reach the server right now.'), offline: true }])
    } finally { setThinking(false) }
  }

  const quick = hasPlan
    ? ['What should I do this week?', 'Why is this task first?', 'Tell me about my universities']
    : ['How do I start?', 'What is the Decision Map for?']

  return <aside className={`chat ${open ? 'open' : ''}`} aria-hidden={!open}>
    <div className="chat-head"><div><img src={mascot} alt=""/><span><b>{t('Leo AI')}</b><small>{t('Here to guide you')}</small></span></div><button onClick={onClose} aria-label={t('Close')}>×</button></div>
    <div className="chat-messages" aria-live="polite">
      {messages.map((message, index) => <p className={`${message.from} ${message.offline ? 'offline' : ''}`} key={index}>{message.text}</p>)}
      {thinking && <p className="leo thinking"><i/><i/><i/></p>}
      <div ref={endRef}/>
    </div>
    <div className="chat-quick">{quick.map(text => <button key={text} onClick={() => setDraft(t(text))} disabled={thinking}>{t(text)}</button>)}</div>
    <form onSubmit={send}>
      <input value={draft} onChange={event => setDraft(event.target.value)} placeholder={t(thinking ? 'Leo is thinking…' : 'Ask Leo anything…')} disabled={thinking}/>
      <button aria-label={t('Send message')} disabled={thinking || !draft.trim()}>{icons.arrow}</button>
    </form>
  </aside>
}

// A profile saved before several destinations existed carries only the single label, so both
// helpers fall back to it rather than rendering an empty chip row.
const destinationLabels = (profile, t = value => value) =>
  (profile.destinationLabels?.length ? profile.destinationLabels : [profile.destinationLabel]).filter(Boolean).map(label => t(label))
const destinationSummary = (profile, t) => { const list = destinationLabels(profile, t); return list.length > 2 ? `${list[0]} +${list.length - 1}` : list.join(' · ') }

export default function App() {
  const { t, n, lang } = useT()
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
  const [activity, setActivity] = useState(null)
  const [celebration, setCelebration] = useState(null)
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
    fetch('/api/me/activity').then(response => (response.ok ? response.json() : null))
      .then(data => { if (alive && data) setActivity(data) }).catch(() => {})
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
    if (friends.some(friend => friend.nickname?.replace(/^@/, '').toLowerCase() === clean.toLowerCase())) return { ok:false, message:'{nickname} is already in your crew.', vars:{ nickname:`@${clean}` } }
    const readable = clean.split(/[._-]/)[0]
    const name = readable.charAt(0).toUpperCase() + readable.slice(1)
    const friend = { id:`friend-${Date.now()}`, nickname:`@${clean}`, name, initials:name.charAt(0) || '?', className:`a${friends.length % 4 + 1}`, university:'Not selected yet' }
    setFriends(current => [...current, friend])
    return { ok:true, message:'{nickname} was added to your crew.', vars:{ nickname: friend.nickname } }
  }
  const openOSINT = nodeId => { setFocusedNodeId(nodeId); setPage('intel') }
  const saveTests = async tests => setApplicantProfile(await saveApplicantTests(tests))

  const refreshActivity = () => fetch('/api/me/activity')
    .then(response => (response.ok ? response.json() : null))
    .then(data => data && setActivity(data))
    .catch(() => {})

  const setTaskDone = async (position, done) => {
    const response = await fetch('/api/me/task', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position, done }),
    })
    const payload = await response.json().catch(() => ({}))
    if (payload.plan) setAdmissionPlan(payload.plan)
    refreshActivity()
  }

  // One quest, not a whole stage. The server decides what that does to the stage's status,
  // the XP and the streak, so the client never computes progress it would then disagree about.
  const completeQuest = async (taskId, subtaskIndex, completed) => {
    const response = await fetch('/api/me/subtask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, subtaskIndex, completed }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) return
    if (payload.plan) setAdmissionPlan(payload.plan)
    if (payload.activity) setActivity(payload.activity)
    if (payload.event?.streakExtended) {
      setCelebration({ streak: payload.activity.streak.current, awardedXp: payload.event.awardedXp })
    }
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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objective, lang }),
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
  if (user === undefined) return <div className="auth-booting"><span className="map-spinner"/>{t('Checking your session…')}</div>
  if (user === null) return <Auth onSignedIn={setUser}/>
  if (profile === undefined) return <div className="auth-booting"><span className="map-spinner"/>{t('Loading your path…')}</div>
  if (profile === null) return <Onboarding user={user} onDone={async item => { setProfile(item); await buildFirstPlan(item) }}/>
  // Re-answering rebuilds the plan, and the diagnosis cache keys on the answers, so the
  // matches change with it. That is the brief's "a changed answer visibly changes the result".
  if (editingProfile) return <Onboarding user={user} initial={profile} onCancel={() => setEditingProfile(false)}
    onDone={async item => { setProfile(item); setEditingProfile(false); await buildFirstPlan(item) }}/>
  if (building || !admissionPlan) return <div className="auth-booting"><span className="map-spinner"/>{t('Building your path from your answers…')}</div>

  const firstName = (user.displayName || user.username).trim().split(/\s+/)[0]
  const initial = firstName.charAt(0).toUpperCase()
  const body = page === 'advisor' ? <Advisor profile={profile} onCompare={setComparing} onOpenPlan={() => setPage('roadmap')}/> : page === 'home' ? <Dashboard setChatOpen={setChatOpen} setPage={setPage} name={firstName} plan={admissionPlan} profile={profile} tests={applicantProfile.tests} friends={friends}/> : page === 'roadmap' ? <GamePath setChatOpen={setChatOpen} plan={admissionPlan} onOpenOSINT={openOSINT} onTaskDone={setTaskDone} onCompleteQuest={completeQuest} activity={activity}/> : page === 'profile' ? <ProfileV2 favorites={favorites} setPage={setPage} onToggleFavorite={toggleFavorite} friends={friends} onLogout={logOut} user={user} profile={profile} applicantProfile={applicantProfile} onOpenExamStep={() => setExamStepOpen(true)} onEditProfile={() => setEditingProfile(true)}/> : page === 'intel' ? <OSINTFlow setPage={setPage} plan={admissionPlan} onGenerate={handleGeneratePlan} focusedNodeId={focusedNodeId} profile={profile}/> : page === 'universities' ? <UniversityExplorer favorites={favorites} onToggleFavorite={toggleFavorite} friends={friends}/> : <Friends friends={friends} onAddFriend={addFriend}/>
  return <div className="app-shell"><aside className="sidebar"><button className="brand" onClick={() => setPage('home')}><span className="brand-mark">P</span><span>path<span>2</span>uni</span></button><nav>{nav.map(item=><NavItem key={item.id} item={item} active={page===item.id || (page==='roadmap' && item.id==='roadmap')} onClick={() => { if (item.id === 'intel') setFocusedNodeId(null); setPage(item.id) }}/>)}</nav><div className="sidebar-bottom"><button className="profile-mini" onClick={() => setPage('profile')}><span className="user-pic">{initial}</span><span><b>{user.displayName || user.username}</b><small>{t('My profile')}</small></span><i>{icons.chevron}</i></button></div></aside><header className="topbar"><button className="mobile-brand brand" onClick={() => setPage('home')}><span className="brand-mark">P</span>path<span>2</span>uni</button><div className="top-actions"><button className="xp-pill">✦ {n(activity?.xp?.earned ?? 0)} XP</button><StreakWidget streak={activity?.streak} today={activity?.today}/><button className="mobile-menu" onClick={() => setChatOpen(true)}>☰</button></div></header><AnimatePresence mode="wait"><motion.div key={page} className="page-transition" initial={{opacity:0,y:14,filter:'blur(5px)'}} animate={{opacity:1,y:0,filter:'blur(0px)'}} exit={{opacity:0,y:-8,filter:'blur(3px)'}} transition={{duration:.28,ease:[.22,1,.36,1]}}>{body}</motion.div></AnimatePresence><SiteFooter onNavigate={setPage}/><motion.button whileHover={{scale:1.06,y:-3}} whileTap={{scale:.93}} className="leo-fab" onClick={() => setChatOpen(true)} aria-label={t('Open Leo AI')}><img src={mascot} alt=""/><span>{t('Ask Leo')} <b>✦</b></span></motion.button><Chat open={chatOpen} onClose={() => setChatOpen(false)} name={firstName} hasPlan={Boolean(admissionPlan)}/>{chatOpen && <button className="overlay" onClick={() => setChatOpen(false)} aria-label={t('Close Leo AI')}/>}{comparing && <Comparison items={comparing} onClose={() => setComparing(null)}/>}<AnimatePresence>{celebration && <StreakCelebration streak={celebration.streak} awardedXp={celebration.awardedXp} onClose={() => setCelebration(null)}/>}</AnimatePresence>{examStepOpen && <ExamResultsStep initialTests={applicantProfile.tests} onSave={saveTests} onClose={() => setExamStepOpen(false)}/>}</div>}
