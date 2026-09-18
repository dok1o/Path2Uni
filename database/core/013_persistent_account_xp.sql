-- XP belongs to the account, not to whichever roadmap happens to be current. Each quest can
-- create one immutable award. The application uses the best single-roadmap total as account
-- XP, so regenerating an equivalent plan cannot stack another copy of the same 600 XP.

CREATE TABLE IF NOT EXISTS user_xp_events (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_task_id uuid NOT NULL,
  subtask_index integer NOT NULL CHECK (subtask_index >= 0),
  xp integer NOT NULL CHECK (xp >= 0),
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source_task_id, subtask_index)
);

CREATE INDEX IF NOT EXISTS idx_user_xp_events_account
  ON user_xp_events (user_id, earned_at DESC);

-- Preserve XP earned before this migration. Include old roadmaps as well as the current one:
-- the whole point of this table is that replacing a roadmap must not replace the balance.
INSERT INTO user_xp_events (user_id, source_task_id, subtask_index, xp, earned_at)
SELECT p.user_id,
       rt.id,
       completed.quest_index,
       greatest(coalesce(rt.xp, 0), 0) / jsonb_array_length(rt.subtasks)
         + CASE
             WHEN completed.quest_index < mod(greatest(coalesce(rt.xp, 0), 0), jsonb_array_length(rt.subtasks)) THEN 1
             ELSE 0
           END,
       coalesce(rt.completed_at, r.created_at, now())
  FROM roadmap_tasks rt
  JOIN roadmaps r ON r.id = rt.roadmap_id
  JOIN applicant_profiles p ON p.id = r.profile_id
 CROSS JOIN LATERAL (
   SELECT value::integer AS quest_index
     FROM jsonb_array_elements_text(rt.completed_subtasks)
 ) completed
 WHERE jsonb_typeof(rt.subtasks) = 'array'
   AND jsonb_array_length(rt.subtasks) > 0
   AND completed.quest_index >= 0
   AND completed.quest_index < jsonb_array_length(rt.subtasks)
ON CONFLICT (user_id, source_task_id, subtask_index) DO NOTHING;

COMMENT ON TABLE user_xp_events IS
  'Immutable per-account quest awards. Account XP is the best total from one roadmap, not the sum of regenerated roadmaps.';
