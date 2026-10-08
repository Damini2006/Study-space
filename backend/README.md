# StudySpace Backend

The FastAPI service behind StudySpace: JWT-authenticated endpoints for spaces,
sources and ingestion, grounded chat, the study/studio/planner features, and
the admin evals. The product overview lives in the
[root README](../README.md); this file is about working on the backend.

## Setup

Python 3.10 or newer.

```bash
cd backend
pip install -e ".[dev]"
```

`.env` is optional here. Every setting in `studyspace/config.py` carries a
default, so the app and the test suite both start without one — copy the
repo-root `.env.example` only when you need real Supabase or OpenAI values.

## Quality checks

Both run from `backend/`, and both are what CI runs on every push:

```bash
python -m ruff check .   # E, F, I, UP, B — line length 110, E501 ignored
python -m pytest -q
```

The suite's integration and RLS tests need a Postgres instance with the
migrations applied. They **skip rather than fail** when the database is
unreachable, so running the suite on a machine with no database still exits
clean instead of reporting a false failure.

## Running it

```bash
# infrastructure, from the repo root
docker compose up -d postgres redis

cd backend
uvicorn studyspace.main:app --reload
```

`create_app()` in `main.py` builds the app, attaches middleware, and registers
every router — that function is the only place routes are wired up.

## Layout

```
studyspace/
  main.py          app factory; the sole registry of routers
  config.py        every setting, env-driven, all with a default
  db.py            connection pool and user_conn()
  deps.py          DbDep / UserDep — the FastAPI dependency aliases
  security.py      JWT verification, token hashing, filename sanitising
  rate_limit.py    per-identity throttling
  routers/         route modules: chat, spaces, sources, studio, evals, ...
  services/        retrieval, rag, llm, chunking, eval suite, fsrs_scheduler, planner
  models/          Pydantic request and response schemas
  queue.py         arq job enqueueing (consumed by ../worker)
tests/             unit, integration and RLS suites
```

### Conventions worth knowing before editing

- **`routers/__init__.py` stays docstring-only.** It must not import its
  siblings — doing so pulls every router module, and its dependencies, into
  memory at import time. `main.py` is the only registry.
- **User-scoped queries go through `user_conn()`**, which sets `auth.uid()` and
  switches to the `authenticated` role so Row Level Security applies. Handlers
  should not open a service-role connection themselves.
- **Schema changes are migrations in `supabase/migrations/`,** not files here.
  They are applied with the Supabase CLI against the compose Postgres.
- **Model names live in `config.py`,** never in call sites, so a model swap is
  one line rather than a hunt through the services.
