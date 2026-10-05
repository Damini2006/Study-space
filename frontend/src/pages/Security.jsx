
const CONTROLS = [
  ["Hide API keys", "Server credentials are injected through server-side environment variables only. The browser bundle is built without them and checked in CI for literal key patterns."],
  ["Row-Level Security", "Every user-owned table carries an RLS policy of auth.uid() = user_id. No query path can read or write across accounts, regardless of which client issues it."],
  ["IDOR testing", "Automated tests request each record id as a second, unrelated user and assert a 403/404. Object references are never trusted from the client payload."],
  ["SQL injection testing", "All statements are parameterised through the ORM or bound cursors. Fuzz inputs are replayed against every search and filter endpoint."],
  ["Repository secret scanning", "A pre-commit hook and CI job scan the Git history for tokens, connection strings and private keys. Rotated credentials are revoked, not merely removed."],
  ["Admin route protection", "Admin surfaces check a server-authorised role on every request. Client-side hiding is treated as decoration, never as access control."],
  ["User isolation validation", "Integration tests assert that a session scoped to user A returns zero rows for user B across spaces, notes, cards, files and analytics."],
  ["API rate limiting", "Sliding-window limits per identity and per IP, with stricter budgets on authentication, upload and AI inference routes."],
  ["Storage bucket security", "Private buckets, short-lived signed URLs, per-object ownership checks and path traversal rejection on every write."],
  ["Input validation", "Every request body, query parameter and path parameter is schema-validated with length, type and enum constraints before it reaches business logic."],
  ["Unauthenticated route blocking", "A middleware allow-list admits only the landing, legal, auth and health routes. Everything else is rejected before route resolution."],
  ["Log hygiene", "Tokens, cookies, passwords, e-mail bodies and document content are redacted at the logger level. Traces carry ids, not payloads."],
  ["Field tampering prevention", "Server-constructed objects ignore unknown fields; writable attributes are declared explicitly and totals, streaks and balances are recomputed server-side."],
  ["File upload restrictions", "MIME sniffing, magic-byte inspection, size caps, quarantine before parsing, and randomised object names. Active content is never served inline."],
  ["Server-side logic hardening", "Parsing runs with timeouts and memory ceilings, template and path inputs are allow-listed, and third-party shells are never assembled from user strings."],
  ["Minimised API responses", "Responses include only the fields a screen renders. Internal ids, provider references and column defaults are stripped at the serialiser."],
  ["Authentication sessions", "Short-lived access tokens, rotating refresh tokens with reuse detection, secure/httpOnly/same-site cookies and server-side revocation on sign-out."],
  ["Dependency vulnerability scanning", "Automated audit on every pull request for frontend and backend dependencies; high-severity findings block the merge."],
  ["Record-level access control tests", "Policy coverage tests enumerate each table and assert the expected allow/deny matrix for owner, stranger and anonymous roles."],
  ["Controlled attack testing", "A scheduled, authorised test cycle exercises the checklist above against staging and files findings with reproductions before release."],
];

const meta = {
  title: "Security \u2014 StudySpace",
  desc: "The security hardening controls protecting StudySpace: RLS, IDOR and injection testing, secret scanning, rate limiting and controlled attack testing.",
  ogTitle: "Security at StudySpace",
  ogDesc: "Twenty security hardening controls, published in full.",
};

export default function Security() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle size="sm" />
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Security</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-14 sm:px-6 sm:py-20">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="text-primary">00</span>
            <span className="h-px w-8 bg-border" />
            <span>Hardening checklist</span>
          </div>
          <h1 className="mt-6 text-3xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-4xl">
            {meta.title.replace(" \u2014 StudySpace", "")}, item by item
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{meta.desc}</p>
        </motion.div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {CONTROLS.map(([title, body], i) => (
            <motion.section
              key={title}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.35, delay: (i % 4) * 0.04 }}
              className="bg-background p-5"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded border border-primary/30 bg-primary/10">
                  <Check className="size-3 text-primary" />
                </span>
                <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
            </motion.section>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-border bg-card p-5 text-[13px] leading-relaxed text-muted-foreground">
          Found a vulnerability? Report it to{" "}
          <a href="mailto:neelamrishikadamini@gmail.com?subject=Security%20report" className="text-primary underline-offset-4 hover:underline">
            neelamrishikadamini@gmail.com
          </a>{" "}
          with reproduction steps. Reports are acknowledged within three working days and you will be credited
          once a fix ships.
        </div>

        <nav className="mt-10 flex flex-wrap gap-6 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy policy</Link>
          <Link to="/terms" className="transition-colors hover:text-foreground">Terms of service</Link>
          <Link to="/contact" className="transition-colors hover:text-foreground">Contact</Link>
        </nav>
      </main>

      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: meta.ogTitle,
          description: meta.ogDesc,
        }),
      }} />
    </div>
  );
}
