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
      await query(`create table if not exists user_xp_events (
        user_id uuid not null references users(id) on delete cascade,
        source_task_id uuid not null,
        subtask_index integer not null check (subtask_index >= 0),
        xp integer not null check (xp >= 0),
        earned_at timestamptz not null default now(),
        primary key (user_id, source_task_id, subtask_index)
      )`)
      await query(`create index if not exists idx_user_xp_events_account
        on user_xp_events (user_id, earned_at desc)`)
      // Numbered Docker migrations are not replayed for an existing volume. Backfill old
      // completed quests here too, so deploying this update never resets an account's XP.
      await query(`insert into user_xp_events (user_id, source_task_id, subtask_index, xp, earned_at)
        select p.user_id, rt.id, completed.quest_index,
               greatest(coalesce(rt.xp, 0), 0) / jsonb_array_length(rt.subtasks)
                 + case when completed.quest_index < mod(greatest(coalesce(rt.xp, 0), 0), jsonb_array_length(rt.subtasks)) then 1 else 0 end,
               coalesce(rt.completed_at, r.created_at, now())
          from roadmap_tasks rt
          join roadmaps r on r.id = rt.roadmap_id
          join applicant_profiles p on p.id = r.profile_id
         cross join lateral (
           select value::integer as quest_index
             from jsonb_array_elements_text(rt.completed_subtasks)
         ) completed
         where jsonb_typeof(rt.subtasks) = 'array'
           and jsonb_array_length(rt.subtasks) > 0
           and completed.quest_index >= 0
           and completed.quest_index < jsonb_array_length(rt.subtasks)
        on conflict (user_id, source_task_id, subtask_index) do nothing`)
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

// Changing target universities creates a new roadmap. Public and account XP therefore use
// the best single roadmap total instead of summing regenerated copies of the same quests.
export async function getXpLeaderboard(userId, limit = 10) {
  await ensureActivitySchema()
  const safeLimit = Math.max(1, Math.min(25, Math.trunc(Number(limit) || 10)))
  const { rows } = await query(`
    with plan_totals as (
      select e.user_id, rt.roadmap_id, sum(e.xp)::integer as xp
        from user_xp_events e
        join roadmap_tasks rt on rt.id = e.source_task_id
       group by e.user_id, rt.roadmap_id
    ), best_totals as (
      select user_id, max(xp)::integer as xp from plan_totals group by user_id
    ), ranked as (
      select u.id, u.username::text as username,
             coalesce(nullif(trim(u.display_name), ''), u.username::text) as display_name,
             coalesce(b.xp, 0)::integer as xp,
             row_number() over (order by coalesce(b.xp, 0) desc, u.created_at asc, u.username asc) as position
        from users u
        left join best_totals b on b.user_id = u.id
       where u.username is not null
    )
    select username, display_name, xp, position, id = $1 as is_current_user
      from ranked
     where (xp > 0 and position <= $2) or id = $1
     order by position`, [userId, safeLimit])

  const present = row => ({
    rank:Number(row.position), username:row.username, displayName:row.display_name,
    xp:Number(row.xp), isCurrentUser:Boolean(row.is_current_user),
  })
  const entries = rows.map(present)
  return {
    leaders:entries.filter(entry => entry.xp > 0 && entry.rank <= safeLimit),
    me:entries.find(entry => entry.isCurrentUser) ?? null,
  }
}

export async function getActivity(userId) {
  await ensureActivitySchema()
  const [{ rows: userRows }, { rows: dayRows }, { rows: taskRows }, { rows: xpRows }] = await Promise.all([
    query(`select (now() at time zone coalesce(timezone, 'Asia/Almaty'))::date::text as today
      from users where id = $1`, [userId]),
    query(`select activity_date::text as activity_date
      from user_activity_days where user_id = $1 order by activity_date`, [userId]),
    query(`select rt.id::text as task_id, rt.xp, rt.subtasks, rt.completed_subtasks
      from roadmap_tasks rt
      join roadmaps r on r.id = rt.roadmap_id and r.is_current
      join applicant_profiles p on p.id = r.profile_id
      where p.user_id = $1 order by rt.position`, [userId]),
    query(`select plan_xp::integer as earned, completed_quests::integer
             from (
               select sum(e.xp) as plan_xp, count(*) as completed_quests
                 from user_xp_events e
                 join roadmap_tasks rt on rt.id = e.source_task_id
                where e.user_id = $1
                group by rt.roadmap_id
             ) totals
            order by plan_xp desc, completed_quests desc
            limit 1`, [userId]),
  ])
  const today = userRows[0]?.today ?? new Date().toISOString().slice(0, 10)
  const progress = Object.fromEntries(taskRows.map(row => [row.task_id, completedIndexes(row.completed_subtasks, row.subtasks?.length ?? 0)]))
  const current = calculateEarnedXp(taskRows)
  return {
    streak:calculateStreak(dayRows.map(row => row.activity_date), today),
    xp:{
      earned:Number(xpRows[0]?.earned ?? 0),
      completedQuests:Number(xpRows[0]?.completed_quests ?? 0),
      currentEarned:current.earned,
      currentCompletedQuests:current.completedQuests,
    },
    progress, today,
  }
}

/**
 * Marks today as a day this person moved their path forward. Idempotent per calendar day, in
 * the user's own timezone — a streak that resets at UTC midnight punishes people for living
 * east of London.
 */
export async function recordActivityDay(userId) {
  await ensureActivitySchema()
  const { rows } = await query('select timezone from users where id = $1', [userId])
  const inserted = await query(
    `insert into user_activity_days (user_id, activity_date)
     values ($1, (now() at time zone coalesce($2, 'Asia/Almaty'))::date)
     on conflict (user_id, activity_date) do update set tasks_completed = user_activity_days.tasks_completed + 1
     returning (xmax = 0) as first_today`, [userId, rows[0]?.timezone ?? null])
  return Boolean(inserted.rows[0]?.first_today)
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
      `select rt.id, rt.roadmap_id, rt.position, rt.subtasks, rt.completed_subtasks, rt.xp, u.timezone
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
    if (!task) { await client.query('rollback'); return { error: 'Task is locked or does not exist', status: 404 } }
    const count = Array.isArray(task.subtasks) ? task.subtasks.length : 0
    if (subtaskIndex >= count) { await client.query('rollback'); return { error: 'Quest does not exist', status: 404 } }

    const indexes = new Set(completedIndexes(task.completed_subtasks, count))
    const wasCompleted = indexes.has(subtaskIndex)
    if (completed) indexes.add(subtaskIndex)
    else indexes.delete(subtaskIndex)
    const next = [...indexes].sort((a, b) => a - b)
    const status = next.length === count ? 'done' : 'in_progress'
    await client.query(
      `update roadmap_tasks set completed_subtasks = $1::jsonb, status = $2::task_status,
         completed_at = case when $2 = 'done' then coalesce(completed_at, now()) else null end
       where id = $3`, [JSON.stringify(next), status, task.id])

    await client.query(
      `update roadmap_tasks set status = 'todo'
       where roadmap_id = $1 and position > $2 and status = 'in_progress'`,
      [task.roadmap_id, task.position])
    if (status === 'done') {
      await client.query(
        `update roadmap_tasks set status = 'in_progress'
         where id = (
           select id from roadmap_tasks
           where roadmap_id = $1 and position > $2 and status = 'todo'
           order by position limit 1
         )`, [task.roadmap_id, task.position])
    }

    let streakExtended = false
    let awardedXp = 0
    if (completed && !wasCompleted) {
      const reward = xpForSubtask(task.xp, count, subtaskIndex)
      const award = await client.query(
        `insert into user_xp_events (user_id, source_task_id, subtask_index, xp)
         values ($1, $2, $3, $4)
         on conflict (user_id, source_task_id, subtask_index) do nothing
         returning xp`, [userId, task.id, subtaskIndex, reward])
      awardedXp = Number(award.rows[0]?.xp ?? 0)
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
