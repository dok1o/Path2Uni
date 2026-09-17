-- Columns the onboarding and the generated plan need, which 001_schema.sql did not have.
--
-- `constraints jsonb` exists for flexible criteria, but the destination country, the field
-- of study and the intake year are the primary selectors of the whole product — they are
-- filtered and joined on, so they get real columns and real indexes. They are also
-- deliberately NOT encrypted: an encrypted target_start_year cannot answer "everyone
-- applying in 2027", which is the one question this table exists to answer.

ALTER TABLE applicant_profiles
  ADD COLUMN target_country_code char(2),
  ADD COLUMN target_field text,
  ADD COLUMN english_level text,
  -- One profile per user for now. A person with two destinations is a later problem, and
  -- a unique index is easier to drop than a duplicate-row bug is to find.
  ADD CONSTRAINT applicant_profiles_one_per_user UNIQUE (user_id);

CREATE INDEX idx_profiles_target ON applicant_profiles (target_country_code, target_level, target_start_year);

-- A generated plan. `objective` is what the applicant typed in their own words, so it is
-- free text about a person and is stored encrypted (see server/crypto.js). Everything else
-- here is either derived or structural.
ALTER TABLE roadmaps
  ADD COLUMN objective text,
  ADD COLUMN confidence numeric(3,2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  ADD COLUMN source_count smallint,
  ADD COLUMN shortlist jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN source jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN is_current boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN roadmaps.objective IS 'Encrypted with context roadmaps.objective. Free text written by the applicant.';
COMMENT ON COLUMN roadmaps.source IS 'Which path produced this plan: {kind:"gemini",model} or {kind:"rules",reason}.';

-- The graph shown on the Decision Map is NOT stored: it is laid out from the tasks by
-- planShape.js, so persisting it would freeze a UI decision into the database.

ALTER TABLE roadmap_tasks
  ADD COLUMN short_title text,
  ADD COLUMN xp smallint,
  ADD COLUMN subtasks jsonb NOT NULL DEFAULT '[]',
  -- The plan says "Unlocks after English certificate", not a date. due_at stays for real
  -- deadlines once the OSINT pipeline can supply them with a source.
  ADD COLUMN due_label text,
  ADD COLUMN position smallint;

CREATE INDEX idx_roadmaps_current ON roadmaps (profile_id, is_current, created_at DESC);
CREATE INDEX idx_roadmap_tasks_order ON roadmap_tasks (roadmap_id, position);
