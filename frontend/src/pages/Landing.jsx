import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  FileText,
  Fingerprint,
  Flame,
  GraduationCap,
  KeyRound,
  Lock,
  MessageSquare,
  Minus,
  Monitor,
  Plus,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Upload,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Content                                                            */
/* ------------------------------------------------------------------ */

const CAPABILITIES = [
  {
    icon: MessageSquare,
    kicker: "Retrieval",
    title: "Ask your own documents",
    body: "Hybrid search across vector, full-text and reciprocal-rank fusion. Answers arrive with inline citations that jump to the exact paragraph they came from.",
    meta: "PDF, Markdown, DOCX, plain notes",
  },
  {
    icon: ShieldCheck,
    kicker: "Grounding",
    title: "Four layers that refuse to guess",
    body: "Retrieval-only mode, a citation-coverage check, a claim-vs-source verifier and a refusal rule. If the corpus does not contain it, the model says so.",
    meta: "Refusal rate measured per space",
  },
  {
    icon: Brain,
    kicker: "Generation",
    title: "Study material from what you uploaded",
    body: "Flashcards, cloze deletions, practice questions and summaries. Every generated item keeps a backlink to the passage it was derived from.",
    meta: "Editable before you save",
  },
  {
    icon: CalendarCheck,
    kicker: "Scheduling",
    title: "Spaced repetition, not a fake progress bar",
    body: "Real spaced-repetition scheduling — the FSRS algorithm, which works out when each card is about to be forgotten — with per-card difficulty, retention targets and a due queue you can actually finish in a sitting.",
    meta: "Per-card difficulty tracking",
  },
  {
    icon: TimerReset,
    kicker: "Focus",
    title: "Timers that record, not perform",
    body: "Pomodoro sessions, ambient sound beds and habit check-ins feed one honest activity log. No streak theatre, just the minutes you put in.",
    meta: "Session history + subject split",
  },
  {
    icon: Sparkles,
    kicker: "Planning",
    title: "An assistant that asks first",
    body: "The planner drafts a schedule, shows the diff against your current week, and waits for approval before anything is written. Nothing is committed silently.",
    meta: "Approval required, always",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Drop in what you already have",
    body: "Lecture PDFs, lab reports, half-finished notes. StudySpace chunks them, embeds them and keeps the original page anchors so citations stay honest.",
    icon: Upload,
  },
  {
    n: "02",
    title: "Interrogate it",
    body: "Ask in plain language. Every sentence that leans on a source carries a marker you can click, which opens the passage inline instead of a blind link.",
    icon: ScanSearch,
  },
  {
    n: "03",
    title: "Let the schedule do the remembering",
    body: "Anything worth keeping becomes a card. Spaced repetition decides when you see it again, and the dashboard tells you when the queue is genuinely clear.",
    icon: Flame,
  },
];

const SECURITY = [
  { icon: KeyRound, t: "Keys never ship to the browser", d: "Server credentials live in server env only; the client bundle is scanned for literals." },
  { icon: Lock, t: "Row-Level Security everywhere", d: "Every table is scoped to auth.uid() — no query can cross a user boundary." },
  { icon: Fingerprint, t: "Session hardening", d: "Short-lived access tokens, rotating refresh, secure + httpOnly + same-site cookies." },
  { icon: ScanSearch, t: "IDOR and injection testing", d: "Record-level access tests plus parameterised queries and input validation on every route." },
  { icon: ShieldCheck, t: "Rate limiting and upload limits", d: "Per-identity and per-IP budgets, MIME sniffing, size caps and untrusted-file quarantine." },
  { icon: Monitor, t: "Least-privilege admin", d: "Admin routes gated server-side, responses minimised, logs stripped of tokens and payloads." },
];

const PLANS = [
  {
    name: "Student",
    price: "Free",
    period: "forever",
    note: "Everything you need to stop re-reading slides.",
    features: ["3 spaces", "Unlimited citations", "FSRS review queue", "Focus timer + habits", "Vision board & finance"],
    cta: "Start free demo",
    featured: false,
  },
  {
    name: "Cohort",
    price: "\u20B90",
    period: "during beta",
    note: "For study groups and departments running it together.",
    features: ["Unlimited spaces", "Shared reading lists", "Group analytics", "Priority retrieval", "Export & backup"],
    cta: "Request access",
    featured: true,
  },
];

const FAQS = [
  {
    q: "Does it invent answers when my notes do not cover a topic?",
    a: "No. Retrieval runs first and the model only writes from what came back. If citation coverage falls below the threshold you set, the request is refused and you are told which part was missing.",
  },
  {
    q: "Which file types can I upload?",
    a: "PDF, Markdown, DOCX and plain text, up to the upload size limit enforced before anything is stored. Images are stored separately and are never sent to the model unless you attach them to a message.",
  },
  {
    q: "Is my work visible to anyone else?",
    a: "No. Row-Level Security scopes every row to your account. Shared spaces are opt-in and only expose the documents you explicitly add to them.",
  },
  {
    q: "What happens to my data if I leave?",
    a: "Export from Settings as JSON — the whole account — or export a single space as Markdown, CSV, an Anki deck or a print-ready page from the workspace. Deleting your data in Settings removes every study row — spaces, notes, cards, embeddings — and every stored document, then reports the exact counts of what was removed. Your sign-in email stays: the app never holds the admin keys needed to erase it.",
  },
];

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

function Kicker({ index, children, className, rule = false }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 text-[15px] font-medium leading-none",
        className
      )}
    >
      <span className="font-semibold text-primary">{index}</span>
      <span aria-hidden="true" className="text-muted-foreground/60">
        &mdash;
      </span>
      <span className="text-foreground">{children}</span>
      {rule && (
        <motion.span
          aria-hidden
          className="h-px min-w-10 flex-1 origin-left bg-border"
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 0.9, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </div>
  );
}

/* Theme-aware bunny mark for header/footer use. */
function BunnyMark({ className }) {
  return (
    <svg
      viewBox="0 0 438 362"
      width={438}
      height={362}
      className={cn("h-8 w-auto shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <path id="heart" d="M0 8 C-16 -4 -9 -16 0 -7 C9 -16 16 -4 0 8Z" />
        <path id="spark" d="M0 -1 C0.12 -0.3 0.3 -0.12 1 0 C0.3 0.12 0.12 0.3 0 1 C-0.12 0.3 -0.3 0.12 -1 0 C-0.3 -0.12 -0.12 -0.3 0 -1Z" />
      </defs>
      <rect width="438" height="362" rx="56" fill="var(--surface)" />
      <g transform="translate(-4.3 16.72) scale(1.5 1.4)" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M128 205 C132 215 118 224 106 217 C94 209 98 194 112 190 C92 184 74 168 70 148 C66 126 76 106 96 96 C72 72 70 30 90 18 C108 8 126 26 132 56 C135 70 138 80 150 90 C162 80 165 70 168 56 C174 26 192 8 210 18 C230 30 228 72 204 96 C224 106 234 126 230 148 C226 168 208 184 188 190 C202 194 206 209 194 217 C182 224 168 215 172 205"
          fill="var(--surface)"
          stroke="var(--primary)"
          strokeWidth="9"
        />
        <ellipse cx="106" cy="58" rx="11" ry="24" transform="rotate(-12 106 58)" fill="var(--accent)" />
        <ellipse cx="194" cy="58" rx="11" ry="24" transform="rotate(12 194 58)" fill="var(--accent)" />
        <path d="M110 134 Q120 122 130 134" fill="none" stroke="var(--primary)" strokeWidth="5" />
        <path d="M170 134 Q180 122 190 134" fill="none" stroke="var(--primary)" strokeWidth="5" />
        <circle cx="98" cy="148" r="9" fill="var(--accent)" />
        <circle cx="202" cy="148" r="9" fill="var(--accent)" />
        <path
          d="M145 140 Q150 136 155 140 Q153 145 150 146 Q147 145 145 140Z"
          fill="var(--primary)"
          stroke="var(--primary)"
          strokeWidth="2"
        />
        <path
          d="M150 147 V150 M150 150 Q143 157 136 150 M150 150 Q157 157 164 150"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="4"
        />
        <use href="#heart" transform="translate(40 108) scale(1.5)" fill="var(--primary)" />
        <use href="#spark" transform="translate(258 112) scale(14)" fill="var(--primary)" />
      </g>
    </svg>
  );
}

/* Header lockup: the bunny mark cropped out of the full artwork (a full
   1200x700 lockup is unreadable at navbar size) + the live wordmark. */
function Brand({ className }) {
  return (
    <Link to="/" className={cn("group flex items-center gap-2.5", className)} aria-label="StudySpace home">
      <span className="drop-shadow-xs transition-transform duration-300 group-hover:-rotate-6">
        <BunnyMark />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">StudySpace</span>
    </Link>
  );
}

/* Footer shows the whole artwork: bunny + wordmark + tagline. */
function FooterLogo({ className }) {
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <svg
        viewBox="0 0 1200 700"
        width={1200}
        height={700}
        className="h-20 w-auto drop-shadow-xs sm:h-24"
        role="img"
        aria-label="StudySpace — where studying finally clicks"
      >
        <defs>
          <path id="heart" d="M0 8 C-16 -4 -9 -16 0 -7 C9 -16 16 -4 0 8Z" />
          <path id="spark" d="M0 -1 C0.12 -0.3 0.3 -0.12 1 0 C0.3 0.12 0.12 0.3 0 1 C-0.12 0.3 -0.3 0.12 -1 0 C-0.3 -0.12 -0.12 -0.3 0 -1Z" />
        </defs>
        <rect width="1200" height="700" rx="48" fill="var(--surface)" />
        <g transform="translate(375 10) scale(1.5 1.4)" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M128 205 C132 215 118 224 106 217 C94 209 98 194 112 190 C92 184 74 168 70 148 C66 126 76 106 96 96 C72 72 70 30 90 18 C108 8 126 26 132 56 C135 70 138 80 150 90 C162 80 165 70 168 56 C174 26 192 8 210 18 C230 30 228 72 204 96 C224 106 234 126 230 148 C226 168 208 184 188 190 C202 194 206 209 194 217 C182 224 168 215 172 205"
            fill="var(--surface)"
            stroke="var(--primary)"
            strokeWidth="9"
          />
          <ellipse cx="106" cy="58" rx="11" ry="24" transform="rotate(-12 106 58)" fill="var(--accent)" />
          <ellipse cx="194" cy="58" rx="11" ry="24" transform="rotate(12 194 58)" fill="var(--accent)" />
          <path d="M110 134 Q120 122 130 134" fill="none" stroke="var(--primary)" strokeWidth="5" />
          <path d="M170 134 Q180 122 190 134" fill="none" stroke="var(--primary)" strokeWidth="5" />
          <circle cx="98" cy="148" r="9" fill="var(--accent)" />
          <circle cx="202" cy="148" r="9" fill="var(--accent)" />
          <path
            d="M145 140 Q150 136 155 140 Q153 145 150 146 Q147 145 145 140Z"
            fill="var(--primary)"
            stroke="var(--primary)"
            strokeWidth="2"
          />
          <path
            d="M150 147 V150 M150 150 Q143 157 136 150 M150 150 Q157 157 164 150"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="4"
          />
          <use href="#heart" transform="translate(40 108) scale(1.5)" fill="var(--primary)" />
          <use href="#spark" transform="translate(258 112) scale(14)" fill="var(--primary)" />
        </g>
        <text
          x="600"
          y="590"
          textAnchor="middle"
          fontFamily="Nunito, Quicksand, 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif"
          fontWeight="700"
          fontSize="30"
          letterSpacing="5"
          fill="var(--primary)"
          opacity="0.8"
        >
          where studying finally clicks
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero product window                                                */
/* ------------------------------------------------------------------ */

function ProductWindow() {
  const ref = useRef(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), { stiffness: 120, damping: 18 });

  const onMove = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => { mx.set(0); my.set(0); }}
      style={{ perspective: 1400 }}
      className="relative flex h-full flex-col"
    >
      <motion.div
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card shadow-[0_28px_70px_-30px_rgba(15,23,42,0.45)]"
      >
        {/* chrome */}
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
          <span className="flex gap-1.5">
            <span className="size-2 rounded-full bg-[#ff5f57]" />
            <span className="size-2 rounded-full bg-[#febc2e]" />
            <span className="size-2 rounded-full bg-[#28c840]" />
          </span>
          <span className="ml-2 truncate font-mono text-[10px] text-muted-foreground">
            thermodynamics-lecture-04.pdf
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            grounded
          </span>
        </div>

        {/* conversation */}
        <div className="flex flex-1 flex-col justify-center gap-3.5 px-4 py-4 sm:px-5">
          <div className="flex items-end justify-end gap-2.5">
            <p className="max-w-[82%] rounded-2xl rounded-br-md bg-primary/12 px-3.5 py-2.5 text-[clamp(13px,0.78rem+0.2vw,15px)] leading-snug text-foreground">
              Why does entropy increase in an adiabatic expansion?
            </p>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-primary/10 text-primary">
              <GraduationCap className="size-4" />
            </span>
          </div>

          <div className="rounded-2xl rounded-tl-md border border-border bg-background px-3.5 py-3">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                <Sparkles className="size-3.5" />
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">StudySpace</span>
            </div>
            <p className="text-[clamp(13px,0.78rem+0.2vw,15px)] leading-relaxed text-foreground/90">
              Because no heat crosses the boundary, any work the gas does comes from its own internal
              energy. For an ideal gas that drops the temperature, and the number of accessible
              microstates falls while the entropy of the surroundings stays fixed.
              <span className="mx-0.5 inline-flex translate-y-[1px] items-center rounded-md border border-primary/35 bg-primary/12 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-primary">
                1
              </span>
              <span className="ml-0.5 inline-flex translate-y-[1px] items-center rounded-md border border-primary/35 bg-primary/12 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-primary">
                2
              </span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5 text-[11px]">
              <span className="flex items-center gap-1 font-medium" style={{ color: "var(--success)" }}>
                <CircleCheck className="size-3.5" /> Coverage 100%
              </span>
              <span className="h-3 w-px bg-border" />
              <span className="font-medium text-muted-foreground">p.14 &middot; p.21</span>
            </div>
          </div>

          {/* source strip */}
          <div className="grid grid-cols-2 gap-3">
            {[["Passage 1", "p.14 \u00B7 \u00A73.2", 88], ["Passage 2", "p.21 \u00B7 worked ex.", 64]].map(([t, s, w], i) => (
              <div key={t} className="rounded-xl border border-border bg-background px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-foreground/85">{t}</span>
                  <FileText className="size-3.5 text-primary/70" />
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${w}%` }}
                    transition={{ duration: 0.9, delay: 0.7 + i * 0.15, ease: "easeOut" }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* sample tiles below the window — in flow, never clipped */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        {[
          { label: "Cards due today", value: "42", unit: "cards", delay: 0.75, bar: 68 },
          { label: "Focus time today", value: "2h 10m", unit: "3 sessions", delay: 0.9, bar: 54 },
        ].map((s) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: s.delay, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-xl border border-border bg-card px-3.5 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[12px] font-medium text-foreground/85">{s.label}</p>
              <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                Sample
              </span>
            </div>
            <p className="mt-1.5 text-xl font-semibold leading-none tracking-tight">
              {s.value}
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{s.unit}</span>
            </p>
            <div className="mt-2.5 h-1.5 rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${s.bar}%` }}
                transition={{ delay: s.delay + 0.2, duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[32px] bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -inset-5 -z-10 rounded-[32px] bg-accent/15 blur-3xl"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ                                                                */
/* ------------------------------------------------------------------ */

function FaqRow({ item, open, onToggle }) {
  return (
    <div className={cn("faq-item border-b border-border", open && "is-open")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-start justify-between gap-6 py-5 text-left transition-colors hover:text-primary"
      >
        <span className="text-[15px] font-medium leading-snug">{item.q}</span>
        <span className="mt-0.5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:text-primary">
          {open ? <Minus className="size-4" /> : <Plus className="size-4" />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="max-w-2xl pb-5 pr-10 text-sm leading-relaxed text-muted-foreground">
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Landing() {
  const { startDemo } = useAuth();
  const { error } = useToast();
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [mobileCta, setMobileCta] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("capabilities");

  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 64]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  /* whole-document progress, for the hairline under the header */
  const { scrollYProgress: pageProgress } = useScroll();

  /* Pointer light over the hero grid. Written straight to the node as CSS
     custom properties, so it never waits on a frame to catch the cursor. */
  const fieldRef = useRef(null);
  const onHeroMove = (e) => {
    const el = fieldRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--hx", `${e.clientX - r.left}px`);
    el.style.setProperty("--hy", `${e.clientY - r.top}px`);
  };

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      setMobileCta(window.scrollY > 520);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Active nav link: whichever section the reader is actually in. */
  useEffect(() => {
    const ids = ["capabilities", "how", "security", "faq"];
    const nodes = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!nodes.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 }
    );
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, []);

  const launchDemo = async () => {
    setLaunching(true);
    try {
      await startDemo({ reset: false });
      navigate("/app/dashboard");
    } catch (err) {
      error(err.message);
      setLaunching(false);
    }
  };

  const goto = (id) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/15">
      {/* ================= HEADER ================= */}
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled
            ? "border-b border-border bg-background/85 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.7)] backdrop-blur-xl"
            : "border-b border-transparent"
        )}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-5 sm:px-6">
          <Brand />

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {[
              ["Capabilities", "capabilities"],
              ["How it works", "how"],
              ["Security", "security"],
              ["FAQ", "faq"],
            ].map(([label, id]) => {
              const isActive = activeSection === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => goto(id)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[13px] transition-colors",
                    isActive
                      ? "bg-primary/12 font-medium text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle size="sm" className="hidden sm:inline-flex" />
            <Link to="/auth" className="hidden sm:block">
              <Button variant="ghost" size="sm" className="text-[13px]">
                Sign in
              </Button>
            </Link>
            <Button size="sm" onClick={launchDemo} disabled={launching} className="text-[13px]">
              {launching ? "Preparing\u2026" : "Open demo"}
              {!launching && <ArrowUpRight className="size-3.5" />}
            </Button>
            <button
              type="button"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="ml-1 flex size-8 items-center justify-center rounded-md border border-border md:hidden"
            >
              <span className="relative block h-3 w-4">
                <span className={cn("absolute left-0 h-px w-4 bg-foreground transition-all", menuOpen ? "top-1.5 rotate-45" : "top-0")} />
                <span className={cn("absolute left-0 top-1.5 h-px w-4 bg-foreground transition-opacity", menuOpen && "opacity-0")} />
                <span className={cn("absolute left-0 h-px w-4 bg-foreground transition-all", menuOpen ? "top-1.5 -rotate-45" : "top-3")} />
              </span>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-border bg-background/95 backdrop-blur-xl md:hidden"
              aria-label="Mobile"
            >
              <div className="mx-auto max-w-[1400px] px-5 py-3">
                {[["Capabilities", "capabilities"], ["How it works", "how"], ["Security", "security"], ["FAQ", "faq"]].map(
                  ([label, id]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => goto(id)}
                      aria-current={activeSection === id ? "true" : undefined}
                      className={cn(
                        "block w-full border-b border-border/60 py-3 text-left text-sm transition-colors",
                        activeSection === id
                          ? "font-medium text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      {label}
                    </button>
                  )
                )}
                <Link to="/auth" className="block py-3 text-sm text-primary" onClick={() => setMenuOpen(false)}>
                  Sign in
                </Link>
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-muted-foreground">Appearance</span>
                  <ThemeToggle />
                </div>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      {/* reading progress — a 2px rule riding the very top edge of the window */}
      <motion.div
        aria-hidden
        style={{ scaleX: pageProgress }}
        className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-primary to-accent"
      />

      {/* ================= HERO ================= */}
      <section
        ref={heroRef}
        onMouseMove={onHeroMove}
        className="lp-hero relative flex min-h-[100svh] flex-col overflow-hidden pt-14"
      >
        {/* soft field */}
        <div aria-hidden ref={fieldRef} className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(79,91,213,0.10),transparent_70%)]" />
          <span className="hero-blob hero-blob-a" />
          <span className="hero-blob hero-blob-b" />
          <div className="absolute inset-0 hero-grid [mask-image:radial-gradient(85%_65%_at_50%_38%,#000,transparent)]" />
          <div className="hero-spot" />
        </div>

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-5 py-4 sm:px-6 lg:py-5"
        >
          <div className="grid gap-8 md:my-auto md:grid-cols-12 md:items-stretch md:gap-8 lg:gap-12">
          {/* ---- left ---- */}
          <div className="flex flex-col md:col-span-6 lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Kicker index="01">Source-grounded study workspace</Kicker>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 text-[clamp(2.15rem,1.05rem+2.7vw,3.9rem)] font-semibold leading-[1.05] tracking-[-0.03em]"
            >
              Every claim
              <span className="relative ml-3 inline-block">
                <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  traceable
                </span>
                <motion.span
                  aria-hidden
                  className="absolute -bottom-1.5 left-0 right-0 h-[3px] origin-left rounded-full bg-gradient-to-r from-primary to-accent"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.5, duration: 0.7, ease: "easeOut" }}
                />
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.14 }}
              className="mt-6 max-w-xl text-[clamp(0.95rem,0.88rem+0.24vw,1.1rem)] leading-relaxed text-muted-foreground"
            >
              StudySpace reads the material you upload and answers strictly from it. Every sentence
              that leans on a source opens the passage it came from. Nothing is asserted without a
              page number behind it.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Button size="lg" onClick={launchDemo} disabled={launching} className="h-11 px-5 text-sm">
                <GraduationCap className="size-4" />
                {launching ? "Preparing your workspace\u2026" : "Try the demo workspace"}
              </Button>
              <Link to="/auth">
                <Button variant="outline" size="lg" className="h-11 px-5 text-sm">
                  Create an account
                  <ChevronRight className="size-4" />
                </Button>
              </Link>
            </motion.div>

            {/* trust row */}
            <motion.dl
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="mt-8 grid w-full grid-cols-3 divide-x divide-border border-y border-border md:mt-auto"
            >
              {[
                ["4", "grounding layers"],
                ["Spaced repetition", "scheduling"],
                ["Free", "during beta"],
              ].map(([v, l]) => (
                <div key={l} className="px-4 py-3.5 first:pl-0">
                  <dt className="text-[13px] leading-tight text-muted-foreground">{l}</dt>
                  <dd className="mt-1 text-[clamp(1rem,0.85rem+0.5vw,1.35rem)] font-semibold leading-tight tracking-tight">
                    {v}
                  </dd>
                </div>
              ))}
            </motion.dl>
          </div>

          {/* ---- right ---- */}
          <div className="flex flex-col md:col-span-6 lg:col-span-5">
            <ProductWindow />
          </div>
          </div>

          {/* scroll cue — sits just above the feature strip */}
          <a
            href="#capabilities"
            onClick={(e) => {
              e.preventDefault();
              goto("capabilities");
            }}
            className="mx-auto mt-4 hidden shrink-0 items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary lg:flex"
          >
            Scroll to explore
            <ChevronDown className="size-4" />
          </a>
        </motion.div>

        {/* feature strip — pinned to the very bottom of the first screen */}
        <div className="marquee-fade shrink-0 overflow-hidden border-y border-border bg-card/60 py-3.5">
          <div className="marquee-track flex w-max">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex shrink-0" aria-hidden={dup === 1}>
                {[
                  "Inline citations",
                  "Spaced repetition",
                  "Stops when a source is missing",
                  "Focus timer and habits",
                  "Vision board",
                  "Budget tracking",
                  "Asks before it plans",
                  "Private by default",
                  "Take your data with you",
                ].map((t) => (
                  <span
                    key={t}
                    className="lp-tick flex shrink-0 items-center gap-5 whitespace-nowrap pr-5 text-[17px] font-medium text-foreground/85"
                  >
                    {t}
                    <span className="size-1.5 rounded-full bg-primary/70" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CAPABILITIES ================= */}
      <section id="capabilities" className="mx-auto max-w-[1400px] scroll-mt-20 px-5 pb-20 pt-24 sm:px-6 sm:pb-24 sm:pt-28">
        {/* one continuous rule: the label starts it and it runs to the right edge */}
        <Kicker index="02" rule>
          Capabilities
        </Kicker>

        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            {/* the argument holds still while the six items scroll past it */}
            <div className="lg:sticky lg:top-24">
              <h2 className="text-[clamp(1.7rem,1.15rem+1.6vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.02em]">
                Six things it does,
                <br />
                done properly.
              </h2>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                No feature exists to fill a grid. Each one solves a step in the loop between reading
                something and still knowing it a month later.
              </p>
              <Link
                to="/auth"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                See it on your own files
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div>
              {CAPABILITIES.map(({ icon: Icon, kicker, title, body, meta }, i) => (
                <motion.article
                  key={title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.55, delay: (i % 3) * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="lp-row group grid gap-3 border-b border-border py-6 sm:grid-cols-[auto_1fr] sm:gap-6"
                >
                  <div className="flex items-start gap-4 sm:w-40 sm:flex-col">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary transition-all duration-300 group-hover:border-primary/40 group-hover:bg-primary/10">
                      <Icon className="size-4" />
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:pt-2.5">
                      {kicker}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold tracking-tight transition-colors group-hover:text-primary">
                      {title}
                    </h3>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">{body}</p>
                    <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                      {meta}
                    </p>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how" className="relative scroll-mt-20 border-y border-border bg-card/50">
        {/* the band is lit, not merely grey — wash sits behind the container */}
        <div aria-hidden className="lp-wash" style={{ "--wash-x": "24%" }} />
        <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <Kicker index="03">The loop</Kicker>
            <h2 className="mt-5 text-3xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-4xl">
              Upload, interrogate, retain.
            </h2>
          </div>

          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            {STEPS.map(({ n, title, body, icon: Icon }, i) => (
              <motion.li
                key={n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="lp-cell group isolate bg-background p-6"
              >
                {/* the step number again, big and bleeding off the corner, so the
                    three cells read as a sequence rather than three boxes */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-4 right-3 -z-10 text-[86px] font-bold leading-none tracking-[-0.06em] text-primary/15 transition-transform duration-500 ease-out group-hover:-translate-y-1.5"
                >
                  {n}
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-primary">{n}</span>
                  <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
                <h3 className="mt-5 text-[15px] font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* ================= SECURITY ================= */}
      <section id="security" className="mx-auto max-w-[1400px] scroll-mt-20 px-5 py-20 sm:px-6 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <Kicker index="04">Hardening</Kicker>
              <h2 className="mt-5 text-3xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-4xl">
                Built to be audited,
                <br />
                not just demoed.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                Study material is personal. The stack is hardened end to end and the full checklist is
                published rather than implied.
              </p>
              <Link
                to="/security"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                Read the security checklist
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:col-span-7">
            {SECURITY.map(({ icon: Icon, t, d }, i) => (
              <motion.div
                key={t}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.05 }}
                className="lp-cell group bg-background p-5"
              >
                <Icon className="size-4 text-primary" />
                <h3 className="mt-3 text-[13px] font-semibold leading-snug">{t}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= TESTIMONIALS ================= */}
      <section className="relative border-y border-border bg-card/50">
        <div aria-hidden className="lp-wash lp-wash-accent" style={{ "--wash-x": "76%" }} />
        <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-6 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Kicker index="05">In use</Kicker>
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                What changed for them
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Early users are students who stopped re-reading and started verifying.
            </p>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
            {[
              {
                q: "I stopped keeping two sets of notes. If I cannot find the passage, the answer does not count, and the citation takes me straight there.",
                n: "Priya S.",
                r: "MBBS, second year",
                s: "Bengaluru",
              },
              {
                q: "The due queue is honest. On a bad week it shrinks instead of lying to me, and my retention curve finally went up instead of flat.",
                n: "James K.",
                r: "Computer science",
                s: "Pune",
              },
              {
                q: "The planner showed me a proposed week and waited. That single behaviour is why I trusted it with the rest of my term.",
                n: "Aisha M.",
                r: "Law, final year",
                s: "Hyderabad",
              },
            ].map((t, i) => (
              <motion.figure
                key={t.n}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="lp-cell flex flex-col justify-between bg-background p-6"
              >
                <blockquote className="text-sm leading-relaxed text-foreground/90">
                  <span className="mr-0.5 font-serif text-primary">&ldquo;</span>
                  {t.q}
                  <span className="font-serif text-primary">&rdquo;</span>
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-4">
                  <span className="flex size-8 items-center justify-center rounded-md border border-border bg-card font-mono text-[11px] text-primary">
                    {t.n[0]}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[13px] font-semibold">{t.n}</span>
                    <span className="block text-[11px] text-muted-foreground">{t.r} · {t.s}</span>
                  </span>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* ================= PRICING ================= */}
      <section id="pricing" className="mx-auto max-w-[1400px] scroll-mt-20 px-5 py-20 sm:px-6 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Kicker index="06">Pricing</Kicker>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              Free while it is useful
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            No card, no trial countdown. The beta is free because we are still measuring how well it
            works.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {PLANS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "lp-card flex flex-col rounded-xl border p-6",
                p.featured
                  ? "plan-featured border-primary/45 bg-card shadow-[0_24px_60px_-32px_rgba(79,91,213,0.85)]"
                  : "border-border bg-background"
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {p.name}
                </h3>
                {p.featured && (
                  <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                    Beta
                  </span>
                )}
              </div>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
                <span className="text-xs text-muted-foreground">{p.period}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{p.note}</p>

              <ul className="mt-6 flex-1 space-y-2.5 border-t border-border pt-5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px]">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {p.featured ? (
                  <Link to="/auth" className="block">
                    <Button className="w-full" variant="outline">
                      {p.cta}
                    </Button>
                  </Link>
                ) : (
                  <Button className="w-full" onClick={launchDemo} disabled={launching}>
                    {p.cta}
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" className="scroll-mt-20 border-y border-border bg-card/50">
        <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-6 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-24">
                <Kicker index="07">Questions</Kicker>
                <h2 className="mt-5 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                  Straight answers
                </h2>
                <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  Anything not covered here is in the privacy policy or the security checklist.
                </p>
              </div>
            </div>
            <div className="lg:col-span-8">
              <div className="border-t border-border">
                {FAQS.map((item, i) => (
                  <FaqRow
                    key={item.q}
                    item={item}
                    open={openFaq === i}
                    onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="mx-auto max-w-[1400px] px-5 py-20 sm:px-6 sm:py-24">
        <div className="cta-panel relative overflow-hidden rounded-2xl border border-border px-6 py-14 text-center sm:px-12">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 left-1/4 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
            <div className="absolute -bottom-24 right-1/4 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(60%_60%_at_50%_50%,#000,transparent)]" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
            className="relative"
          >
            <Kicker index="08" className="cta-muted justify-center">
              Start
            </Kicker>
            <h2 className="mx-auto mt-5 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-4xl">
              Open a workspace and upload one file
            </h2>
            <p className="cta-muted mx-auto mt-4 max-w-md text-sm leading-relaxed">
              The demo preloads a reading set so you can see citations working before you trust it
              with your own material.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={launchDemo}
                disabled={launching}
                className="h-11 px-6 text-sm"
              >
                {launching ? "Preparing\u2026" : "Try the demo workspace"}
                <ArrowRight className="size-4" />
              </Button>
              <Link to="/auth">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 border-current bg-transparent px-6 text-sm opacity-80 hover:border-primary hover:bg-primary hover:text-on-primary hover:opacity-100"
                >
                  Create an account
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="relative">
        {/* the rule fades out at both ends instead of stopping dead */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/55 to-transparent"
        />
        <div className="mx-auto max-w-[1400px] px-5 py-12 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <FooterLogo />
              <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                A source-grounded study workspace. Answers you can check, a schedule that respects
                your week.
              </p>
            </div>

            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Product</h3>
              <ul className="mt-4 space-y-2.5 text-[13px]">
                {[["Capabilities", "capabilities"], ["How it works", "how"], ["FAQ", "faq"]].map(([l, id]) => (
                  <li key={id}>
                    <button type="button" onClick={() => goto(id)} className="text-muted-foreground transition-colors hover:text-foreground">
                      {l}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Legal</h3>
              <ul className="mt-4 space-y-2.5 text-[13px]">
                <li><Link to="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">Privacy policy</Link></li>
                <li><Link to="/terms" className="text-muted-foreground transition-colors hover:text-foreground">Terms of service</Link></li>
                <li><Link to="/security" className="text-muted-foreground transition-colors hover:text-foreground">Security</Link></li>
                <li><Link to="/contact" className="text-muted-foreground transition-colors hover:text-foreground">Contact</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Contact</h3>
              <address className="mt-4 not-italic text-[13px] leading-relaxed text-muted-foreground">
                StudySpace<br />
                14 Innovation Drive<br />
                Bengaluru 560103, India
              </address>
              <a
                href="mailto:neelamrishikadamini@gmail.com"
                className="mt-3 inline-block break-all text-[13px] text-primary transition-colors hover:text-primary/80"
              >
                neelamrishikadamini@gmail.com
              </a>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] text-muted-foreground">&copy; 2026 StudySpace. All rights reserved.</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              Made in India · Built for people who cite their sources
            </p>
          </div>
        </div>
      </footer>

      {/* ================= STICKY MOBILE CTA ================= */}
      <AnimatePresence>
        {mobileCta && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-xl sm:hidden"
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight">Free during beta</p>
                <p className="truncate text-[11px] text-muted-foreground">No card required</p>
              </div>
              <Button size="sm" onClick={launchDemo} disabled={launching} className="h-9 shrink-0 px-4 text-[13px]">
                {launching ? "Preparing\u2026" : "Try demo"}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
