# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # first run only
npm run dev          # Vite dev server — also mounts the plan API at /api/ai/admission-plan
npm run build        # production build into dist/ (dist/ is committed)
npm run preview      # serve the built bundle
npm run server       # serves dist/ AND the API on :8787 — one origin, which is what cookie auth needs
npm test             # 94 tests, no network (auth tests skip themselves without Postgres)
npm run test:live    # the above plus real Gemini calls and a live HTTP server (spends quota)
npm run keygen       # prints fresh field-encryption keys for .env

docker compose up -d core-db   # required for sign-in; see the port note below
node --test tests/data.test.js   # a single file

cp .env.example .env # then replace both passwords
docker compose up -d # core PostgreSQL, intelligence PostgreSQL on :5433
```

`CORE_DB_PORT` defaults to **5442**, not 5432: a local Postgres install commonly holds 5432 and the container then fails to bind.

`.env` holds `GEMINI_API_KEY`, read by the Node side only ([vite.config.js](vite.config.js) and [server/index.js](server/index.js)). It deliberately has **no `VITE_` prefix**, because Vite inlines every `VITE_*` var into the browser bundle — an API key with that prefix is a published key. Anything calling a model must run server-side.

Tests use the built-in `node --test` runner — no framework, no dependency. `tests/data.test.js` and `tests/plan.test.js` are offline and must stay that way; `tests/auth.test.js` needs Postgres and skips itself when the database is down; `tests/api.test.js` makes real Gemini calls and skips itself without a `GEMINI_API_KEY`, so it is excluded from `npm test`. Browser coverage is not committed: it needs a Chrome path and is driven ad hoc with puppeteer-core. There is no linter or formatter. [vite.config.js](vite.config.js) exists only to register `@vitejs/plugin-react` and to mount the plan API as dev middleware, so one command serves both. Don't add a test command to docs unless you also add the tooling.

**Node 20.19+ / 22.12+ is required** — this Vite needs `styleText` from `node:util` and a native `@rolldown/binding-*`. On older Node the dev server dies at startup with a `SyntaxError` on `styleText`; if `node_modules` was installed on another platform or by npm 8, it dies instead on `Cannot find native binding` — `rm -rf node_modules && npm install` on the right Node fixes that. `node_modules/.bin/*` may also arrive without the executable bit (zip download), which shows up as `Permission denied`.

## What this is

Path2Uni is a gamified admission-journey app for international applicants. Working today: sign-up and sign-in against `path2uni_core`, the world map and university catalogue, and Gemini-backed plan generation. Still untouched: the rest of the schema (programs, costs, outcomes, saved shortlists) has no code reading or writing it, there is no ORM or migration tool, and nothing a user does outside signing in is persisted. Dashboard stats, Friends and the Leo chat are literal data in the component that renders them.

## Frontend architecture

- [src/App.jsx](src/App.jsx) holds *every* page and component (Dashboard, GamePath, OSINT, Universities, Friends, Profile, Chat) plus the router. "Routing" is `useState('home')` in `App` and a ternary chain selecting the body; `setPage` is drilled down as a prop. Adding a page means adding a component here, an entry in `nav`, and a branch in that ternary.
- The file is written in a deliberately dense style: single-line JSX components, inline data arrays next to the component that renders them. Match it rather than reformatting — a prettier pass would rewrite the whole file.
- [src/WorldMap.jsx](src/WorldMap.jsx) is the one component that lives outside `App.jsx` — it carries d3-geo projection logic that does not belong in a one-line JSX file. `src/` stays flat; there is no `components/` directory.
- CSS is plain global stylesheets split by area — `styles.css` (design tokens on `:root`, shell, typography), `game.css`, `explorer.css`, `osint.css`, `worldmap.css` — all imported once in [src/main.jsx](src/main.jsx) and minified to one line each. No CSS modules, no Tailwind. Class names are global; new styles go in the area file that owns the page. Responsive breakpoints are consistently 1000px and 700px.
- Design tokens (`--ink`, `--purple`, `--paper`, …) live in `:root` in [src/styles.css](src/styles.css); use them instead of new hex values.

### The one real data flow

`App` owns `admissionPlan`, seeded from `cloneAdmissionPlan()`. The OSINT page calls `onGenerate(objective)` → [src/services/roadmapAI.js](src/services/roadmapAI.js) → new plan → re-renders both the OSINT graph and the GamePath levels. Everything else on screen is literal data inside the component.

The chain is `POST /api/ai/admission-plan` → de-identify → shortlist → Gemini → assemble:

| File | Role |
|---|---|
| [src/services/roadmapAI.js](src/services/roadmapAI.js) | Browser client. Calls the API; falls back to the local planner only if the API is unreachable. |
| [server/plan.js](server/plan.js) | Handler. De-identifies, builds the shortlist, calls Gemini, degrades to rules, writes the run log. |
| [server/gemini.js](server/gemini.js) | Model cascade, prompt, response schema. |
| [src/services/planContext.js](src/services/planContext.js) | Parses objective + profile into destination / field / degree / intake / English level. Shared by server and fallback. |
| [src/services/planShape.js](src/services/planShape.js) | `normalizeTasks` + `buildGraph` + `assemblePlan` — the wire format, owned by the app. |
| [src/services/localPlan.js](src/services/localPlan.js) | Rule-based planner. Both the offline path and the model's safety net. |

Design rules behind that split:

- **The model returns ordered tasks and a confidence, nothing else.** Coordinates, XP, ids, `state` and `due` are added by `planShape.js`. Ask a model for pixel coordinates and it returns overlapping nonsense; layout is a UI concern.
- **`deidentify()` in [server/plan.js](server/plan.js) is a whitelist, not a blacklist.** Five fields leave the process: destination, degree, field, intake, English level. Name, ids, contacts and free-text `goals` never reach the prompt. This is what makes a free tier — where prompts may be human-reviewed and trained on — acceptable for applicant data. Adding a field to that whitelist is a privacy decision, not a refactor.
- **The prompt forbids inventing fees, deadlines, acceptance rates and exam dates**, and `normalizeTasks` drops any task type the UI cannot render. Treat model output as untrusted input.
- **Every request returns a usable plan.** No key, bad key, 503, timeout, cascade exhausted — all fall through to `buildLocalPlan`. `plan.source` says which path ran (`{kind:'gemini',model}` or `{kind:'rules',reason}`); the shortlist is present either way because it comes from our own data.
- The task count varies between 3 and 5, so **no component may assume a fixed number**.

Gemini specifics learned the hard way: free-tier models return transient `503 "high demand"`, and Google retires model ids for new accounts (`gemini-2.5-flash` now 404s with a pointer to a newer one). Hence `MODELS` is a cascade, not a constant, with a 90s cooldown on any model that answers 503/429 — a blind retry costs a full round-trip of user-visible latency. Generation itself runs 6–14s; real usage is ~350–500 prompt tokens and ~200–450 output tokens per plan.

`server/ai-runs.jsonl` is the run log, shaped after the `ai_runs` table in `database/intelligence`. It records model, tokens, latency and failure attempts, and deliberately contains **no prompt text and no profile data**. It is gitignored.

Constraints that are easy to break:

- **`deidentify()` and `readObjective()` take request-body input, so they must tolerate garbage.** A `languages` that is a string rather than an array used to throw a `TypeError` and turn a request into a 500; `tests/plan.test.js` pins that behaviour.
- **`matched` counts only what the objective text itself named**, never a value inherited from the profile — otherwise confidence is inflated on an empty objective.
- **A field passed to `shortlistUniversities` is a hard filter, not a ranking hint.** It once let English-taught universities through that did not teach the subject, which put false "matches" into the prompt.
- **`task.type` must stay `research` | `documents` | `application`.** `TaskIcon` and the `.osint-node.task.*` / `.panel-task-icon.*` CSS only cover those three; a fourth type renders as a bare fallback icon with default colors.
- **Graph `x`/`y` are percentages of the OSINT canvas, and a node card is ~20% of it wide and ~9% tall.** Two nodes closer than that in both axes visibly overlap. Current layout keeps fixed nodes on the left (`profile`/`goal`/`source`/`requirement`) and staggers tasks down `x: 74/86`.
- **GamePath computes level `top` and the SVG trail from the task count** — nothing about the map is hardcoded to 3 levels any more, including the two decorative `.path-reward` chips, which are placed in the gaps between levels.
- `edges` are `[fromId, toId]` pairs referencing node ids; the OSINT inspector finds neighbours by flattening edges containing the selected id, so every task id must also exist as a node id.

## Accounts

Username and password, no email. [database/core/003_auth.sql](database/core/003_auth.sql) added what `001_schema.sql` left out — the original `users` table had an email and a display name but no credentials at all.

- **[server/auth.js](server/auth.js) is the whole security surface.** scrypt from `node:crypto`; the cost parameters live inside the digest (`scrypt$N$r$p$salt$hash`) so they can be raised without a migration. `timingSafeEqual` everywhere, and a decoy hash burned when the username does not exist — a missing account and a wrong password take the same time and return the same message.
- **`verifyPassword` validates the digest's shape before doing any work.** An empty digest derives a zero-length key, and `timingSafeEqual` of two empty buffers is *true* — a planted `scrypt$$$$$` row would otherwise accept any password. [004_auth_hardening.sql](database/core/004_auth_hardening.sql) makes such a row unstorable too. Do not relax either check.
- **Sessions are opaque and server-side.** The cookie holds a random token; `sessions.token_hash` holds only its sha256, so a database dump cannot be replayed as a login. The cookie is `HttpOnly; SameSite=Lax` — add `Secure` when this runs behind TLS.
- **The API is same-origin by design.** `npm run server` serves `dist/` as well as `/api/*`. A wildcard `Access-Control-Allow-Origin` cannot carry credentials, so a cross-origin split would need an explicit allowlist; `tests/api.test.js` asserts no CORS header is advertised.
- Eight wrong passwords lock an account for 15 minutes. The lock is checked *before* any password work, so it cannot be used to time-probe.

`App` gates on `/api/auth/me`: `user === undefined` means the answer has not arrived yet, `null` means signed out. Every hook runs before that early return — do not move the gate above them.

## Encryption and transport

Three separate things, often confused with one another:

- **Passwords are hashed, not encrypted** (scrypt, see Accounts). Reversible passwords are a defect, never a feature. Session tokens are sha256'd the same way.
- **Transport**: [server/routes.js](server/routes.js) adds `Secure` to the session cookie and sends HSTS **only when the request arrived over TLS**. Local dev is http, where a `Secure` cookie is silently discarded and nobody could sign in, and where an HSTS header would pin `localhost` to https in that browser for a year. Behind a terminating proxy the socket is plain http, so `x-forwarded-proto` is the only signal — [server/index.js](server/index.js) trusts it **only** when `TRUST_PROXY=1`, otherwise any client could claim TLS and talk the server into issuing cookies it will never send back.
- **Field encryption at rest**: [server/crypto.js](server/crypto.js), AES-256-GCM via `node:crypto`.

What field encryption buys: a stolen backup, a leaked dump, an unauthorised replica, a DBA reading tables. What it does **not** buy: protection from a compromised application — this process holds the key. Worth doing; not worth false confidence.

Rules that the design depends on:

- **Every value is bound to a `context` string** (`"applicant_profiles.birth_date"`) as GCM additional data, so a ciphertext cannot be moved between columns or rows. Changing a context string makes existing values undecryptable — it is a migration, not a rename.
- **A random IV per value.** The same plaintext never produces the same ciphertext, so the column leaks no equality. That is also why `where email = $1` can never work over an encrypted column.
- **`blindIndex()` is the searchable form** — a keyed HMAC in a companion column. It is deterministic by necessity, so it reveals which rows share a value. Never use it for low-entropy data such as a birth date, where every possible value can simply be hashed. Its key is separate from the encryption key on purpose.
- **Keys live in `P2U_KEYS` as `id:base64`, newest first.** The id travels inside each ciphertext, so rotation is: generate a key, put it first, keep the old one until everything has been rewritten. Keys must never sit in the database's own backup — otherwise whoever steals the dump steals the key and none of this bought anything.
- `decrypt()` throws on a wrong key, wrong context or tampering, and callers should let it. Returning null would turn corruption into silent data loss.

Encrypted today: `sessions.user_agent` (kept so a person can recognise their devices, never queried — a clean fit). The profile columns the schema declares are not written by anything yet; encrypt them as they are wired up, and leave `target_start_year`, `target_level` and destination in the clear — they are filtered and joined on.

## University catalogue and the world map

[src/data/worldUniversities.js](src/data/worldUniversities.js) is generated, not hand-edited. It holds **two layers that are different in kind, and the distinction is load-bearing**:

- **Curated** (`universities`, 187 across 10 countries; `cities`, 135 with coordinates). Each record states city, fields of study, language of instruction and degree levels. This is the layer handed to the model.
- **Open catalogue** — `public/universities-catalog.json`, 10,259 institutions in 201 countries from the Hipolabs open dataset. Name, country and website only; 13% have a region and none have a city. It exists for breadth (country counts, search), never for recommendations. `catalogCounts` drops rows whose country lacks an ISO alpha-2 code, so use `catalogTotal` for any headline figure.

**Neither layer carries tuition, deadlines or admission statistics, and new rows must not add them.** Those facts are time-sensitive, need a `source_id` and a year under [database/README.md](database/README.md), and belong to the OSINT pipeline. A `web` of `null` means the open catalogue did not confirm an address — leave it null rather than guessing (81% resolved).

`shortlistUniversities({country, field, level, lang, limit})` is the retrieval step: it narrows the curated layer to a dozen records to put in a prompt. Never send the catalogue to a model — it is 10k rows of bare names.

Map mechanics in [src/WorldMap.jsx](src/WorldMap.jsx):

- `public/world-countries-110m.json` is the Natural Earth TopoJSON with an `iso` alpha-2 baked into each geometry's properties (3 of 177 have none: Kosovo, N. Cyprus, Somaliland). Both `public/` files are fetched at runtime, so they stay out of the bundle.
- One `geoNaturalEarth1` projection, fitted once to a 960×500 box. **Zoom is a CSS transform on the `.map-zoom` group, not a reprojection** — that is what makes it animatable. Markers sit inside that group and counter-scale by `1/k` so they keep a constant on-screen size; strokes rely on `vector-effect: non-scaling-stroke`.
- City names are hover-only. Dense clusters (northern Italy, the Randstad) overlap at any zoom because labels are counter-scaled to a fixed size — the sidebar city list is the discoverable path, not the map labels.

## Data layer (schema designed, mostly unused)

Two physically separate PostgreSQL databases, initialized by numbered SQL files mounted into `/docker-entrypoint-initdb.d` — so **they run only against a fresh Docker volume**. Never edit a deployed script; add the next number instead (`003_auth.sql` and `004_auth_hardening.sql` were added this way). An existing volume needs the new file applied by hand: `docker compose exec core-db psql -U path2uni -d path2uni_core -f /docker-entrypoint-initdb.d/004_auth_hardening.sql`. No migration tool has been chosen yet.

- `database/core/` → `path2uni_core`, the product source of truth: profiles, universities/programs, admission cycles & requirements, itemized costs, outcomes, recommendation runs and roadmaps. `002_views.sql` defines `v_program_total_cost`, `v_admission_funnel`, `v_next_roadmap_action` — derived values (total cost, acceptance/yield rates) are computed by views from counts and items, never stored as hand-entered aggregates.
- `database/intelligence/` → `path2uni_intelligence` (pgvector): source registry, crawl jobs, content-hashed document versions, chunks + embeddings, extracted claims with evidence, contradictions, human reviews, AI run telemetry. It links to core rows by UUID only — there is no cross-database foreign key.

Rules that the schema enforces only partially and that code must uphold (see [database/README.md](database/README.md) and [docs/DATABASE_ARCHITECTURE.md](docs/DATABASE_ARCHITECTURE.md)):

- A university and a program are distinct entities; recommendations target a **program**.
- Every time-sensitive fact carries an academic/cohort year and a `source_id`.
- OSINT claims never flow into core automatically — only reviewed claims, promoted by application code through a separate idempotent publisher step.
- Demo data must use a source with `evidence_type = 'demo'` and be labelled as such in the UI.
- No API keys, passwords, identity documents, essays or recommendation letters in either database.

## Knowledge vault

`knowledge-vault/` is an Obsidian analyst workspace (numbered folders, templates in `90 Templates`), explicitly **not** a source of truth. Factual notes need `source_urls`, `accessed_at`, and a period field; only reviewed notes may carry `status: verified`.

## Conventions

- ESM throughout (`"type": "module"`); relative imports include the `.js` extension.
- No semicolons in `src/`.
- Product/UI copy is English and warm-toned (second person, encouraging). Internal docs and the vault templates are partly Russian — keep each file in the language it is already written in.
