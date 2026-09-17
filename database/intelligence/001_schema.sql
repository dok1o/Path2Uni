BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE source_tier AS ENUM ('official', 'government', 'primary_report', 'trusted_third_party', 'community', 'unknown');
CREATE TYPE review_state AS ENUM ('pending', 'accepted', 'rejected', 'superseded');
CREATE TYPE job_state AS ENUM ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled');

CREATE TABLE source_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_url text NOT NULL UNIQUE,
  domain text NOT NULL,
  title text,
  publisher text,
  tier source_tier NOT NULL DEFAULT 'unknown',
  robots_policy text,
  terms_notes text,
  crawl_allowed boolean NOT NULL DEFAULT false,
  refresh_interval interval,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crawl_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES source_registry(id),
  requested_url text NOT NULL,
  purpose text NOT NULL,
  state job_state NOT NULL DEFAULT 'queued',
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  error jsonb,
  UNIQUE (requested_url, purpose, requested_at)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES source_registry(id),
  crawl_job_id uuid REFERENCES crawl_jobs(id),
  fetched_url text NOT NULL,
  mime_type text,
  language_code text,
  http_status smallint,
  published_on date,
  fetched_at timestamptz NOT NULL,
  content_hash text NOT NULL,
  storage_uri text NOT NULL,
  raw_metadata jsonb NOT NULL DEFAULT '{}',
  is_current boolean NOT NULL DEFAULT true,
  UNIQUE (fetched_url, content_hash)
);

CREATE TABLE document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_no integer NOT NULL,
  heading_path text[],
  page_no integer,
  char_start integer,
  char_end integer,
  content text NOT NULL,
  token_count integer,
  embedding vector(1536),
  embedding_model text,
  UNIQUE (document_id, chunk_no)
);

CREATE TABLE entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  canonical_name text NOT NULL,
  core_entity_type text,
  core_entity_id uuid,
  attributes jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, canonical_name)
);

CREATE TABLE entity_aliases (
  entity_id uuid REFERENCES entities(id) ON DELETE CASCADE,
  alias text NOT NULL,
  language_code text,
  PRIMARY KEY (entity_id, alias)
);

CREATE TABLE entity_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  predicate text NOT NULL,
  object_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  valid_from date,
  valid_until date,
  confidence numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  UNIQUE (subject_id, predicate, object_id, valid_from)
);

CREATE TABLE extraction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  extractor_name text NOT NULL,
  extractor_version text NOT NULL,
  model_name text,
  prompt_version text,
  state job_state NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  token_usage jsonb,
  error jsonb
);

CREATE TABLE claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  predicate text NOT NULL,
  value_json jsonb NOT NULL,
  unit text,
  valid_for text,
  valid_from date,
  valid_until date,
  observed_at timestamptz NOT NULL DEFAULT now(),
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  review_status review_state NOT NULL DEFAULT 'pending',
  extraction_run_id uuid REFERENCES extraction_runs(id),
  supersedes_claim_id uuid REFERENCES claims(id),
  core_target_table text,
  core_target_id uuid
);

CREATE TABLE claim_evidence (
  claim_id uuid REFERENCES claims(id) ON DELETE CASCADE,
  chunk_id uuid REFERENCES document_chunks(id) ON DELETE CASCADE,
  quote_text text,
  evidence_weight numeric(4,3) CHECK (evidence_weight BETWEEN 0 AND 1),
  PRIMARY KEY (claim_id, chunk_id)
);

CREATE TABLE contradictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_a_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  claim_b_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  reason text NOT NULL,
  resolution text,
  resolved_claim_id uuid REFERENCES claims(id),
  resolved_at timestamptz,
  CHECK (claim_a_id <> claim_b_id)
);

CREATE TABLE verification_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  reviewer_id text NOT NULL,
  decision review_state NOT NULL,
  notes text,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  model_name text NOT NULL,
  model_version text,
  prompt_version text NOT NULL,
  input_hash text NOT NULL,
  input_redacted jsonb,
  output_json jsonb,
  citations jsonb NOT NULL DEFAULT '[]',
  latency_ms integer,
  token_usage jsonb,
  cost_amount numeric(12,6),
  status job_state NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recommendation_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_run_id uuid NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  core_recommendation_id uuid NOT NULL,
  factor_code text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('positive', 'negative', 'neutral', 'unknown')),
  weight numeric(8,4),
  explanation text NOT NULL,
  supporting_claim_ids uuid[] NOT NULL DEFAULT '{}'
);

CREATE TABLE obsidian_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  vault_path text NOT NULL UNIQUE,
  title text NOT NULL,
  frontmatter jsonb NOT NULL DEFAULT '{}',
  content_hash text,
  sync_status text NOT NULL DEFAULT 'pending',
  last_synced_at timestamptz
);

CREATE INDEX idx_chunks_document ON document_chunks (document_id, chunk_no);
CREATE INDEX idx_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_entities_core_link ON entities (core_entity_type, core_entity_id);
CREATE INDEX idx_claims_subject_predicate ON claims (subject_entity_id, predicate, review_status);
CREATE INDEX idx_claims_value ON claims USING gin (value_json);
CREATE INDEX idx_documents_current ON documents (source_id, is_current, fetched_at DESC);

COMMIT;

