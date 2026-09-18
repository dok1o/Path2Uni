# Path2Uni

A guidance app for school leavers applying to university abroad. It takes a short profile,
reads it back to the applicant in plain words, recommends universities with reasons, lets
them compare a few, and turns the result into an ordered admission plan.

Built for applicants from the CIS choosing a bachelor's programme abroad, so the exam
catalogue includes ЕНТ/ҰБТ alongside IELTS and SAT, and English-taught programmes are the
default assumption.

---

## Run it

Needs **Node 20.19+ or 22.12+** (an older Node fails at startup on `styleText`), Docker for
the database, and a Gemini API key.

```bash
npm install
cp .env.example .env         # then fill in GEMINI_API_KEY and the database password
npm run keygen >> .env       # field-encryption keys
docker compose up -d core-db # Postgres; see the port note below
npm run doctor               # says what is still missing, and what to do about it
npm run dev                  # app and API together on http://localhost:5173
```

**If the AI feels generic, run `npm run doctor` first.** `.env` is gitignored, so a fresh
clone has no Gemini key, and the app degrades instead of erroring: plans come from the
rule-based planner, Leo answers only from the plan, the diagnosis is a template. Nothing
breaks, it just gets duller — which reads as "the agent doesn't work". Get your own free key
at [aistudio.google.com/apikey](https://aistudio.google.com/apikey); don't share one across
the team, or you share its rate limit too.

`CORE_DB_PORT` defaults to **5442**, not 5432 — a local Postgres install usually holds 5432
and the container then fails to bind.

Without a Gemini key the app still works: plans fall back to a rule-based planner and Leo
answers from the plan rather than generating. Without Docker, sign-in is unavailable.

For a production-shaped run, `npm run build && npm run server` serves the built frontend and
the API from one origin on `:8787`, which is what the session cookie needs.

---

## Languages

Russian, Kazakh and English. The switcher sits on the sign-in screen, in onboarding, in the
profile header and in the footer; the choice is remembered per browser.

The dictionary key is the English string (`src/locales/`), so English needs no table and an
untranslated string falls back to English instead of rendering blank. The model is told which
language to answer in, so the diagnosis, the match explanations, the plan and Leo all arrive
in the interface language. City and university names stay in their Latin form on purpose —
that is what a student has to type into a search box.

## The path a user walks

| Stage | Where it lives |
|---|---|
| 1. Sign in | `src/Auth.jsx` — username and password, no email |
| 2. Profile | `src/Onboarding.jsx` (up to 3 destinations, level, field, intake, English) and the exam step in `src/App.jsx`. **Edit profile** reopens it prefilled |
| 3. Diagnosis | **My matches** — profile read back, strengths, gaps, goal |
| 4. Recommendations | same page — each match with why it fits and what to check, drawn from every chosen country |
| 5. Comparison | pick 2–3 and compare on English, tuition, rounds, documents |
| 6. Roadmap | **My path** — ordered tasks with subtasks |
| 7. Next step | the first open task is the current one; quests are ticked one at a time, which earns XP and lights the daily streak |

**Decision map** shows how the plan was derived: profile and sources feed requirements, which
feed the tasks. **Universities** is the world map — click a highlighted country to zoom in to
its cities.

---

## What the data does and does not claim

Three layers, deliberately different in kind:

- **Curated catalogue** — 187 universities across 10 countries, with city, coordinates, fields
  taught, language of instruction and degree levels. This is what the model is given.
- **Open catalogue** — 10,259 institutions from the Hipolabs open dataset, for breadth only:
  name, country, website. No cities, so it cannot drive map pins.
- **Demonstration requirements** — `src/data/admissionDemo.js`. Typical entry requirements,
  deadlines and tuition per destination.

That third layer is the one to be careful about. Entry scores and deadlines are what an
applicant actually comes for, and no open dataset publishes them: they live on thousands of
university pages and change every cycle. Until the OSINT pipeline in
`docs/DATABASE_ARCHITECTURE.md` can fetch and review them, this file stands in.

**Every record there is marked `evidence: 'demo'`, and every screen that renders one of those
numbers shows a badge beside it.** The model is told they are demonstration figures and
instructed to write "typically around" rather than "you need". This is not decoration: a
student who mistakes a plausible band score for a checked one applies to the wrong place and
loses a year. Do not remove the markers, and do not add a number without one.

Nothing in the curated layer carries money or dates. If you add a field there, it needs a
`source_id` and a year — see `database/README.md`.

---

## How the AI is used

Every model call goes through `server/gemini.js`, which walks a cascade of models because the
free tier returns transient `503`s and retires model ids without notice. A model that answers
503 or 429 is parked for 90 seconds.

- **Plans** (`server/plan.js`) — the model returns ordered tasks and a confidence, nothing
  more. Coordinates, XP, ids and ordering are added by `src/services/planShape.js`: ask a
  model for pixel coordinates and it returns overlapping nonsense.
- **Diagnosis and match explanations** (`server/advisor.js`) — explanation only. The
  universities come from the catalogue and the field is a hard filter; a university the model
  invents is dropped, one it omits gets a deterministic sentence. With several destinations the
  shortlist is interleaved between them, so the comparison spans the countries actually chosen.
- **Leo** (`server/chat.js`) — answers from the profile, the plan and the shortlist. Told to
  refuse rather than guess, and the context states explicitly when there is no plan yet,
  because an empty context otherwise reads as "not listed" and gets filled in.

**Every request returns something usable.** No key, bad key, 503, timeout, cascade exhausted —
all fall through to the rule-based planner. `plan.source` says which path ran.

The profile is reduced to five fields before it leaves the process
(`deidentify()` in `server/plan.js`): destination, level, field, intake, English level. Names,
ids and contacts never reach a prompt.

---

## Security

- Passwords are **hashed, not encrypted** — scrypt, with the cost parameters inside the digest
  so they can be raised without a migration. Reversible passwords are a defect.
- Sessions are opaque and server-side: the cookie holds a random token, the database stores
  only its sha256, so a dump cannot be replayed as a login.
- `Secure` and HSTS are added **only when the request arrived over TLS**. Behind a terminating
  proxy set `TRUST_PROXY=1`; without it the `x-forwarded-proto` header is ignored, or any
  client could claim TLS and be issued a cookie it will never send back.
- Field encryption (`server/crypto.js`) is AES-256-GCM with per-value IVs, context binding and
  key rotation. It protects a stolen backup, not a compromised application.
- `GEMINI_API_KEY` has **no `VITE_` prefix** on purpose: Vite inlines every `VITE_*` variable
  into the browser bundle, so a key with that prefix is a published key.

---

## Tests

```bash
npm test        # 167 tests, no network, under a second
npm run test:live   # adds real Gemini calls and a live HTTP server (spends quota)
```

`node --test`, no framework. `tests/data.test.js` and `tests/plan.test.js` are offline;
`tests/auth.test.js`, `tests/profiles.test.js`, `tests/chat.test.js` and
`tests/tests-step.test.js` skip themselves when Postgres is down; `tests/api.test.js` skips
without a key. Browser coverage is driven ad hoc with puppeteer and is not committed.

---

## Layout

```
src/                React app. App.jsx holds most pages; Auth, Onboarding,
                    Advisor and WorldMap-adjacent screens are separate files.
src/data/           Generated catalogues and the demo requirements layer.
server/             API: auth, profiles, plans, chat, advisor, encryption.
database/core/      Numbered migrations, applied in filename order.
scripts/            One-off generators (npm run keygen, catalog:maps, catalog:fetch).
tests/              node --test suites.
```

Migrations run only against a **fresh Docker volume**. Never edit an applied one — add the
next number, and apply it by hand to an existing database:

```bash
docker compose exec core-db psql -U path2uni -d path2uni_core \
  -f /docker-entrypoint-initdb.d/012_streaks_and_task_progress.sql
```

`CLAUDE.md` carries the longer architectural notes and the constraints that are easy to break.
