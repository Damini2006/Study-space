/**
 * Static illustration shown instead of the WebGL scene on mobile,
 * low-power hardware, unsupported GPUs and prefers-reduced-motion.
 * Carries the same information as the animated version, so nothing
 * is ever conveyed only through motion.
 */
export default function SceneFallback({ mode = "signin" }) {
  const tint =
    mode === "signup"
      ? "from-accent/25 to-surface"
      : mode === "forgot" || mode === "reset"
        ? "from-primary/25 to-surface"
        : "from-primary/20 via-surface to-accent/20";

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className={`absolute inset-0 bg-gradient-to-br ${tint} opacity-90`} />

      {/* floating feature chips */}
      <div className="absolute left-[6%] top-[16%] rounded-full border border-primary/45 bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/80 shadow-sm">
        Notes
      </div>
      <div className="absolute right-[8%] top-[26%] rounded-full border border-accent/60 bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/80 shadow-sm">
        Quiz
      </div>
      <div className="absolute bottom-[22%] left-[10%] rounded-full border border-primary/45 bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/80 shadow-sm">
        Planner
      </div>
      <div className="absolute bottom-[15%] right-[12%] rounded-full border border-accent/60 bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/80 shadow-sm">
        Focus
      </div>

      {/* the flashcard, centred in the panel */}
      <div className="absolute left-1/2 top-1/2 w-[76%] max-w-[420px] -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-3xl border border-primary/40 bg-surface p-5 shadow-[0_24px_60px_-30px_rgba(42,39,64,0.55)]">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground">
              Answer
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/70">
              cited
            </span>
          </div>
          <p className="mt-3 text-[15px] leading-snug text-foreground/90">
            Because no heat crosses the boundary, any work the gas does comes from its own
            internal energy.
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[11px] text-primary-foreground">
              [1] adiabatic &middot; p.14
            </span>
            <span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[11px] text-primary-foreground">
              [2] worked ex. 4
            </span>
          </div>
          <div className="mt-3.5 border-t border-foreground/15 pt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/70">
            2 of 2 claims cited
          </div>
        </div>
      </div>
    </div>
  );
}
