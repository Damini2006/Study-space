# Contributing

[ARCHITECTURE.md](ARCHITECTURE.md) says what the system is. This file is
how to change it safely: setup, the gates CI runs, the house conventions,
and the discipline every test change here is held to. The product story
stays in the [README](README.md); backend internals get their own
[backend/README](backend/README.md).

## Setup

**Frontend** — Node 22:

```bash
cd frontend
npm ci
npm run dev          # http://localhost:5173, which CORS already allows
```

**Backend** — Python 3.10+ (CI runs 3.11):

```bash
cd backend
pip install -e ".[dev]"
```

`.env` is optional: every setting in `config.py` has a default, and
[.env.example](.env.example) documents all of them. Copy it only when you
need real Supabase or OpenAI values.

**Infrastructure** for tests that touch real data, from the repo root:

```bash
docker compose up -d postgres redis   # or `docker compose up` for all five
cd backend
uvicorn studyspace.main:app --reload
```

Backend tests **skip rather than fail** when Postgres is unreachable — a
suite that exits clean with no database means "not exercised here", not
"verified here". Run CI's order locally when it matters.

**End-to-end tests** need the browser once:

```bash
cd frontend
npx playwright install chromium
```

## The gates

Run these before you commit, not after you push:

| Gate | Command | Catches |
|---|---|---|
| Frontend lint + unit + build | `npm run check` (in `frontend/`) | ESLint findings, the vitest suite, build and bundle breakage |
| Frontend e2e | `npm run test:e2e` (in `frontend/`) | Real flows against the built bundle, first-load byte budgets, response headers |
| Everything frontend | `npm run check:all` (in `frontend/`) | All three in one command |
| Backend lint | `python -m ruff check .` (in `backend/`) | Style and bugbear rules (E, F, I, UP, B), line length 110 |
| Backend tests | `python -m pytest -q` (in `backend/`) | API, services, the docs gate, the env registry |
| Dependency audit | `pip-audit .` (in `backend/`), `npm audit --audit-level=high` (in `frontend/`) | Known CVEs — the frontend audit is the whole tree, dev included, because the build runs dev dependencies too |
| Dockerfile lint | `docker build --check ./backend` and `docker build --check ./worker` (repo root) | Dockerfile mistakes before the image is built |

## What CI does with your push

`.github/workflows/ci.yml` runs the same rows, in an order chosen so
failures read clearly:

1. **lint-and-test** — pip-audit, ruff, pytest; then npm audit, lint,
   test, build (Python rows first, then Node).
2. **e2e** — deliberately a separate job, so the Chromium download
   doesn't tax every push and a browser-only failure looks like its own
   job instead of a unit-test flake. Playwright traces upload on failure.
3. **docker** — main only, and only after both gates pass: backend,
   worker and frontend images to ghcr.io. Nothing ships on red.
4. **deploy-render** — Render deploy hooks for backend and worker
   (each a no-op when its secret is unset), then Vercel.

Pull requests run steps 1 and 2. Pushes to `main` run everything.

## House conventions

### Frontend

- **`.jsx` is plain JavaScript.** No type annotations, no
  `useState<T>()`, no bare `value={true}` (booleans belong in `checked`,
  `disabled`, `aria-*` — `value` would render the string `"true"`).
- **Conditional JSX is an explicit ternary, never a `&&` guard.** A guard
  like `count && <Badge/>` renders the count itself when it is `0`, and
  `&&` mixed with `||` binds surprises; the ternary says both branches
  out loud.
- **Tokens or icons, never literals.** Components consume CSS custom
  properties / the Tailwind theme — no raw hex in component code — and
  reach for lucide-react for icons. Semantic colors ship with an icon
  and a text label (see README → Design System).
- Pages are lazy behind `Suspense`; server state lives in TanStack
  Query. Unit tests sit in `frontend/tests/`, browser flows in
  `frontend/e2e/`.

### Backend

The editing rules live in [backend/README](backend/README.md)'s
Conventions section — `routers/__init__.py` stays docstring-only,
user-scoped queries go through `user_conn()`, schema changes are
migrations in `supabase/migrations/`, model names live in `config.py`.
Read that section before touching a router or a service.

### Commits

- **One increment per commit, gates green at the commit itself.** CI is
  the safety net, not the reviewer.
- **Messages are long-form on purpose**: what changed, why it's right,
  the numbers you measured, the commands you ran. The subject states the
  outcome, not the file you happened to edit.
- A claim in a message that "test X proves Y" must have been proven by
  breaking Y first — see below.

## Mutation-proofing

A green test proves nothing if it cannot fail. Before committing a fix,
break the fix — disable the guard, delete the new line — and watch the
test fail **by name**, with a message that points at the problem rather
than `assert False`. Restore, rerun, commit. Three from this repo's
history:

- Neutering the production docs gate turns the 404 assertions into
  `assert 200 == 404` — the gate is real, not decorative.
- Commenting out one `include_router` makes the spec canary report
  `routers missing from the spec: ['/api/client-errors']`, while the
  count floor happily accepts 66 paths — which is why both exist.
- Deleting one line of `.env.example` fails with
  `settings with no .env.example line: ['ENV']`.

If a mutation does not fail the suite, the test was never testing the
thing you think it is.

## Keeping the docs honest

- New setting in `config.py`? Its `.env.example` line lands in the same
  commit — `test_env_example.py` fails in both directions otherwise.
- A new process, path, or invariant belongs in
  [ARCHITECTURE.md](ARCHITECTURE.md) in the same change that introduces
  it; this file's gate table must match what CI actually runs.

## Security

Report vulnerabilities per [SECURITY.md](SECURITY.md) — privately, not
as a public issue.
