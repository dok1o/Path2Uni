-- Two things the interface needs and the schema did not have.
--
-- 1. The diagnosis and match explanations cost two Gemini calls and 6 seconds, and were
--    recomputed on every visit to My matches. They only change when the profile changes, so
--    they are cached against a fingerprint of the profile and reused until it moves.
-- 2. roadmap_tasks already has a status, but nothing ever wrote to it: a task could not be
--    ticked off. completed_at exists in 001_schema.sql; this only adds the index that makes
--    "what is next" cheap to answer.

BEGIN;

CREATE TABLE profile_advice (
  profile_id uuid PRIMARY KEY REFERENCES applicant_profiles(id) ON DELETE CASCADE,
  -- sha256 of the profile fields the advice depends on. A mismatch means regenerate.
  fingerprint text NOT NULL,
  diagnosis jsonb NOT NULL,
  matches jsonb NOT NULL DEFAULT '[]',
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE profile_advice IS
  'Cached stage 3 and 4 output. Keyed by profile, invalidated by fingerprint, never by time: '
  'the advice is only stale when the answers it was built from have changed.';

CREATE INDEX idx_roadmap_tasks_progress ON roadmap_tasks (roadmap_id, status, position);

COMMIT;
