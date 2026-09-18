import { pool, query } from './db.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DAY_MS = 86_400_000

// Docker's init directory only runs for a new volume. Keep existing local installations
// compatible as well; 009_streaks_and_task_progress.sql remains the source-of-truth migration.
let schemaReady
export function ensureActivitySchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(`alter table roadmap_tasks
        add column if not exists completed_subtasks jsonb not null default '[]'::jsonb`)
      await query(`create table if not exists user_activity_days (
        user_id uuid not null references users(id) on delete cascade,
        activity_date date not null,
        first_completed_at timestamptz not null default now(),
        tasks_completed integer not null default 1 check (tasks_completed > 0),
        primary key (user_id, activity_date)
      )`)
      await query(`create index if not exists idx_user_activity_recent
        on user_activity_days (user_id, activity_date desc)`)
    })().catch(error => { schemaReady = undefined; throw error })
  }
  return schemaReady
}

const dayNumber = key => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key))
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS : null
}

export function calculateStreak(history = [], today) {
  const dates = [...new Set(history.filter(key => dayNumber(key) !== null))].sort()
  const todayNumber = dayNumber(today)
  if (!dates.length || todayNumber === null) {
    return { current: 0, longest: 0, activeToday: false, startedAt: null, currentStartedAt: null, history: dates }
  }

  let longest = 1
  let run = 1
  for (let index = 1; index < dates.length; index += 1) {
    if (dayNumber(dates[index]) === dayNumber(dates[index - 1]) + 1) run += 1
    else run = 1
    longest = Math.max(longest, run)
  }

  const latest = dayNumber(dates.at(-1))
  let current = latest >= todayNumber - 1 && latest <= todayNumber ? 1 : 0
  let currentStartIndex = dates.length - 1
  if (current) {
    for (let index = dates.length - 1; index > 0; index -= 1) {
      if (dayNumber(dates[index - 1]) !== dayNumber(dates[index]) - 1) break
      current += 1
      currentStartIndex = index - 1
    }
  }

  return {
    current,
    longest,
    activeToday: dates.includes(today),
    startedAt: dates[0],
    currentStartedAt: current ? dates[currentStartIndex] : null,
    history: dates,
  }
}

const completedIndexes = (value, count) => Array.isArray(value)
  ? [...new Set(value.filter(index => Number.isInteger(index) && index >= 0 && index < count))].sort((a, b) => a - b)
  : []

// Split a stage reward across its quests without creating or losing XP to rounding.
// Example: 100 XP over 3 quests becomes 34 + 33 + 33.
export function xpForSubtask(totalXp, count, index) {
  const total = Math.max(0, Math.trunc(Number(totalXp) || 0))
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 0 || index >= count) return 0
  return Math.floor(total / count) + (index < total % count ? 1 : 0)
}

export function calculateEarnedXp(tasks = []) {
  return tasks.reduce((summary, task) => {
    const count = Array.isArray(task.subtasks) ? task.subtasks.length : 0
    for (const index of completedIndexes(task.completed_subtasks, count)) {
      summary.earned += xpForSubtask(task.xp, count, index)
      summary.completedQuests += 1
    }
    return summary
  }, { earned:0, completedQuests:0 })
}

export async function getActivity(userId) {
  await ensureActivitySchema()
  const [{ rows: userRows }, { rows: dayRows }, { rows: progressRows }, { rows: xpRows }] = await Promise.all([
    query(`select (now() at time zone coalesce(timezone, 'Asia/Almaty'))::date::text as today
      from users where id = $1`, [userId]),
    query(`select activity_date::text as activity_date
      from user_activity_days where user_id = $1 order by activity_date`, [userId]),
    query(`select rt.id::text as task_id, rt.completed_subtasks
      from roadmap_tasks rt
      join roadmaps r on r.id = rt.roadmap_id and r.is_current
      join applicant_profiles p on p.id = r.profile_id
      where p.user_id = $1`, [userId]),
    query(`select rt.xp, rt.subtasks, rt.completed_subtasks
      from roadmap_tasks rt
      join roadmaps r on r.id = rt.roadmap_id
      join applicant_profiles p on p.id = r.profile_id
      where p.user_id = $1`, [userId]),
  ])
  const today = userRows[0]?.today ?? new Date().toISOString().slice(0, 10)
  const progress = Object.fromEntries(progressRows.map(row => [row.task_id, Array.isArray(row.completed_subtasks) ? row.completed_subtasks : []]))
  return { streak: calculateStreak(dayRows.map(row => row.activity_date), today), xp:calculateEarnedXp(xpRows), progress, today }
}

export async function setSubtaskProgress(userId, input = {}) {
  await ensureActivitySchema()
  const taskId = String(input.taskId || '')
  const subtaskIndex = Number(input.subtaskIndex)
  const completed = input.completed
  if (!UUID.test(taskId)) return { error: 'A valid taskId is required', status: 400 }
  if (!Number.isInteger(subtaskIndex) || subtaskIndex < 0) return { error: 'A valid subtaskIndex is required', status: 400 }
  if (typeof completed !== 'boolean') return { error: 'completed must be true or false', status: 400 }

  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows } = await client.query(
      `select rt.id, rt.subtasks, rt.completed_subtasks, rt.xp, u.timezone
       from roadmap_tasks rt
       join roadmaps r on r.id = rt.roadmap_id and r.is_current
       join applicant_profiles p on p.id = r.profile_id
       join users u on u.id = p.user_id
       where rt.id = $1 and p.user_id = $2
         and not exists (
           select 1 from roadmap_tasks earlier
           where earlier.roadmap_id = rt.roadmap_id
             and earlier.position < rt.position
             and earlier.status <> 'done'
         )
       for update of rt`, [taskId, userId])
    const task = rows[0]
    if (!task) { await client.query('rollback'); return { error: 'Task not found', status: 404 } }
    const count = Array.isArray(task.subtasks) ? task.subtasks.length : 0
    if (subtaskIndex >= count) { await client.query('rollback'); return { error: 'Subtask not found', status: 404 } }

    const indexes = new Set(completedIndexes(task.completed_subtasks, count))
    const wasCompleted = indexes.has(subtaskIndex)
    if (completed) indexes.add(subtaskIndex)
    else indexes.delete(subtaskIndex)
    const next = [...indexes].sort((a, b) => a - b)
    const status = next.length === count ? 'done' : next.length ? 'in_progress' : 'todo'
    await client.query(
      `update roadmap_tasks set completed_subtasks = $1::jsonb, status = $2::task_status,
         completed_at = case when $2 = 'done' then coalesce(completed_at, now()) else null end
       where id = $3`, [JSON.stringify(next), status, taskId])

    let streakExtended = false
    const awardedXp = completed && !wasCompleted ? xpForSubtask(task.xp, count, subtaskIndex) : 0
    if (completed && !wasCompleted) {
      const inserted = await client.query(
        `insert into user_activity_days (user_id, activity_date)
         values ($1, (now() at time zone coalesce($2, 'Asia/Almaty'))::date)
         on conflict (user_id, activity_date) do nothing
         returning activity_date`, [userId, task.timezone])
      streakExtended = inserted.rowCount === 1
      if (!streakExtended) {
        await client.query(
          `update user_activity_days set tasks_completed = tasks_completed + 1
           where user_id = $1
             and activity_date = (now() at time zone coalesce($2, 'Asia/Almaty'))::date`, [userId, task.timezone])
      }
    }
    await client.query('commit')
    return { activity: await getActivity(userId), event:{ awardedXp, streakExtended } }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
