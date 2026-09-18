import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useT } from './i18n.jsx'

// 1 January 2024 was a Monday, so this walks a real week and lets the locale name the days:
// M T W T F S S in English, П В С Ч П С В in Russian. No dictionary entry can get this wrong.
const dayLabels = locale => Array.from({ length: 7 }, (_, index) =>
  new Date(2024, 0, index + 1).toLocaleDateString(locale, { weekday: 'narrow' }))
const dateFromKey = key => {
  if (!key) return null
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const formatDate = (key, locale, t) => dateFromKey(key)?.toLocaleDateString(locale, { day:'numeric', month:'long', year:'numeric' }) ?? t('Not started yet')

export function FlameIcon({ className = '' }) {
  return <svg className={className} viewBox="0 0 32 38" aria-hidden="true">
    <path d="M18.6 2.2c1.1 6.2-2.8 8.6-4.9 11.2-1.7 2-1.8 4.1-.4 5.8.2-3.4 2.5-5.3 5.1-7.3 4.4 3.7 7.5 7.4 7.5 12.5 0 6.2-4.5 10.9-10.5 10.9S4.7 31 4.7 24.7c0-7.1 5.2-11.1 7.8-15.4 1.4-2.3 2.1-4.5 1.7-7.1 1.6.8 3 2 4.4 0Z"/>
    <path className="flame-core" d="M17 19c.6 3.3-2.8 4.5-2.8 7.5 0 1.7 1.1 3 2.8 3 2 0 3.5-1.6 3.5-3.8 0-2.4-1.4-4.6-3.5-6.7Z"/>
  </svg>
}

const sparks = Array.from({ length:24 }, (_, index) => ({
  id:index,
  x:Math.round(Math.cos(index * Math.PI / 12) * (135 + index % 4 * 19)),
  y:Math.round(Math.sin(index * Math.PI / 12) * (135 + index % 5 * 15)),
  rotate:index * 47,
  color:['#ff6a32', '#ffc938', '#8f76ff', '#ff9d55'][index % 4],
}))

export function StreakCelebration({ streak, awardedXp, onClose }) {
  const { t } = useT()
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3600)
    return () => window.clearTimeout(timer)
  }, [onClose])

  return <motion.div className="streak-celebration" role="dialog" aria-modal="true" aria-label={t('{count} day streak extended', { count: streak })} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.22}} onClick={onClose}>
    <motion.div className="celebration-glow" initial={{scale:.15,opacity:0}} animate={{scale:[.15,1.05,1],opacity:[0,1,.82]}} transition={{duration:.75,ease:[.16,1,.3,1]}}/>
    <div className="celebration-sparks" aria-hidden="true">{sparks.map((spark, index) => <motion.i key={spark.id} style={{background:spark.color}} initial={{x:0,y:0,scale:0,rotate:0,opacity:0}} animate={{x:spark.x,y:spark.y,scale:[0,1.25,.7],rotate:spark.rotate,opacity:[0,1,0]}} transition={{duration:1.35,delay:.24 + index * .012,ease:'easeOut'}}/>)}</div>
    <motion.section className="celebration-card" onClick={event => event.stopPropagation()} initial={{y:70,scale:.72,opacity:0}} animate={{y:0,scale:1,opacity:1}} exit={{y:-30,scale:.9,opacity:0}} transition={{type:'spring',stiffness:230,damping:18,delay:.08}}>
      <motion.div className="celebration-fire" initial={{scale:.2,rotate:-18}} animate={{scale:[.2,1.22,.94,1],rotate:[-18,8,-3,0]}} transition={{duration:.9,ease:[.16,1,.3,1]}}><span/><FlameIcon/></motion.div>
      <motion.span className="celebration-kicker" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:.52}}>{t('STREAK EXTENDED')}</motion.span>
      <motion.h2 initial={{opacity:0,scale:.8}} animate={{opacity:1,scale:1}} transition={{delay:.58,type:'spring'}}><b>{streak}</b> {t(streak === 1 ? 'day' : 'days')}</motion.h2>
      <motion.p initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:.7}}>{t('You showed up and moved your path forward.')}</motion.p>
      <motion.div className="celebration-xp" initial={{opacity:0,scale:.6,y:15}} animate={{opacity:1,scale:1,y:0}} transition={{delay:.82,type:'spring',stiffness:280}}><span>✦</span> +{awardedXp} XP</motion.div>
      <motion.button onClick={onClose} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:1}}>{t('Keep going')}</motion.button>
    </motion.section>
  </motion.div>
}

const emptyStreak = { current:0, longest:0, activeToday:false, startedAt:null, currentStartedAt:null, history:[] }

export default function StreakWidget({ streak = emptyStreak, today }) {
  const { t, locale } = useT()
  const [open, setOpen] = useState(false)
  const todayDate = dateFromKey(today) ?? new Date()
  const [month, setMonth] = useState(() => new Date(todayDate.getFullYear(), todayDate.getMonth(), 1))
  const rootRef = useRef(null)
  const history = useMemo(() => new Set(streak.history ?? []), [streak.history])

  useEffect(() => {
    if (!open) return undefined
    const close = event => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    const escape = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [open])

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const leading = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const count = new Date(year, monthIndex + 1, 0).getDate()
  const days = [...Array(leading).fill(null), ...Array.from({ length:count }, (_, index) => index + 1)]
  const monthTitle = month.toLocaleDateString(locale, { month:'long', year:'numeric' })

  return <div className="streak-widget" ref={rootRef}>
    <button className={`streak-pill ${streak.activeToday ? 'lit' : ''}`} onClick={() => setOpen(value => !value)} aria-expanded={open} aria-haspopup="dialog" aria-label={`${t('{count} day streak', { count: streak.current })}. ${t(streak.activeToday ? 'Completed today' : 'Complete a My Path task to light it today')}`}>
      <FlameIcon/>
      <span><b>{streak.current}</b><small>{t(streak.current === 1 ? 'day' : 'days')}</small></span>
    </button>
    {open && <section className="streak-popover" role="dialog" aria-label={t('Streak calendar')}>
      <div className={`streak-summary ${streak.activeToday ? 'lit' : ''}`}>
        <FlameIcon/>
        <div><b>{t(streak.activeToday ? 'Your fire is lit!' : 'Your fire is waiting')}</b><span>{t(streak.activeToday ? 'You completed a My Path task today.' : 'Complete one My Path task today to light it.')}</span></div>
      </div>
      <div className="calendar-head"><button onClick={() => setMonth(new Date(year, monthIndex - 1, 1))} aria-label={t('Previous month')}>‹</button><strong>{monthTitle}</strong><button onClick={() => setMonth(new Date(year, monthIndex + 1, 1))} aria-label={t('Next month')}>›</button></div>
      <div className="streak-calendar">
        {dayLabels(locale).map((label, index) => <small key={`${label}-${index}`}>{label}</small>)}
        {days.map((day, index) => {
          if (!day) return <i key={`empty-${index}`}/>
          const key = dateKey(new Date(year, monthIndex, day))
          const completed = history.has(key)
          const isToday = key === today
          return <span className={`${completed ? 'completed' : ''} ${isToday ? 'today' : ''}`} key={key}>{completed ? <FlameIcon/> : day}<em>{day}</em></span>
        })}
      </div>
      <div className="streak-details"><span><small>{t('STREAK STARTED')}</small><b>{formatDate(streak.startedAt, locale, t)}</b></span><span><small>{t('LONGEST STREAK')}</small><b>{streak.longest} {t(streak.longest === 1 ? 'day' : 'days')}</b></span></div>
    </section>}
  </div>
}
