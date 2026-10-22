# Pensuma

A Python test platform for secondary-school informatica. Teachers build tests with
programming questions; students solve them in the browser and get fair, flexible grading.

> The app itself is entirely in Dutch. Code, identifiers and this README are in English.

## Why

The school's old test software compared output **exactly**, so

```python
naam = input("Wat is je naam? ")
print("Hallo " + naam)
```

was marked wrong because the prompt text ended up in the output. Pensuma fixes that:

- **`input()` prompts never count.** Graded output only contains what the program `print`s.
- **Flexible comparison per test case:** `flexibel` (case/whitespace-insensitive, extra
  labels allowed), `exact`, `bevat`, `alleen getallen` (with tolerance, also `108,50`)
  and regular expressions.
- **Function tests:** call the student's function (e.g. `gemiddelde([1, 2, 3])`) and
  compare the return value.
- **Code checks:** require or forbid constructs (e.g. "use a for-loop", "`max()` is not allowed").
- **Hidden tests** so students can't hard-code answers.

## Features

**Teachers (`/docent`, email + password)**
- Classes and students: import from Excel/Magister/SOMtoday (paste or CSV), automatic
  6-digit PINs, printable login cards with QR codes, PIN reset.
- Test builder with 10–50 questions: code (test cases, model solution, "fill expected
  output from the model solution", one-click validation), multiple choice and open questions.
- Assignments ("afnames") for a class: exam or practice mode, time window, time limit,
  access code on the board, shuffle questions, fullscreen requirement, focus/tab-switch
  logging, paste blocking, results visibility.
- Live monitor during an exam: progress, time left, focus losses, extend time, reopen.
- Results matrix, per-question statistics, review each attempt, manual score overrides
  and feedback, regrade after fixing a test, CSV export (with Dutch grade 1–10).

**Students (`/leerling`, leerlingnummer + PIN)**
- Distraction-free exam screen with a code editor, "Uitvoeren" with interactive `input()`,
  self-testing against the visible test cases, autosave (also offline backup), timer.
- Results with friendly Dutch explanations of Python errors.
- A free practice playground (`/leerling/oefenen`).

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Cache Components, React Compiler, Turbopack)
- [tRPC v11](https://trpc.io) + TanStack Query
- [Drizzle ORM](https://orm.drizzle.team) + PostgreSQL
- [better-auth](https://better-auth.com) (username plugin for students, admin plugin for roles)
- Tailwind CSS v4 + [uipkge](https://uipkge.dev) components
- [Pyodide](https://pyodide.org) (Python in WebAssembly): in a Web Worker in the browser,
  and in sandboxed, locked-down child processes on the server for authoritative grading

## Getting started (development)

Requirements: [Bun](https://bun.sh), Node.js 22+, and PostgreSQL 16 (or Docker).

```bash
bun install                      # also copies the Pyodide runtime to public/pyodide
cp .env.example .env             # then fill in BETTER_AUTH_SECRET
docker compose up -d db          # or use your own Postgres and set DATABASE_URL
bun run db:migrate               # create the tables
bun run db:seed                  # optional: demo teacher, class, students and test
bun run dev                      # http://localhost:3000
```

The seed prints the demo accounts:

- Teacher: `docent@pensuma.local` / `welkom-docent` (override with `SEED_ADMIN_EMAIL`,
  `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`)
- Students in class "4H2 (demo)": leerlingnummers `17053`, `17023`, ... with their PINs

Without the seed, open `/setup` to create the first teacher account.

### Useful scripts

| Script | What it does |
| --- | --- |
| `bun run dev` | Development server |
| `bun run build` / `bun run start` | Production build / server |
| `bun run typecheck` | TypeScript |
| `bun run lint` | Biome lint + format check |
| `bun test` | Unit tests (grading logic, parsers, ...) |
| `bun run db:generate` | Generate a SQL migration after changing `src/server/db/schema` |
| `bun run db:migrate` | Apply migrations |
| `bun run db:seed` | Seed demo data |
| `bun run db:studio` | Drizzle Studio |

## Deploying on Dokploy

The repository contains a production `Dockerfile` (Next.js standalone output). Database
migrations run automatically when the container starts.

1. **Create a PostgreSQL database** in Dokploy (Databases → PostgreSQL) and copy its
   internal connection URL.
2. **Create an application** (Applications → Create) from this Git repository.
   - Build type: **Dockerfile** (path `Dockerfile`).
   - Port: **3000**.
3. **Environment variables:**

   ```env
   DATABASE_URL=postgresql://user:password@your-postgres-host:5432/pensuma
   BETTER_AUTH_SECRET=<openssl rand -base64 32>
   BETTER_AUTH_URL=https://toetsen.jouwschool.nl
   # optional
   GRADER_POOL_SIZE=2
   GRADER_MAX_CONCURRENCY=4
   ```

   `BETTER_AUTH_URL` must be the exact public URL (it's used for cookies and origin checks).
4. **Domain:** add your domain in Dokploy with HTTPS (Let's Encrypt).
5. Deploy, open `https://<your-domain>/setup` and create the first teacher account.

Alternatively, deploy with Docker Compose (`docker-compose.yml` includes Postgres):

```bash
BETTER_AUTH_SECRET=... BETTER_AUTH_URL=https://... docker compose up -d --build
```

### Sizing

Each server-side Python sandbox uses roughly 100 MB of RAM. Grading is queued, so a
class of 30 submitting at once is fine on a 2 vCPU / 2–4 GB machine with the defaults.
Raise `GRADER_POOL_SIZE` / `GRADER_MAX_CONCURRENCY` on bigger machines.

## Project structure

```
src/
  app/                    routes (Dutch URLs)
    (docent)/docent/…     teacher area
    (leerling)/leerling/… student area
    inloggen, setup       auth pages
    api/auth, api/trpc    better-auth + tRPC handlers
  components/
    ui/                   uipkge component library
    app/                  shared app components (PageHeader, CodeEditor, Markdown, …)
    python/               Python runtime UI (run console, test results, error cards)
    docent/, leerling/    feature components
  lib/
    questions/schema.ts   question / answer / grading contracts (zod)
    grading/              isomorphic output comparison + scoring
    python/               browser Python runtime (Pyodide worker) + harness
  server/
    api/                  tRPC routers
    db/                   Drizzle schema, client, migrations runner
    grader/               sandboxed server-side Python grader
    services/             accounts, grading, assignment logic
    auth.ts, session.ts   better-auth config and server guards
drizzle/                  SQL migrations
scripts/seed/             demo data
```

## Glossary (UI ↔ code)

| Dutch (UI) | Code |
| --- | --- |
| docent | admin |
| leerling | student |
| klas | class |
| toets | test |
| vraag | question |
| afname | assignment |
| poging | attempt |
| antwoord | answer |
