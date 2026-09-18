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
npm run migrate              # applies database/core/*.sql in order, once each
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

## Deploying it (Vercel + Supabase)

`vercel.json` deploys the Vite frontend to Vercel's CDN and rewrites every `/api/*` request
to the single function in `api/index.js`. The adapter calls the same router as local Vite and
the standalone server, so production does not have a second implementation of the API.

1. **Supabase**: create a project close to Vercel's `fra1` region. Save the database password.
2. **Apply the schema once** before the first deploy. In Supabase, click **Connect**, choose
   **Session pooler** (port 5432), put that URL in local `.env` as `DATABASE_URL`, and run
   `npm run migrate`. The migration runner remembers every applied file, so the same command
   is safe again when a future migration is added.
3. In Supabase **Connect**, switch to **Transaction pooler** (port 6543) and copy that URL for
   Vercel. Serverless functions create short-lived clients, which is the workload transaction
   mode is designed for. `server/db.js` automatically limits every Vercel instance to one
   database connection.
4. In Vercel choose **Add New → Project**, import this GitHub repository and keep the settings
   from `vercel.json` (`Vite`, `npm run build`, output `dist`).
5. Add these Environment Variables for **Production**. Add them to Preview or Development
   only if those deployments are intentionally allowed to use the same database:
   - `DATABASE_URL` — the **Transaction pooler** URL from step 3;
   - `GEMINI_API_KEY`;
   - `P2U_KEYS` and `P2U_INDEX_KEY` — `npm run keygen` prints both;
   - `CRON_SECRET` — a new random value at least 16 characters long;
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` if email codes and
     reminders are required.
6. Deploy and check `/api/health`. It should report `database: "up"` and
   `model: "configured"`.

Do not regenerate `P2U_KEYS` after real accounts exist: those keys encrypt stored email
addresses. Vercel invokes `/api/cron` once daily at 05:00 UTC for digests and expired-code
cleanup; the endpoint rejects every request that does not carry `CRON_SECRET`. The free Hobby
plan allows daily cron jobs, but does not guarantee the exact minute.

The frontend is always served by the CDN rather than a sleeping container. API functions can
still have a short cold start, but there is no Render-style wait for the whole site to wake.

## Alternative deployment (Render + Supabase)

`render.yaml` is the blueprint — create the service from it rather than clicking through the
dashboard, so the deployment is something the next person can read.

1. **Supabase**: create a project. Project Settings → Database → Connection string →
   **Session pooler**. Copy that one.
   - Not the direct connection: Supabase serves it over IPv6 only, and Render's free
     instances have no IPv6. The app would never connect, and the symptom is a timeout
     rather than an error that says why.
   - Not the transaction pooler on port 6543: it does not keep prepared statements, and
     every parameterised query here is one. `npm run doctor` warns about both.
2. **Render**: New → Blueprint → point it at this repository. It reads `render.yaml`.
3. Fill in the secrets it asks for: `DATABASE_URL` (the string from step 1),
   `GEMINI_API_KEY`, `P2U_KEYS` and `P2U_INDEX_KEY` (`npm run keygen` prints the last two),
   and the `SMTP_*` values if you want sign-in codes and reminders.
4. Deploy. `npm start` runs the migrations and then the server; Supabase starts empty and has
   no equivalent of Docker's init directory.

Things worth knowing before the demo:

- **`TRUST_PROXY=1` is already in the blueprint and matters.** Render terminates TLS and
  talks plain HTTP to the container, so from inside the request looks insecure. Without this
  the session cookie never gets `Secure` and HSTS is never sent.
- **A free Render instance sleeps after 15 minutes idle**, and the next request waits about
  fifty seconds for it to wake. Open the site a minute before anyone else does.
- **Outbound SMTP may be blocked on the free plan.** If codes stop arriving after deploy,
  that is the first thing to check — the app itself degrades cleanly and says so.
- An existing database that was set up by hand takes `npm run migrate -- --baseline` once, to
  record the files as applied without re-running them.

## Languages

Russian, Kazakh and English. The switcher sits on the sign-in screen, in onboarding, in the
profile header and in the footer; the choice is remembered per browser.

The dictionary key is the English string (`src/locales/`), so English needs no table and an
untranslated string falls back to English instead of rendering blank. The model is told which
language to answer in, so the diagnosis, the match explanations, the plan and Leo all arrive
in the interface language. City and university names stay in their Latin form on purpose —
that is what a student has to type into a search box.

## The team

| | Role |
|---|---|
| **Дугашев Айсар** | Team lead — repository, interface, product direction |
| **Оралхан Нурланды** | Task progress, XP and the daily streak: server-side calculation, calendar, path screen |
| **Кензин Эльмир** | Country map and city photos, profile forms, exam entry and validation |
| **Игорь Пак** | Data architecture, model integration, security and profile privacy |

134 Lyceum, Almaty, with support from FIZTEX. Every contribution is visible in the commit
history.

## The path a user walks

| Stage | Where it lives |
|---|---|
| 1. Sign in | `src/Auth.jsx` — username and password, or an email and a six-digit code |
| 2. Profile | `src/Onboarding.jsx` (up to 3 destinations, level, field, intake, English) and the exam step in `src/App.jsx`. **Edit profile** reopens it prefilled |
| 3. Diagnosis | **My matches** — profile read back, strengths, gaps, goal |
| 4. Recommendations | same page — each match with why it fits and what to check, drawn from every chosen country |
| 5. Comparison | pick 2–3 and compare on English, tuition, rounds, documents |
| 6. Roadmap | **My path** — ordered tasks with subtasks |
| 7. Next step | the first open task is the current one; quests are ticked one at a time, which earns XP and lights the daily streak |

Alongside that path: **readiness** on every recommendation, **cost and funding** per
country, a **motivation letter workshop**, **where to take part** suggestions, and a
**notification centre**. Each is described below.

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

## Test scenario

A reviewer can walk the whole product in about five minutes:

1. Create an account — username and password, no email. Pick the interface language in the
   top-right corner first if you want the rest in Russian or Kazakh.
2. Onboarding: pick **two or three countries** (this is the thing to try — the shortlist
   interleaves between them), a degree level, a field, an intake year and an English level.
3. The plan builds from your answers. Home now names your countries and your first task.
4. **My matches** — the diagnosis in plain words, then universities with a reason each, a
   **readiness** meter you can expand, an official-site link, and the cost and funding
   section below. Pick two and press Compare.
5. **My path** — tick one quest. XP is credited, the flame lights, the celebration fires
   once, and the next stage opens.
6. **Decision map** — press *Generate graph* with your own wording, in any language. Open
   the *Official sources* node: those links are the shortlisted universities' own sites.
7. **My profile → Motivation letter** — Leo returns a structure and questions, and will
   comment on your activities if you press the button that says it sends them.
8. The **bell** in the header lists what actually needs you.

To see the AI degrade safely, remove `GEMINI_API_KEY` from `.env` and restart: every screen
still works, and `plan.source` says `rules` instead of `gemini`.

## Features built on the model

- **Readiness** (`src/services/readiness.js`) — five checks per university: field taught,
  level offered, language of instruction, English certificate against the usual bar, exam
  results on file. It is **counted, not predicted**, and the model is never asked for it.
  Field and level are disqualifying rather than scored. There is no percentage anywhere, and
  a test asserts the payload contains no percent sign.
- **Cost and funding** (`src/data/scholarships.js`) — tuition from the demonstration layer,
  and who administers funding per destination. Every URL was fetched and its page title read
  back before it was written down; two programmes are listed without a link because their
  sites would not answer. No amounts, no deadlines, no eligibility.
- **Motivation letter** (`server/essay.js`) — Leo returns the shape of the letter and the
  questions only the applicant can answer, and turns their listed activities into what a
  reader can fairly conclude. **It does not write the letter**: an essay an admissions
  officer can tell was generated is worse than a plain one, and a pasted paragraph is a
  statement about someone they did not make. The draft never leaves the browser.
- **Where to take part** (`server/opportunities.js`) — competitions, projects and programmes
  relevant to the field, with no dates, fees or eligibility rules.
- **Notifications** (`server/notices.js`) — built only from dates the applicant entered and
  their own progress: a booked exam approaching, one whose date has passed with no result, a
  stage that has not moved, a streak ending tonight. **We hold no verified application
  deadlines, so we never invent one to remind anyone about**; the one procedural item says
  "usually" and carries the demo badge.

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

## What we did not build ourselves

- **Google Gemini** — plan generation, diagnosis, match explanations, Leo, essay planning and
  opportunity suggestions. Free tier, server-side only.
- **React 19, Vite, Motion** — interface, animation.
- **@xyflow/react** — the Decision map graph canvas.
- **Natural Earth** (public domain) — country outlines for the map.
- **Hipolabs universities dataset** (open) — the 10,259-institution breadth layer.
- **Wikipedia API** — city photographs, fetched at runtime and credited in the corner.
- **node-postgres** — the only runtime dependency on the server side.

Everything else is ours: the curated catalogue, the shortlist and interleaving, the plan
shape and graph layout, readiness, authentication, field encryption, the streak and XP
calculation, the translations, and all 174 tests.

## Limitations, stated plainly

- **Entry requirements, tuition, rounds and documents are demonstration data.** Every one is
  marked `evidence: 'demo'` and badged on screen. The pipeline that would replace them with
  sourced, reviewed facts is designed (`docs/DATABASE_ARCHITECTURE.md`) and not built.
- **There is no admission probability**, and there will not be one until real entry scores
  and intake statistics exist behind it.
- **The curated layer covers 10 countries and 187 universities.** The open catalogue is
  breadth only — names and countries, never recommendations.
- **185 of 187 universities have a confirmed website.** Two could not be checked and say so.
- **Saved universities and friends live in the browser**, not the database.
- **A plan is stored in the language it was generated in**; switching language regenerates
  the diagnosis but not an existing plan.
- **The Kazakh translation has not been read by a native speaker yet.**

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
npm test        # 174 tests, no network, under a second
npm run test:live   # adds real Gemini calls and a live HTTP server (spends quota)
```

`node --test`, no framework, no dependency. `tests/data.test.js`, `tests/plan.test.js` and
`tests/readiness.test.js` are offline;
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
