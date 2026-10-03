import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
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
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

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
    transition: { duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
  }),
};

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function Landing() {
  const { startDemo } = useAuth();
  const { error } = useToast();
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [orb1Pos, setOrb1Pos] = useState({ x: 0, y: 0 });
  const [orb2Pos, setOrb2Pos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const animate = () => {
      setOrb1Pos({ x: Math.sin(Date.now() / 2000) * 80, y: Math.cos(Date.now() / 1800) * 60 });
      setOrb2Pos({ x: Math.cos(Date.now() / 1500) * 60, y: Math.sin(Date.now() / 1900) * 50 });
      requestAnimationFrame(animate);
    };
    animate();
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

  const PAGE_META = {
    "/": { title: "StudySpace — source-grounded AI study workspace", desc: "Chat with your notes, generate study material, review with spaced repetition." },
    "/auth": { title: "Sign in — StudySpace", desc: "Sign in to your StudySpace workspace." },
    "/app/dashboard": { title: "Dashboard — StudySpace", desc: "Your today view: plan, streaks, spaces and habits." },
    "/app/focus": { title: "Focus — StudySpace", desc: "Pomodoro, ambient sounds, habits and session history." },
    "/app/vision": { title: "Vision Board — StudySpace", desc: "Drag stickies and images on your vision board." },
    "/app/finance": { title: "Finance — StudySpace", desc: "Track spending and see your category breakdown." },
    "/privacy": { title: "Privacy Policy — StudySpace", desc: "How StudySpace handles your data." },
    "/terms": { title: "Terms of Service — StudySpace", desc: "StudySpace terms of service." },
    "/thanks": { title: "Welcome — StudySpace", desc: "Your workspace is ready." },
  };

  useEffect(() => {
    const meta = PAGE_META[location.pathname] || {
      title: "StudySpace",
      desc: "Source-grounded AI study workspace.",
    };
    document.title = meta.title;
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "description");
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", meta.desc);
  }, [location.pathname]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-background">
      {/* ================= NAV ================= */}
      <header
        className={`sticky top-0 z-30 backdrop-blur-xl transition-all duration-300 ${
          scrolled
            ? "border-b border-border bg-background/80 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
            : "border-b border-transparent bg-background/40"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="brand-gradient flex size-9 items-center justify-center rounded-2xl text-xs font-extrabold text-white shadow-lg">
              SS
            </span>
            <span className="text-lg font-bold tracking-tight">StudySpace</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
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

      {/* ================= HERO ================= */}
      <section className="relative min-h-screen relative overflow-hidden bg-gradient-to-b from-bg to-surface">
        {/* === 3D Scene Background === */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          {/* Orb 1 - primary glow */}
          <div
            className="orb-3d absolute top-1/3 left-1/4 w-40 h-40 rounded-2xl bg-primary/20 shadow-[0_0_60px_rgba(79,91,213,0.4)] border-2 border-primary/20 animate-spin"
            style={{ transform: `perspective(600px) translate3d(${orb1Pos.x}px, ${orb1Pos.y}px, 0) scale(1)` }}
          />
          {/* Orb 2 - accent glow */}
          <div
            className="orb-3d absolute bottom-1/4 right-1/4 w-48 h-48 rounded-2xl bg-accent/15 shadow-[0_0_60px_rgba(232,116,154,0.3)] border-2 border-accent/20 animate-spin-reverse"
            style={{ transform: `perspective(600px) translate3d(${orb2Pos.x}px, ${orb2Pos.y}px, 0) scale(1.2)` }}
          />
          {/* Depth lines */}
          <div className="absolute inset-0 opacity-5">
            <div className="h-[1px] w-full bg-gradient-to-b from-primary/5 to-transparent absolute top-0 md:top-1/2 transform rotate-90 md:rotate-0"></div>
            <div className="h-[1px] w-full bg-gradient-to-r from-accent/5 to-transparent absolute left-0 md:left-1/2 transform -rotate-90 md:rotate-0"></div>
          </div>
        </div>

        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-border bg-surface/80 px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm"
            >
              <Sparkles className="size-3.5 text-accent" />
              Source-grounded AI study workspace
            </motion.span>

            {/* Quote badge that slides in from right */}
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.1 }}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface/80 px-3.5 py-1.5 text-xs font-medium text-primary shadow-sm mb-2"
            >
              <Sparkles className="size-2.5 text-accent" />
              Source-grounded AI
            </motion.div>

            <motion.h1
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.2 }}
              className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-center"
            >
              Study from
              <span className="relative">
                <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">your own notes</span>
              </span>,
              <br className="hidden sm:block" />
              verified against every source.
            </motion.h1>

            {/* Subtle accent line moving across */}
            <motion.div
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="mt-6 flex h-0.5 w-full bg-gradient-to-r from-primary to-accent transition-all duration-500 sm:w-40 lg:w-60 opacity-0 sm:opacity-100"
            />

            <motion.p
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.15 }}
              className="mt-6 text-base sm:text-lg max-w-2xl text-pretty text-muted-foreground leading-relaxed sm:text-center"
            >
              Upload a document, ask a question, get an answer that cites the exact passage. Generate
              study material, review with spaced repetition, and plan with an AI that asks permission
              first.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 32, x: -20 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.2 }}
              className="mt-8 flex flex-col sm:flex-row gap-3 justify-center"
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

            {/* Three Pillars */}
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.3 }}
              className="mt-10 grid grid-cols-3 gap-3 sm:grid-cols-5 max-w-2xl w-full justify-center"
            >
              {PILLARS.map(({ icon: Icon, label, desc }) => (
                <motion.div
                  key={label}
                  className="group rounded-2xl border border-border bg-surface/80 p-4 backdrop-blur transition-all duration-500 hover:translate-y-1 hover:shadow-[0_0_40px_rgba(var(--primary),0.15)]"
                >
                  <Icon className="size-4 group-hover:text-primary mb-1.5 block" />
                  <p className="text-xs font-medium group-hover:text-primary transition-colors">{label}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{desc}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* Orb hover interaction */}
            <div
              className="absolute -inset-1/2 pointer-events-none opacity-5"
              onMouseMove={(e) => {
                const { clientX, clientY } = e;
                const docWidth = document.documentElement.clientWidth;
                const docHeight = document.documentElement.clientHeight;
                setOrb1Pos({
                  x: (clientX / docWidth - 0.5) * 100,
                  y: (clientY / docHeight - 0.5) * 80,
                });
                setOrb2Pos({
                  x: (clientX / docWidth - 0.3) * 80,
                  y: (clientY / docHeight - 0.7) * 60,
                });
              }}
            />
          </motion.div>
        </div>
      </section>

      {/* ================= ENHANCED STATS / FEATURE HIGHLIGHTS ================= */}
      <section className="mx-auto max-w-7xl px-6 py-12 sm:px-8 lg:px-12 bg-surface/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Interactive stat card 1 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.1 }}
            className="group rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur hover:bg-surface/90 hover:shadow-[0_0_40px_rgba(var(--primary),0.1)] transition-all duration-300 cursor-pointer"
            onMouseEnter={() => setOrb1Pos(prev => ({...prev, x: prev.x + 10}))}
            onMouseLeave={() => setOrb1Pos({ x: 0, y: 0 })}
          >
            <div className="size-10 text-primary mb-2">📄</div>
            <h3 className="text-lg font-bold">Source-Powered</h3>
            <p className="text-sm text-muted-foreground">Chat with your PDFs, notes and docs</p>
          </motion.div>

          {/* Interactive stat card 2 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.2 }}
            className="group rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur hover:bg-surface/90 hover:shadow-[0_0_40px_rgba(var(--primary),0.1)] transition-all duration-300 cursor-pointer"
            onMouseEnter={() => setOrb2Pos(prev => ({...prev, y: prev.y + 10}))}
            onMouseLeave={() => setOrb2Pos({ x: 0, y: 0 })}
          >
            <div className="size-10 text-accent mb-2">🔐</div>
            <h3 className="text-lg font-bold">Honest Answers</h3>
            <p className="text-sm text-muted-foreground">Four safety layers, always grounded</p>
          </motion.div>

          {/* Interactive stat card 3 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.3 }}
            className="group rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur hover:bg-surface/90 hover:shadow-[0_0_40px_rgba(var(--primary),0.1)] transition-all duration-300 cursor-pointer"
          >
            <div className="size-10 text-purple-600 mb-2">📊</div>
            <h3 className="text-lg font-bold">FSRS Scheduling</h3>
            <p className="text-sm text-muted-foreground">Real spaced repetition, per-card tracking</p>
          </motion.div>
        </div>
      </section>

      {/* ================= FEATURES SECTION ================= */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12" aria-label="Features">
        <motion.h2
          initial={{ opacity: 0, y: 20, x: -20 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.1 }}
          viewport={{ once: true }}
          className="mb-12 text-3xl sm:text-4xl font-bold tracking-tight text-center"
        >
          Everything for a calmer, citable study habit
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20, x: -20 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.12 }}
          viewport={{ once: true }}
          className="mb-10 max-w-2xl mx-auto text-base text-muted-foreground sm:text-center"
        >
          Seven core features, no filler. Every answer is source-grounded; every AI action is honest about what it does and doesn't know.
        </motion.p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, body, tint }, i) => (
            <motion.div
              key={title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.25 }}
              className="rounded-3xl border border-border bg-surface/80 p-5 hover:bg-surface/90 transition-all duration-500 hover:shadow-[0_0_40px_rgba(var(--primary),0.1)]"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-2xl" style={{ backgroundColor: hexToRgba(tint, 0.15), color: tint }}>
                <Icon className="size-5" />
              </div>
              <h3 className="text-sm font-semibold mb-2">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12" aria-label="How it works">
        <motion.h2
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.1 }}
          viewport={{ once: true }}
          className="mb-12 text-3xl sm:text-4xl font-bold tracking-tight text-center"
        >
          How it works
        </motion.h2>
        <motion.p
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.12 }}
          viewport={{ once: true }}
          className="mb-12 max-w-2xl mx-auto text-base text-muted-foreground sm:text-center"
        >
          A three-step system to study smarter with AI-powered citation and review
        </motion.p>

        <ol className="grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.n}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.3 }}
              className="relative rounded-2xl border border-border bg-surface/80 p-6 flex items-start gap-4 transform hover:translate-y-[-4] transition-transform duration-300"
            >
              <span className="absolute left-0 top-1/2 -translate-y-1/2 brand-gradient flex size-9 items-center justify-center rounded-full text-xs font-bold text-white shadow">
                {s.n}
              </span>
              <div className="flex-1 flex-initial">
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-3">{s.body}</p>
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm opacity-40 transition-opacity hover:opacity-100"
                />
              )}
            </motion.li>
          ))}
        </ol>
      </section>
    </div>
  );
}