# Architecture

The [README](README.md) is the product document: features, the topology
diagram, the ingestion and query flows, the security table.
[backend/README](backend/README.md) holds the backend's layout and editing
conventions. This file is the layer between them — which process owns which
job, how one request actually travels, and the invariants that make the
pieces add up. For the gates and workflow, see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Processes

| Process | Package | Job | Runs |
|---|---|---|---|
| API | `backend/` | FastAPI over uvicorn: auth, REST + SSE, enqueue | Render (container; image defaults `ENV=production`) |
| Worker | `worker/` | arq: ingestion jobs + a cron cleanup | Render (container; `arq studyspace_worker.main.WorkerSettings`) |
| Frontend | `frontend/` | React SPA, consent-gated telemetry | Vercel (static build) |
| MCP server | `mcp/` | FastMCP over stdio, personal-access tokens | The user's own machine |
| Supabase | hosted | Postgres + pgvector, Auth, Storage, RLS | Supabase; schema lives in `supabase/migrations` |
| Redis | — | Rate-limit counters + the arq queue | Managed, or compose |
| LiteLLM | in-process | Every LLM and embedding call, provider-agnostic | Inside API and worker |
| Langfuse | optional | Tracing and evals | cloud.langfuse.com |

`docker-compose.yml` runs the stack locally: `postgres` (pgvector/pg16,
migrations mounted into `docker-entrypoint-initdb.d` so the schema exists
before the first boot), `redis`, `backend`, `worker`, `frontend` (nginx).
Both backend commands carry `--no-access-log`: the app writes its own
request lines, and uvicorn's duplicate would just be noise.

## One request through the API

1. **Middleware, outside in.** `log_requests` is registered last, so it is
   outermost — the comment in `main.py` says why: its line describes the
   response the client actually received, headers and total time included.
   Under it sits the security-header middleware, then CORS (explicit
   origins, `allow_credentials=False` because auth is bearer tokens, not
   cookies), then the router.
2. **A request id before anything else.** An inbound `X-Request-Id` is
   honored if it matches the format, otherwise one is minted. The id lands
   on `request.state`, rides every response header (CORS-exposed), every
   log line, the traceback correlation, and the JSON body of any 500 — the
   id a user reads off an error screen is the id an operator greps.
3. **Auth → RLS.** The bearer JWT is verified in `security.py`; one
   dependency in `deps.py` resolves the user, the user-scoped connection
   and the rate limit together. Data queries go through `user_conn()`,
   which sets `auth.uid()` and runs as the `authenticated` role — Row Level
   Security enforces ownership in Postgres, not in handler code. The
   service-role connection (`db_service.py`) exists only for the worker.
4. **Rate limits.** Per-identity counters in Redis (`rate_limit.py`);
   rejections carry `Retry-After`, also CORS-exposed so a browser can read
   it.
5. **Errors.** An unhandled exception produces exactly one traceback,
   correlated to the request id, and answers JSON
   `{"detail": "Internal server error", "request_id": ...}` — a stack
   trace never reaches the client, and debug mode changes none of that.
6. **Health is split on purpose.** `/api/health` is static liveness — what
   the Docker `HEALTHCHECK` probes, because a container that restarts on a
   database blip turns one outage into two. `/api/health/ready` checks the
   database for whoever actually routes traffic.

The security headers on every response: `nosniff`, frame `DENY`,
`strict-origin-when-cross-origin` referrer, camera/microphone/geolocation
off, HSTS for a year, and `Cache-Control: no-store` on `/api/*`.

## The router registry

`create_app()` in `backend/studyspace/main.py` is the only place routers
are wired — `routers/__init__.py` must stay import-free, a rule spelled
out in [backend/README](backend/README.md)'s Conventions section. Today
that registry holds 24 routers producing 68 documented paths (97
operations), all under `/api`.

FastAPI generates the OpenAPI document from that same registry, which
makes the spec two things: the reference served at `/openapi.json` with
Swagger UI at `/docs` — **outside production only**, both halves gated
together because the UI without the spec is nothing and the spec without
the UI is a free route map — and a CI canary.
`backend/tests/test_docs.py` asserts six paths across six domains plus a
floor of 50, so a dropped `include_router` fails the suite by name instead
of shipping a smaller API. The floor catches a registry that lost half
itself; the canaries catch the one that lost a single domain.

## Configuration

One pydantic-settings `Settings` (`backend/studyspace/config.py`), every
field with a default — app and test suite boot with no `.env` at all.
`.env.example` is the human view of those 58 fields, and
`tests/test_env_example.py` keeps the two views identical in both
directions: nothing declared without a line, nothing documented that no
longer exists. `ENV` selects `development | test | production` and gates
the generated reference; the image defaults to `production`, compose pins
`development`, and `.env.example` says so.

## Async work

The API enqueues; the worker executes. `queue.py` pushes ingest jobs with
an idempotent `_job_id=ingest:{source_id}` (source uploads, demo seeding),
and the worker's `ingest_source` downloads from Storage, extracts text
(pypdf / pdfplumber / python-docx), then chunks, embeds and stores — with
`max_tries=3` and a 600s timeout, plus a cron `cleanup_failed_ingestions`
for whatever still died. The interactive planner is not a queued job: it
runs in the API process under LangGraph with interrupts and a Postgres
checkpointer (`services/planner.py`, `services/checkpoints.py`).

Known gap: the admin eval-run endpoint enqueues `run_evals`, which no
worker function registers — those runs sit `pending` until the worker
grows the function. It has been that way since the first commit.

## Observability

**One line per request** (`request_log.py`, logfmt): `method`, `path`,
`status`, `duration_ms`, `request_id` — INFO for success, WARNING for 4xx,
ERROR for 5xx. The `--no-access-log` flag on both container commands is
what keeps it at exactly one.

**Two ingest routes** for what only a real browser can see:

- `POST /api/client-errors` — window errors, unhandled rejections and
  ErrorBoundary render failures, scrubbed (route and message patterns)
  and rate-limited, logged at ERROR with its own request id.
- `POST /api/vitals` — one field-value snapshot of paint timings per page,
  logged at INFO.

**On the client** (`src/lib/clientErrors.js`, `src/lib/vitals.js`): the
window listeners feed a queue that is capped, deduped and wrapped so
capture can never throw into the app it is watching. The vitals beacon
fires once after load + idle — no INP, because one post-load snapshot
cannot see an interaction's full latency and a fabricated field number
would be worse than an absent one.

**Consent is the gate:** telemetry fires only when localStorage
`studyspace.cookieConsent` says `accepted`. `undecided` holds batches
until `CookieBanner` dispatches the `studyspace:consent` event; `declined`
drops them. The banner's own Remember is what releases a held batch —
nothing else in the app sends telemetry.

## Frontend

`.jsx` files are plain JavaScript — no type syntax — under `src/`. Design
tokens are CSS custom properties; Tailwind v4's `@theme` reads them from
`styles/globals.css`, and components take tokens or lucide-react icons,
never raw values. Routes are lazy behind `Suspense`; server state lives in
TanStack Query; auth in supabase-js.

The build (Vite 8, rolldown) groups vendors into `advancedChunks` groups
so first load stays inside the e2e budget: **220 KiB JS, 20 KiB CSS**,
enforced against `vite preview` by `e2e/performance.e2e.js`. The CSP lives
in three files — `index.html` (the source of truth), `nginx.conf`,
`vercel.json` — and `tests/csp.test.js` fails the moment the copies
disagree, on hashes computed from the source, guarded in turn by a
build-stability test that keeps the build from rewriting inline script.

## Security invariants

- User data only through `user_conn()`; the service role only in the
  worker. This is the rule the RLS tests exist to defend.
- Bearer JWT, explicit CORS origins, security headers on every response,
  CSP on the frontend (one same-origin stylesheet, `font-display: swap`).
- Prompt-injection guard on retrieved content; markdown rendered through
  the sanitizer; rate limits per identity on chat, upload, studio, auth
  and both telemetry routes.
- Telemetry scrubbed server-side and consent-gated client-side; capture
  paths may never throw or block.
- Dependency audits on both sides: `pip-audit` for Python, and
  `npm audit --audit-level=high` over the **whole** frontend tree — dev
  dependencies included, because the build runs them too.

## What protects what

| Gate | Command | Protects |
|---|---|---|
| Frontend lint/unit/build | `npm run check` (in `frontend/`) | Components, routing, markdown safety, CSP copies, contrast pairs, telemetry caps |
| Frontend e2e | `npm run test:e2e` (in `frontend/`) | Real flows against `vite preview`, first-load budgets, response headers |
| Backend lint | `python -m ruff check .` (in `backend/`) | Style and bugbear rules (E, F, I, UP, B) |
| Backend tests | `python -m pytest -q` (in `backend/`) | API, services, the docs gate, the env registry — DB suites skip rather than fail without a database |
| Dockerfile lint | `docker build --check ./backend` (repo root) | Dockerfile mistakes before anyone pulls the image |

CI runs these on every push; the mechanics live in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Reading map

| Question | Document |
|---|---|
| What is this and how do I run it? | [README](README.md) |
| How does a request travel? | This file |
| How do I change the backend safely? | [backend/README](backend/README.md) |
| How do I run the gates before pushing? | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Which environment variables exist? | [.env.example](.env.example) |
| How is it deployed? | README's deployment section, plus `docker-compose.yml`, `vercel.json`, `backend/Dockerfile`, `worker/Dockerfile` |
