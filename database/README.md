# Path2Uni data layer

The project uses two physically separate PostgreSQL databases.

- `path2uni_core` is the product source of truth: applicant profiles, universities, programs, admissions, costs, outcomes, recommendations and roadmaps.
- `path2uni_intelligence` is the AI/OSINT evidence store: crawls, document versions, chunks, embeddings, extracted claims, contradictions, reviews, AI run telemetry and Obsidian sync metadata.

## Start locally

1. Copy `.env.example` to `.env` and replace both passwords.
2. Run `docker compose up -d`.
3. Core PostgreSQL is exposed on port `5432`; intelligence PostgreSQL is on `5433`.

Initialization scripts run only for a new Docker volume. For later schema changes, add numbered migrations instead of editing deployed migrations.

## Data rules

- A university and a program are different entities. Recommendations target a program, not just a university.
- Time-sensitive facts include an academic/cohort year and a `source_id`.
- `minimum` and actual admitted-student percentiles are stored separately.
- Costs are itemized; totals are calculated by `v_program_total_cost`.
- Acceptance and yield rates are calculated from counts, not duplicated as manually entered percentages.
- AI/OSINT claims never enter the core database automatically. Only reviewed claims may be promoted by application code.
- Demo facts must use a source with `evidence_type = 'demo'` and must be labelled in the UI.
- Never store API keys, passwords, raw identity documents, essays, or recommendation letters in either database without a separate encrypted-storage and retention design.

