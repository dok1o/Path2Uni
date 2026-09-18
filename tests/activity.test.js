import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateEarnedXp, calculateStreak, xpForSubtask } from '../server/activity.js'

test('a completion today lights a consecutive streak', () => {
  const result = calculateStreak(['2026-09-16', '2026-09-17', '2026-09-18'], '2026-09-18')
  assert.equal(result.current, 3)
  assert.equal(result.longest, 3)
  assert.equal(result.activeToday, true)
  assert.equal(result.startedAt, '2026-09-16')
  assert.equal(result.currentStartedAt, '2026-09-16')
})

test('yesterday keeps the count but leaves today’s flame grey', () => {
  const result = calculateStreak(['2026-09-15', '2026-09-16', '2026-09-17'], '2026-09-18')
  assert.equal(result.current, 3)
  assert.equal(result.activeToday, false)
})

test('a missed day resets the current streak without losing the longest one', () => {
  const result = calculateStreak(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-16'], '2026-09-18')
  assert.equal(result.current, 0)
  assert.equal(result.longest, 3)
  assert.equal(result.activeToday, false)
})

test('duplicate completions on one day only count once', () => {
  const result = calculateStreak(['2026-09-17', '2026-09-18', '2026-09-18'], '2026-09-18')
  assert.deepEqual(result.history, ['2026-09-17', '2026-09-18'])
  assert.equal(result.current, 2)
})

test('a stage reward is split exactly across its quests', () => {
  assert.deepEqual([0, 1, 2].map(index => xpForSubtask(100, 3, index)), [34, 33, 33])
  assert.equal([0, 1, 2].reduce((sum, index) => sum + xpForSubtask(100, 3, index), 0), 100)
})

test('earned XP only includes completed quests', () => {
  const result = calculateEarnedXp([
    { xp:100, subtasks:['a', 'b', 'c'], completed_subtasks:[0, 2] },
    { xp:40, subtasks:['a', 'b'], completed_subtasks:[1] },
  ])
  assert.deepEqual(result, { earned:87, completedQuests:3 })
})
