-- Persistent My Path progress and the daily activity used by the streak UI.
-- A day only counts after the applicant completes a real roadmap subtask.

ALTER TABLE roadmap_tasks
  ADD COLUMN IF NOT EXISTS completed_subtasks jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS user_activity_days (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  first_completed_at timestamptz NOT NULL DEFAULT now(),
  tasks_completed integer NOT NULL DEFAULT 1 CHECK (tasks_completed > 0),
  PRIMARY KEY (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_user_activity_recent
  ON user_activity_days (user_id, activity_date DESC);

COMMENT ON TABLE user_activity_days IS
  'One row per local calendar day where a user completed at least one My Path subtask.';
