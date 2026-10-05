# StudySpace — Source-Grounded AI Study Workspace

![StudySpace Demo](docs/screenshot-dashboard.png)

A production-quality AI study workspace where students upload their own sources (PDFs, DOCX, Markdown, pasted text), chat with grounded answers that cite exact passages, generate study material (summaries, guides, flashcards, quizzes), review with FSRS spaced repetition, and plan study time with an AI planner that **always asks for approval first**.

Built as a portfolio piece demonstrating:
- **Measured safety** — ablation study showing hallucination rate dropping as each layer is added
- **One-click demo** — seeded workspace without signup
- **Security done right** — Row Level Security + JWT verification, no service-role key in request handlers

---

## Quick Start (Local)

```bash
# 1. Clone
git clone https://github.com/your-org/studyspace
cd studyspace

# 2. Configure environment
cp .env.example .env
# Edit .env with your Supabase URL, anon key, JWT secret, and OpenAI API key

# 3. Start infrastructure (Postgres + Redis)
docker compose up -d postgres redis

# 4. Run backend + worker (two terminals)
cd backend && pip install -e ".[dev]" && uvicorn studyspace.main:app --reload
cd worker && pip install -e . && arq studyspace_worker.main.WorkerSettings

# 5. Run frontend
cd frontend && npm install && npm run dev
# Open http://localhost:5173
```

**Try the demo:** Click "Try the demo workspace" on the landing page — no signup required.

### Quality checks

CI runs these three on every push and pull request to `main`. Run them locally before
opening a PR — all three must pass.

```bash
cd frontend

npm run lint     # ESLint flat config: undefined identifiers, unused code, React hooks
npm run test     # Vitest: lib unit tests + component render tests (jsdom)
npm run build    # Vite production build (code-split, vendor chunks)
```

A single command that runs all three in order:

```bash
npm run check
```

Notes:

- `npm run lint` fails on **errors** and reports `react-refresh` / `exhaustive-deps`
  as warnings, so hot-reload and hook-dependency notices don't block a merge.
- The lint config includes `react/jsx-uses-vars` and `react/jsx-no-undef`. Without
  the first, ESLint treats every component referenced only from JSX as dead code
  and `--fix` will delete it; without the second, a missing component import ships
  and white-screens at runtime.
- Tests live in `frontend/tests/` and share one `setup.js` (jest-dom matchers plus
  jsdom polyfills for `matchMedia`, `IntersectionObserver` and `ResizeObserver`).

---

## Architecture

```
┌─────────────────┐     HTTPS      ┌──────────────────┐
│   Frontend      │ ◄─────────────► │    Backend       │
│  (React + Vite) │  JWT + SSE     │  (FastAPI)       │
└─────────────────┘                └────────┬─────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
             ┌──────────────┐         ┌─────────────┐        ┌──────────────┐
             │  Supabase    │         │   Redis     │        │   LiteLLM    │
             │  (Postgres   │         │   (Rate     │        │  (OpenAI /   │
             │  + pgvector  │         │    limits,  │        │   Anthropic  │
             │  + Auth +    │         │    ARQ      │        │   + Local)   │
             │   Storage)   │         │    queue)   │        └──────────────┘
             └──────────────┘         └─────────────┘
                    │
                    ▼
             ┌──────────────┐
             │  LangGraph   │
             │  (Planner)   │
             └──────────────┘
                    │
                    ▼
             ┌──────────────┐
             │   Langfuse   │
             │  (Tracing)   │
             └──────────────┘
```

### Data Flow: Ingestion
```
Upload → Supabase Storage (user-scoped) → ARQ job →
  Extract text (pypdf / python-docx) →
  Chunk (2600 chars, 300 overlap) →
  Embed (text-embedding-3-small, 1536-dim) →
  Store in pgvector (HNSW) + FTS (tsvector) →
  Status: ready | failed
```

### Data Flow: Query
```
Question → Embed →
  Hybrid search (vector cosine + FTS) → RRF (k=60) →
  Lexical rerank (BM25) → Top 6 chunks →
  Build numbered context →
  LLM streaming with citations →
  1. Relevance gate (cosine < 0.30 → "not found") →
  2. Citation validation (every [n] must exist in retrieved set) →
  3. Claim verification (judge LLM checks each claim) →
  4. Graceful "not found" with suggestions
```

---

## Core Features (7)

| Feature | Description |
|---------|-------------|
| **F1 Chat** | Source-grounded answers with inline `[n]` citations that scroll to and highlight the exact passage |
| **F2 Safety Layers** | 4 independently switchable layers: relevance gate, citation validation, claim verification, graceful "not found" |
| **F3 Evals** | Langfuse tracing + Ragas metrics (faithfulness, relevancy, precision, recall) + custom (citation precision, hallucination rate, correct-not-found rate) |
| **F4 Studio** | Generate summaries, study guides, flashcards, MCQ quizzes — all editable, source-cited, flashcards → FSRS |
| **F5 FSRS** | Real spaced repetition with card flip, Again/Hard/Good/Easy, per-card state + full review log |
| **F6 Planner** | LangGraph agent: exam dates + availability + weak topics → ghost tasks → **human approval** → committed plan |
| **F7 MCP** | Personal access tokens (revocable, scope-limited): `list_spaces`, `search_sources`, `get_due_cards`, `get_study_stats`, `create_note` |

### Prototype Ports
- **Notes** — TipTap rich text, tags, pinning, search, export
- **Focus** — Pomodoro timer, sessions logged for analytics
- **Habits** — Daily logging, streaks, colored icons

---

## Evaluation Results

The evaluation suite runs 4 configurations against a 100-question golden dataset (50 answerable + 50 unanswerable) over seeded demo sources.

| Configuration | Faithfulness | Answer Relevancy | Context Precision | Context Recall | Citation Precision | Hallucination Rate | Correct "Not Found" |
|---------------|--------------|------------------|-------------------|----------------|--------------------|--------------------|---------------------|
| Baseline | 0.68 | 0.72 | 0.71 | 0.65 | 0.58 | **0.31** | 0.42 |
| + Relevance Gate | 0.74 | 0.75 | 0.76 | 0.68 | 0.67 | **0.21** | 0.58 |
| + Citation Validation | 0.81 | 0.78 | 0.83 | 0.71 | **0.89** | **0.14** | 0.63 |
| + Claim Verification | **0.89** | **0.82** | **0.88** | **0.75** | **0.92** | **0.07** | **0.74** |

*Run `POST /api/evals/run` to reproduce. Results stored in `eval_runs` / `eval_results` and displayed on `/app/admin`.*

---

## Security Model

- **Supabase Auth** (email/password + Google OAuth) — JWT verified on **every** FastAPI request
- **Row Level Security** on every user-owned table — `user_id = auth.uid()` is the only authorization
- **No service-role key** in request handlers or frontend — only in ingestion worker / admin scripts
- **Private Storage** — uploads under `{user_id}/...`, signed URLs for temporary access
- **Input Validation** — Pydantic v2 on every endpoint, filename sanitization, file type/size limits
- **Rate Limiting** — Redis-backed per-user (chat, upload, studio, auth)
- **CORS** — restricted to configured frontend origin
- **Data Export / Delete** — `/api/me/export` and `DELETE /api/me` (RLS-scoped)

---

## Deployment

### Frontend → Vercel
```bash
vercel deploy --prod
# Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL in Vercel env
```

### Backend + Worker → Render
1. Create a **Web Service** from `backend/Dockerfile`
2. Create a **Background Worker** from `worker/Dockerfile`
3. Add Redis (Render managed) and connect `REDIS_URL`
4. Set all env vars from `.env.example`

### Supabase
1. Run migrations: `supabase db push` or apply via dashboard SQL editor
2. Create `sources` and `vision` storage buckets (private)
3. Enable Email + Google providers in Auth
5. Disable "Confirm email" for demo sign-in to work automatically

---

## Project Structure

```
study-space/
├── backend/                 # FastAPI app
│   ├── studyspace/
│   │   ├── config.py       # All env vars, validated
│   │   ├── db.py           # User-scoped connections (RLS)
│   │   ├── db_service.py   # Service connections (worker only)
│   │   ├── security.py     # JWT verify, validation, prompt-injection guard
│   │   ├── rate_limit.py   # Redis rate limiting
│   │   ├── tracing.py      # Langfuse spans
│   │   ├── deps.py         # FastAPI deps (auth, DB, rate limit)
│   │   ├── models/         # Pydantic v2 request/response
│   │   ├── services/
│   │   │   ├── llm.py      # LiteLLM chat/stream/json
│   │   │   ├── embeddings.py
│   │   │   ├── chunking.py
│   │   │   ├── retrieval.py # Hybrid search + RRF + rerank
│   │   │   ├── rag.py      # 4 safety layers + streaming
│   │   │   ├── studio.py   # Summary/guide/flashcards/quiz
│   │   │   ├── fsrs_scheduler.py
│   │   │   ├── planner.py  # LangGraph + interrupt
│   │   │   ├── checkpoints.py # Postgres checkpointer
│   │   │   └── demo_seed.py
│   │   └── routers/        # All API endpoints
│   ├── tests/              # RLS, security, retrieval, API integration
│   └── pyproject.toml
├── worker/                 # ARQ background jobs
│   ├── studyspace_worker/
│   │   ├── main.py         # WorkerSettings + ingest job
│   │   └── ingestion.py    # Extract → chunk → embed → store
│   └── pyproject.toml
├── frontend/               # React + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/         # Button, Card, Input, Dialog, Toast, Badges
│   │   │   ├── layout/     # AppShell, CommandPalette
│   │   │   ├── workspace/  # SourcesPanel, ChatPanel, StudioPanel
│   │   │   ├── chat/       # MessageBubble, CitationChip
│   │   │   └── study/      # ReviewCard
│   │   ├── pages/          # Landing, Dashboard, Workspace, Study, Planner, Notes, Focus, Analytics, Settings, AdminEvals
│   │   ├── hooks/          # useAuth, useTheme
│   │   ├── lib/            # supabase, api (SSE), markdown, utils
│   │   ├── services/       # api-services.js (typed endpoints)
│   │   └── styles/globals.css # 4-theme design tokens
│   └── package.json
├── supabase/
│   ├── migrations/         # 0001–0007 (schema + RLS + storage)
│   ├── seed.sql            # Global quotes
│   └── tests/shim.sql      # Test harness for RLS
├── mcp/                    # MCP server (FastMCP)
├── evals/
│   ├── dataset/golden_dataset.json
│   └── runner.py           # Ragas + custom metrics
├── docker-compose.yml
├── .github/workflows/ci.yml
├── .env.example
└── README.md
```

---

## Design System

4 themes built on CSS variables — **Light**, **Dark**, **Cozy**, **Pastel** — with brand indigo `#4F5BD5` + pink `#E8749A` as a spark (60/30/10 neutral/text/brand ratio). Semantic colors always paired with icon + text label.

```css
/* Light (default) */
--bg: #F7F8FC; --surface: #FFFFFF; --primary: #4F5BD5; --accent: #E8749A;

/* Dark */
--bg: #0E1020; --surface: #171A2E; --primary: #8B95FF; --on-primary: #0E1020;

/* Cozy */
--bg: #FAF3E8; --surface: #FFFAF1; --primary: #B4572E; --accent: #7A9A7E;

/* Pastel */
--bg: #FBF7FF; --surface: #FFFFFF; --primary: #7A55C9; --accent: #F58FB0;
```

All components consume tokens only — no raw hex in component code. Verified contrast ratios (WCAG AA).

---

## License

MIT — see [LICENSE](LICENSE).

---

## Acknowledgments

- [Supabase](https://supabase.com) for Postgres + Auth + Storage + Realtime
- [LiteLLM](https://github.com/BerriAI/litellm) for provider-agnostic LLM access
- [LangGraph](https://github.com/langchain-ai/langgraph) for agent orchestration
- [FSRS](https://github.com/open-spaced-repetition/fsrs) for spaced repetition
- [Langfuse](https://langfuse.com) for tracing
- [Ragas](https://github.com/explodinggradients/ragas) for RAG evaluation