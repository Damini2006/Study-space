import { useState } from "react";
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
  },
  {
    icon: ShieldCheck,
    title: "Honest answers, always",
    body: "Four switchable safety layers — relevance gate, citation validation, claim verification, and graceful “I couldn’t find this” responses.",
  },
  {
    icon: Sparkles,
    title: "Studio material",
    body: "Generate source-grounded summaries, study guides, flashcards and MCQ quizzes. Everything is editable, and flashcards flow straight into review.",
  },
  {
    icon: Layers,
    title: "FSRS spaced repetition",
    body: "Real FSRS scheduling — Again/Hard/Good/Easy reviews with per-card state and full history. Due today, always visible.",
  },
  {
    icon: CalendarCheck,
    title: "AI planner with approval",
    body: "LangGraph drafts your plan around exam dates and weak topics — but nothing is committed until you approve the ghost tasks.",
  },
  {
    icon: Timer,
    title: "Focus, habits & notes",
    body: "Pomodoro focus sessions, a habit tracker and rich-text notes — calm, and backed by Supabase with Row Level Security.",
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

export default function Landing() {
  const { startDemo } = useAuth();
  const { error } = useToast();
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);

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
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-sm font-bold">
            <span className="brand-gradient flex size-7 items-center justify-center rounded-lg text-[11px] font-bold text-white">SS</span>
            <span>StudySpace</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/auth" className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2">
              Sign in
            </Link>
            <Button variant="gradient" size="sm" onClick={() => launchDemo(false)} disabled={launching}>
              {launching ? "Opening demo…" : "Try the demo"}
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        {/* Hero */}
        <section className="flex flex-col items-center gap-6 py-16 text-center sm:py-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-accent" />
            Source-grounded AI study workspace
          </span>
          <h1 className="max-w-3xl text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Study from <span className="brand-text">your own notes</span>, verified against every source.
          </h1>
          <p className="max-w-xl text-pretty text-base text-muted-foreground">
            Upload a document, ask a question, get an answer that cites the exact passage. Generate
            study material, review with spaced repetition, and plan with an AI that asks permission
            first.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button variant="gradient" size="lg" onClick={() => launchDemo(false)} disabled={launching}>
              <GraduationCap className="size-4" />
              {launching ? "Preparing demo…" : "Try the demo workspace"}
            </Button>
            <Link to="/auth">
              <Button variant="outline" size="lg">
                Sign in <ChevronRight className="size-4" />
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            One click, no signup — a seeded demo with sources, cards, notes and a plan.
          </p>
        </section>

        {/* Preview card */}
        <section className="pb-16">
          <Card className="mx-auto max-w-3xl p-5">
            <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-destructive/60" />
                <span className="size-2.5 rounded-full bg-warning/60" />
                <span className="size-2.5 rounded-full bg-success/60" />
              </div>
              <span className="text-xs text-muted-foreground">Botany 201 · Chat</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="ml-auto max-w-[80%] rounded-xl bg-primary px-3.5 py-2.5 text-on-primary">
                Where do the light-independent reactions of photosynthesis occur?
              </div>
              <div className="max-w-[85%] rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
                They occur in the <strong>stroma</strong> of the chloroplast, during the Calvin cycle
                <button className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-citation px-1 align-middle font-mono text-[10px] font-bold text-citation-foreground">1</button>.
                ATP and NADPH from the light reactions are used to fix CO₂
                <button className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-citation px-1 align-middle font-mono text-[10px] font-bold text-citation-foreground">2</button>.
              </div>
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="size-3.5 text-success" />
                <span className="rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">Verified</span>
                <span className="text-muted-foreground">2 citations from your sources</span>
              </div>
            </div>
          </Card>
        </section>

        {/* Features */}
        <section className="pb-16" aria-label="Features">
          <h2 className="mb-2 text-2xl font-bold tracking-tight">Everything for a calmer, citable study habit</h2>
          <p className="mb-8 max-w-2xl text-sm text-muted-foreground">
            Seven core features, no filler. Every answer is source-grounded; every AI action is
            honest about what it does and doesn't know.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="p-5 transition-transform hover:-translate-y-0.5">
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4.5" />
                </div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="pb-20" aria-label="How it works">
          <h2 className="mb-8 text-2xl font-bold tracking-tight">How it works</h2>
          <ol className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="relative rounded-xl border border-border bg-card p-5">
                <span className="brand-gradient flex size-8 items-center justify-center rounded-full text-sm font-bold text-white">
                  {s.n}
                </span>
                <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-border bg-surface py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-muted-foreground sm:flex-row">
          <span>StudySpace — source-grounded AI study workspace.</span>
          <div className="flex items-center gap-4">
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
            <button type="button" onClick={() => launchDemo(true)} className="hover:text-foreground">
              Reset demo
            </button>
            <Link to="/app/analytics" className="hover:text-foreground">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
