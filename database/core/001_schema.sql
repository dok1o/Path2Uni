BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE education_level AS ENUM ('school', 'bachelor', 'master', 'phd', 'transfer', 'other');
CREATE TYPE application_status AS ENUM ('draft', 'planned', 'submitted', 'waitlisted', 'admitted', 'rejected', 'withdrawn');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done', 'skipped');
CREATE TYPE evidence_kind AS ENUM ('official', 'government', 'ranking', 'report', 'third_party', 'demo');
CREATE TYPE requirement_level AS ENUM ('required', 'optional', 'recommended', 'not_accepted', 'not_applicable');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  display_name text,
  locale text NOT NULL DEFAULT 'ru-KZ',
  timezone text NOT NULL DEFAULT 'Asia/Almaty',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE applicant_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Основной профиль',
  birth_date date,
  citizenship_country_code char(2),
  residence_country_code char(2),
  current_grade smallint CHECK (current_grade BETWEEN 1 AND 13),
  target_level education_level NOT NULL,
  target_start_year smallint CHECK (target_start_year BETWEEN 2020 AND 2100),
  curriculum_type text,
  gpa numeric(5,2),
  gpa_scale numeric(5,2),
  graduation_date date,
  annual_budget_amount numeric(14,2) CHECK (annual_budget_amount >= 0),
  budget_currency char(3),
  needs_financial_aid boolean NOT NULL DEFAULT false,
  profile_summary text,
  constraints jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profile_interests (
  profile_id uuid REFERENCES applicant_profiles(id) ON DELETE CASCADE,
  interest text NOT NULL,
  priority smallint NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
  PRIMARY KEY (profile_id, interest)
);

CREATE TABLE profile_languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES applicant_profiles(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  proficiency_level text,
  is_instruction_language boolean NOT NULL DEFAULT false,
  UNIQUE (profile_id, language_code)
);

CREATE TABLE profile_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES applicant_profiles(id) ON DELETE CASCADE,
  test_code text NOT NULL,
  score numeric(8,2),
  score_text text,
  test_date date,
  planned_date date,
  UNIQUE (profile_id, test_code, test_date)
);

CREATE TABLE profile_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES applicant_profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  name text NOT NULL,
  level text,
  role text,
  started_on date,
  ended_on date,
  hours_per_week numeric(5,1),
  weeks_per_year smallint,
  result text,
  impact text,
  awards text
);

CREATE TABLE profile_preferences (
  profile_id uuid PRIMARY KEY REFERENCES applicant_profiles(id) ON DELETE CASCADE,
  country_codes text[] NOT NULL DEFAULT '{}',
  excluded_country_codes text[] NOT NULL DEFAULT '{}',
  preferred_city_size text,
  climate_preferences jsonb NOT NULL DEFAULT '{}',
  campus_preferences jsonb NOT NULL DEFAULT '{}',
  learning_formats text[] NOT NULL DEFAULT '{}',
  priorities jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  title text,
  publisher text,
  evidence_type evidence_kind NOT NULL,
  language_code text,
  published_on date,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  archived_url text,
  content_hash text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  official_name text NOT NULL,
  short_name text,
  local_name text,
  institution_type text,
  ownership_type text,
  founded_year smallint,
  website_url text,
  logo_url text,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  name text NOT NULL,
  country_code char(2) NOT NULL,
  region text,
  city text NOT NULL,
  address text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  timezone text,
  is_main boolean NOT NULL DEFAULT false,
  UNIQUE (university_id, name, city)
);

CREATE TABLE university_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  metric_code text NOT NULL,
  value_numeric numeric(18,4),
  value_text text,
  unit text,
  academic_year text,
  as_of_date date,
  source_id uuid NOT NULL REFERENCES sources(id),
  confidence numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  UNIQUE (university_id, metric_code, academic_year, source_id),
  CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
);

CREATE TABLE rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  ranking_body text NOT NULL,
  ranking_name text NOT NULL,
  subject text,
  ranking_year smallint NOT NULL,
  rank_from integer,
  rank_to integer,
  score numeric(8,3),
  source_id uuid NOT NULL REFERENCES sources(id),
  UNIQUE (university_id, ranking_body, ranking_name, subject, ranking_year)
);

CREATE TABLE accreditations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid REFERENCES universities(id) ON DELETE CASCADE,
  program_id uuid,
  accrediting_body text NOT NULL,
  accreditation_name text NOT NULL,
  valid_from date,
  valid_until date,
  source_id uuid NOT NULL REFERENCES sources(id)
);

CREATE TABLE academic_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES academic_units(id),
  unit_type text NOT NULL,
  name text NOT NULL,
  website_url text,
  UNIQUE (university_id, parent_id, name)
);

CREATE TABLE programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  academic_unit_id uuid REFERENCES academic_units(id),
  campus_id uuid REFERENCES campuses(id),
  slug text NOT NULL,
  name text NOT NULL,
  degree_level education_level NOT NULL,
  degree_name text,
  field_codes text[] NOT NULL DEFAULT '{}',
  duration_months smallint,
  credits numeric(7,2),
  instruction_languages text[] NOT NULL DEFAULT '{}',
  study_modes text[] NOT NULL DEFAULT '{}',
  curriculum_url text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  source_id uuid REFERENCES sources(id),
  UNIQUE (university_id, slug, degree_level)
);

ALTER TABLE accreditations
  ADD CONSTRAINT accreditations_program_fk FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  ADD CONSTRAINT accreditation_owner CHECK (university_id IS NOT NULL OR program_id IS NOT NULL);

CREATE TABLE program_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  feature_code text NOT NULL,
  value_numeric numeric(18,4),
  value_text text,
  value_boolean boolean,
  unit text,
  academic_year text,
  source_id uuid NOT NULL REFERENCES sources(id),
  UNIQUE (program_id, feature_code, academic_year, source_id)
);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  category text NOT NULL,
  credits numeric(6,2),
  term_no smallint,
  description text
);

CREATE TABLE admission_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  entry_year smallint NOT NULL,
  entry_term text NOT NULL,
  applicant_category text NOT NULL DEFAULT 'international',
  application_platform text,
  application_url text,
  application_fee numeric(12,2),
  fee_currency char(3),
  fee_waiver_available boolean,
  capacity integer,
  notes text,
  source_id uuid NOT NULL REFERENCES sources(id),
  UNIQUE (program_id, entry_year, entry_term, applicant_category)
);

CREATE TABLE admission_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES admission_cycles(id) ON DELETE CASCADE,
  round_type text NOT NULL,
  application_deadline timestamptz,
  scholarship_deadline timestamptz,
  financial_aid_deadline timestamptz,
  decision_date date,
  deposit_deadline date,
  is_binding boolean NOT NULL DEFAULT false,
  source_id uuid NOT NULL REFERENCES sources(id),
  UNIQUE (cycle_id, round_type)
);

CREATE TABLE admission_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES admission_cycles(id) ON DELETE CASCADE,
  category text NOT NULL,
  item_code text NOT NULL,
  requirement requirement_level NOT NULL,
  minimum_numeric numeric(10,2),
  typical_25 numeric(10,2),
  typical_median numeric(10,2),
  typical_75 numeric(10,2),
  value_text text,
  applies_to jsonb NOT NULL DEFAULT '{}',
  notes text,
  source_id uuid NOT NULL REFERENCES sources(id),
  UNIQUE (cycle_id, category, item_code, source_id)
);

CREATE TABLE admission_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES admission_cycles(id) ON DELETE CASCADE,
  segment jsonb NOT NULL DEFAULT '{}',
  applicants integer,
  admitted integer,
  enrolled integer,
  waitlisted integer,
  admitted_from_waitlist integer,
  source_id uuid NOT NULL REFERENCES sources(id),
  CHECK (applicants IS NULL OR applicants >= 0),
  CHECK (admitted IS NULL OR admitted >= 0),
  CHECK (enrolled IS NULL OR enrolled >= 0)
);

CREATE TABLE cost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  academic_year text NOT NULL,
  category text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL,
  period text NOT NULL DEFAULT 'year',
  mandatory boolean NOT NULL DEFAULT true,
  audience jsonb NOT NULL DEFAULT '{}',
  source_id uuid NOT NULL REFERENCES sources(id),
  UNIQUE (program_id, academic_year, category, audience, source_id)
);

CREATE TABLE financial_aid_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  program_id uuid REFERENCES programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  aid_type text NOT NULL,
  eligibility text,
  international_eligible boolean,
  amount_min numeric(14,2),
  amount_max numeric(14,2),
  currency char(3),
  renewable boolean,
  stackable boolean,
  deadline date,
  source_id uuid NOT NULL REFERENCES sources(id)
);

CREATE TABLE outcome_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid REFERENCES universities(id) ON DELETE CASCADE,
  program_id uuid REFERENCES programs(id) ON DELETE CASCADE,
  cohort_year smallint NOT NULL,
  metric_code text NOT NULL,
  value_numeric numeric(18,4),
  value_text text,
  unit text,
  months_after_graduation smallint,
  sample_size integer,
  methodology text,
  source_id uuid NOT NULL REFERENCES sources(id),
  CHECK (university_id IS NOT NULL OR program_id IS NOT NULL),
  CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  organization_type text,
  website_url text
);

CREATE TABLE program_partners (
  program_id uuid REFERENCES programs(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  academic_year text,
  source_id uuid NOT NULL REFERENCES sources(id),
  PRIMARY KEY (program_id, organization_id, relationship_type, academic_year)
);

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES applicant_profiles(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES admission_cycles(id),
  round_id uuid REFERENCES admission_rounds(id),
  status application_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  decision_at timestamptz,
  UNIQUE (profile_id, cycle_id)
);

CREATE TABLE recommendation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES applicant_profiles(id) ON DELETE CASCADE,
  profile_snapshot jsonb NOT NULL,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES recommendation_runs(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES programs(id),
  rank_no smallint NOT NULL,
  fit_score numeric(5,2) CHECK (fit_score BETWEEN 0 AND 100),
  chance_band text,
  explanation jsonb NOT NULL,
  risks jsonb NOT NULL DEFAULT '[]',
  missing_data jsonb NOT NULL DEFAULT '[]',
  UNIQUE (run_id, rank_no),
  UNIQUE (run_id, program_id)
);

CREATE TABLE roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES applicant_profiles(id) ON DELETE CASCADE,
  recommendation_run_id uuid REFERENCES recommendation_runs(id),
  title text NOT NULL,
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roadmap_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  parent_task_id uuid REFERENCES roadmap_tasks(id),
  category text NOT NULL,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  status task_status NOT NULL DEFAULT 'todo',
  priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  source_id uuid REFERENCES sources(id),
  completed_at timestamptz
);

CREATE TABLE saved_programs (
  profile_id uuid REFERENCES applicant_profiles(id) ON DELETE CASCADE,
  program_id uuid REFERENCES programs(id) ON DELETE CASCADE,
  note text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, program_id)
);

CREATE TABLE comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES applicant_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  program_ids uuid[] NOT NULL,
  weights jsonb NOT NULL DEFAULT '{}',
  result_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(program_ids) >= 2)
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id),
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_programs_discovery ON programs (degree_level, is_active, university_id);
CREATE INDEX idx_cycles_entry ON admission_cycles (entry_year, applicant_category);
CREATE INDEX idx_requirements_cycle ON admission_requirements (cycle_id, category, item_code);
CREATE INDEX idx_cost_program_year ON cost_items (program_id, academic_year);
CREATE INDEX idx_outcomes_program ON outcome_metrics (program_id, cohort_year, metric_code);
CREATE INDEX idx_tasks_next_action ON roadmap_tasks (roadmap_id, status, priority, due_at);
CREATE INDEX idx_metrics_lookup ON university_metrics (university_id, metric_code, academic_year);
CREATE INDEX idx_profiles_constraints ON applicant_profiles USING gin (constraints);

COMMIT;

