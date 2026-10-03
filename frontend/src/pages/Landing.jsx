import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  FileText,
  GraduationCap,
  Layers,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Chat with your sources",
    body: "Hybrid retrieval (vector + full-text + RRF) over your own PDFs and notes, with inline citations that jump straight to the exact passage.",
    tint: "#4f5bd5",
  },
  {
    icon: ShieldCheck,
    title: "Honest answers, always",
    body: "Four switchable safety layers — relevance gate, citation validation, claim verification, and graceful “I couldn’t find this” responses.",
    tint: "#2fb5a0",
  },
  {
    icon: Sparkles,
    title: "Studio material",
    body: "Generate source-grounded summaries, study guides, flashcards and MCQ quizzes. Everything is editable, and flashcards flow straight into review.",
    tint: "#e8749a",
  },
  {
    icon: Layers,
    title: "FSRS spaced repetition",
    body: "Real FSRS scheduling — Again/Hard/Good/Easy reviews with per-card state and full history. Due today, always visible.",
    tint: "#8b6fd6",
  },
  {
    icon: CalendarCheck,
    title: "AI planner with approval",
    body: "LangGraph drafts your plan around exam dates and weak topics — but nothing is committed until you approve the ghost tasks.",
    tint: "#f2b14a",
  },
  {
    icon: Timer,
    title: "Focus, habits & notes",
    body: "Pomodoro focus sessions, a habit tracker and rich-text notes — calm, and backed by Supabase with Row Level Security.",
    tint: "#5aa9e6",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Upload your sources",
    body: "Drop PDFs, DOCX, TXT or Markdown — or paste notes straight in. We extract, chunk, embed and index them.",
  },
  {
    n: "2",
    title: "Ask, and get cited answers",
    body: "Hybrid retrieval finds the right passages; the answer streams with [n] citations and a verification badge.",
  },
  {
    n: "3",
    title: "Turn answers into a system",
    body: "Generate study material, review with FSRS, and let the planner propose — never commit — your schedule.",
  },
];

const PILLARS = [
  { icon: MessageSquare, label: "Ask", desc: "Ask anything, get a cited answer." },
  { icon: BookOpen, label: "Learn", desc: "Flashcards + FSRS review loops." },
  { icon: CalendarCheck, label: "Plan", desc: "AI plans that ask permission first." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

export default function Landing() {
  const { startDemo } = useAuth();
  const { error } = useToast();
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const launchDemo = async (reset = false) => {
    setLaunching(true);
    try {
      await startDemo({ reset });
      navigate("/app/dashboard");
    } catch (err) {
      error(err.message);
      setLaunching(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      {/* ---- sticky nav with scroll border ---- */}
      <header
        className={`sticky top-0 z-30 backdrop-blur-xl transition-all duration-300 ${
          scrolled
            ? "border-b border-border bg-background/80 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
            : "border-b border-transparent bg-background/40"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="brand-gradient flex size-8 items-center justify-center rounded-xl text-xs font-extrabold text-white shadow-md">
              SS
            </span>
            <span className="text-base font-bold tracking-tight">StudySpace</span>
          </Link>
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <Link
              to="/auth"
              className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Button variant="gradient" size="sm" onClick={() => launchDemo(false)} disabled={launching}>
              {launching ? "Opening…" : "Try the demo"}
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* ================= HERO ================= */}
        <section className="relative">
          {/* ambient gradient orbs */}
          <div className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/25 via-accent/15 to-transparent blur-3xl" />
          <div className="pointer-events-none absolute right-[10%] top-56 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          {/* 3D orbit orbs (inspired by indoor-tech landing) */}
          <div className="orbit-orb orbit-orb-2 pointer-events-none absolute -inset-0 rounded-full opacity-55 animate-orbit" />
          <div className="orbit-orb pointer-events-none absolute inset-0 rounded-full opacity-40 animate-drift" />

          <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm"
            >
              <Sparkles className="size-3.5 text-accent" />
              Source-grounded AI study workspace
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mt-6 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl"
            >
              Study from{" "}
              <span className="brand-text">your own notes</span>,
              <br className="hidden sm:block" /> verified against every source.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg"
            >
              Upload a document, ask a question, get an answer that cites the exact passage. Generate
              study material, review with spaced repetition, and plan with an AI that asks permission
              first.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Button variant="gradient" size="lg" onClick={() => launchDemo(false)} disabled={launching}>
                <GraduationCap className="size-4" />
                {launching ? "Preparing demo…" : "Try the demo workspace"}
              </Button>
              <Link to="/auth">
                <Button variant="outline" size="lg">
                  Sign in <ChevronRight className="size-4" />
                </Button>
              </Link>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-4 text-xs text-muted-foreground"
            >
              One click, no signup — a seeded demo with sources, cards, notes and a plan.
            </motion.p>

            {/* three pillars */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="mt-12 grid grid-cols-3 gap-3 text-left"
            >
              {PILLARS.map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-border bg-surface/70 p-4 backdrop-blur transition-transform hover:-translate-y-1"
                >
                  <Icon className="size-5 text-primary" />
                  <p className="mt-2 text-sm font-semibold">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ================= CHAT PREVIEW ================= */}
        <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card className="relative p-5 shadow-[var(--shadow-lg)]">
              <div className="absolute -top-3 left-6 flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                <span className="size-1.5 rounded-full bg-success" />
                Live preview
              </div>
              <div className="mb-4 flex items-center justify-between border-b border-border pb-3 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-destructive/60" />
                  <span className="size-2.5 rounded-full bg-warning/60" />
                  <span className="size-2.5 rounded-full bg-success/60" />
                </div>
                <span className="text-xs text-muted-foreground">Botany 201 · Chat</span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-on-primary">
                  Where do the light-independent reactions of photosynthesis occur?
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface-2 px-3.5 py-2.5">
                  They occur in the <strong>stroma</strong> of the chloroplast, during the Calvin cycle
                  <button className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-citation px-1 align-middle font-mono text-[10px] font-bold text-citation-foreground">1</button>.
                  ATP and NADPH from the light reactions are used to fix CO₂
                  <button className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-citation px-1 align-middle font-mono text-[10px] font-bold text-citation-foreground">2</button>.
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="size-3.5 text-success" />
                  <span className="rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                    Verified
                  </span>
                  <span className="text-muted-foreground">2 citations from your sources</span>
                </div>
              </div>
            </Card>
          </motion.div>
        </section>

        {/* ================= FEATURES ================= */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6" aria-label="Features">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold tracking-tight"
          >
            Everything for a calmer, citable study habit
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.06 }}
            className="mb-10 mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base"
          >
            Seven core features, no filler. Every answer is source-grounded; every AI action is
            honest about what it does and doesn’t know.
          </motion.p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body, tint }, i) => (
              <motion.div
                key={title}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.2 }}
              >
                <Card className="card-hover h-full p-5">
                  <div
                    className="mb-4 flex size-10 items-center justify-center rounded-xl"
                    style={{ background: `${tint}1f`, color: tint }}
                  >
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ================= HOW IT WORKS ================= */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6" aria-label="How it works">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-10 text-3xl font-bold tracking-tight"
          >
            How it works
          </motion.h2>
          <ol className="grid gap-5 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.n}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.3 }}
                className="relative rounded-2xl border border-border bg-card p-6"
              >
                <span className="brand-gradient flex size-9 items-center justify-center rounded-full text-sm font-bold text-white shadow">
                  {s.n}
                </span>
                <h3 className="mt-4 text-sm font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="absolute -right-3 top-1/2 hidden size-5 -translate-y-1/2 text-border sm:block" />
                )}
              </motion.li>
            ))}
          </ol>
        </section>
      </main>

      {/* sticky mobile CTA — always visible on small screens */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <Button variant="gradient" className="w-full" onClick={() => launchDemo(false)} disabled={launching}>
          <GraduationCap className="size-4" />
          {launching ? "Preparing…" : "Try the demo workspace"}
        </Button>
      </div>

      <footer className="border-t border-border bg-surface py-10 pb-24 lg:pb-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="brand-gradient flex size-6 items-center justify-center rounded-md text-[10px] font-extrabold text-white">
              SS
            </span>
            <span>StudySpace — source-grounded AI study workspace.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/auth" className="transition-colors hover:text-foreground">Sign in</Link>
            <button type="button" onClick={() => launchDemo(true)} className="transition-colors hover:text-foreground">
              Reset demo
            </button>
            <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="transition-colors hover:text-foreground">Terms</Link>
            <a
              href="https://github.com/Damini2006/Study-space"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            14 Innovation Drive, Bengaluru, Karnataka 560103, India · privacy@studyspace.app
          </p>
        </div>
      </footer>
    </div>
  );
}
