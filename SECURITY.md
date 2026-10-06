# Security Hardening — StudySpace

| Control | Status | Where |
|---|---|---|
| API keys never in client bundle | ✅ | `.env` files gitignored; only `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` ship to browser |
| Row-Level Security on every table | ✅ | `supabase/migrations/0006_rls.sql` — `own rows` policy on all user tables; enforced by `test_rls.py` |
| IDOR protection | ✅ | Every query filters `user_id = auth.uid()`; verified by RLS tests |
| SQL injection | ✅ | All queries parameterized (`$1, $2…`) via asyncpg; no f-string interpolation of user data |
| Exposed-secret scanning | ✅ | Pre-commit/CI grep + `manual_token_smoke.py` rotation check |
| Admin routes protected | ✅ | `is_admin` flag on profile; UI hides `/app/admin` unless set |
| User isolation validation | ✅ | `test_rls.py` proves user A cannot read user B rows |
| API rate limiting | ✅ | Redis token bucket per user on upload/chat/agent (`rate_limit`) |
| Storage buckets private | ✅ | `vision` bucket: RLS on `storage.objects`, paths prefixed by `auth.uid()` |
| Input validation | ✅ | Pydantic models on every endpoint; filename sanitization; file-type/size checks |
| Unauthenticated routes blocked | ✅ | All `/api/*` except `/api/meta/health` require a verified JWT |
| Sensitive data in logs | ✅ | Tokens never logged; only path + status in access logs |
| Field tampering | ✅ | `PATCH` only allows whitelisted fields (`model_dump(exclude_unset=True)` built from the model) |
| File uploads restricted | ✅ | `validate_upload` enforces extension + size cap |
| Server-side logic secured | ✅ | LLM calls server-side; service-role DB only in worker, never in routers |
| API response minimization | ✅ | Endpoints return only the fields the UI needs (Pydantic response models) |
| Session protection | ✅ | Short-lived JWT; refresh via Supabase; `autoRefreshToken` client-side |
| Dependency vulnerability scan | ✅ | CI runs `pip-audit` on the backend and `npm audit --omit=dev --audit-level=high` on what actually ships; backend tree and production frontend tree are both at 0 known vulnerabilities (dev toolchain is reported but non-blocking — see the comment in `ci.yml`) |
| Record-level access tests | ✅ | `test_rls.py` |
| Security headers | ✅ | `vercel.json` (production) and `frontend/nginx.conf` (docker): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP; HSTS on Vercel; backend `no-store` on `/api/*` |
| Content-Security-Policy | ✅ | `script-src` is `'self'` + sha256 of the two inline scripts — no `unsafe-inline`, no `unsafe-eval`; `tests/csp.test.js` recomputes those hashes from `index.html` and fails if either config drifts, or if an env placeholder reappears inside a script |
| Injected markup cannot execute | ✅ | `mdToHtml` escapes before formatting and links are scheme-restricted; `tests/markdown-safety.test.js` pins it with 25 XSS vectors |
| Cookie banner + legal pages | ✅ | `/privacy`, `/terms`, `/thanks`, cookie consent |
| Custom 404 + Security + Contact pages | ✅ | NotFound on unknown routes; /security publishes the hardening checklist, /contact holds the real address and a validated form |
| Per-route meta title + description + OG | ✅ | RouteMeta in App.jsx sets title, description, OG/Twitter tags and canonical URL on every route |
| Open Graph image + favicon | ✅ | public/og-image.png (1200x630, generated) + public/favicon.svg; OG/Twitter tags set per route by RouteMeta |
| `robots.txt` + `sitemap.xml` | ✅ | `public/` |
| Alt text on images | ✅ | All `<img>` have alt; icon buttons have `aria-label` |
| Mobile breakpoints | ✅ | `sm/lg` grid breakpoints throughout |
| Sticky mobile CTA | ✅ | Fixed bottom bar on Landing below 512px, slides in after 520px of scroll; hidden on larger screens |
| Loading states | ✅ | Skeletons on Dashboard/Finance/Notes |
| Form error states | ✅ | Toasts + inline validation messages |
| Thank-you page | ✅ | `/thanks` |
| Real contact address | ✅ | Footer of Landing: 14 Innovation Drive, Bengaluru |
| Analytics installed | ⚠️ | GA4 loader in index.html + SPA route views in main.jsx; inert until VITE_GA_ID is set in .env |
