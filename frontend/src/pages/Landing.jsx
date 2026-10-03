import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";
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
    body: "Four switchable safety layers — relevance gate, citation validation, claim verification, and graceful \u201CI couldn\u2019t find this\u201D responses.",
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

function FloatingOrb({ className, color, size, delay = 0 }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 50, damping: 20 });
  const springY = useSpring(y, { stiffness: 50, damping: 20 });

  useEffect(() => {
    const interval = setInterval(() => {
      x.set(Math.sin(Date.now() / 2000 + delay) * 30);
      y.set(Math.cos(Date.now() / 1800 + delay) * 20);
    }, 50);
    return () => clearInterval(interval);
  }, [x, y, delay]);

  return (
    <motion.div
      className={cn("absolute rounded-full blur-3xl pointer-events-none", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        x: springX,
        y: springY,
        opacity: 0.4,
      }}
    />
  );
}

function ParticleField() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 10 + 10,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary/20"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center" style={{ perspective: 1000 }}>
      {/* Main document card */}
      <motion.div
        initial={{ opacity: 0, y: 40, rotateY: -15 }}
        animate={{ opacity: 1, y: 0, rotateY: 0 }}
        transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-64 sm:w-72"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Document card */}
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="rounded-2xl border border-border bg-surface/90 backdrop-blur-xl p-5 shadow-[0_0_40px_rgba(79,91,213,0.15)]"
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="size-2 rounded-full bg-red-400" />
            <div className="size-2 rounded-full bg-yellow-400" />
            <div className="size-2 rounded-full bg-green-400" />
          </div>
          {/* Content lines */}
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-primary/30 w-full" />
            <div className="h-2 rounded-full bg-primary/20 w-4/5" />
            <div className="h-2 rounded-full bg-primary/20 w-3/5" />
          </div>
          {/* Citation */}
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
            <div className="size-4 rounded-full bg-primary/30" />
            <div className="h-1.5 rounded-full bg-primary/40 w-16" />
          </div>
          {/* Answer */}
          <div className="mt-3 space-y-1.5">
            <div className="h-1.5 rounded-full bg-accent/30 w-full" />
            <div className="h-1.5 rounded-full bg-accent/20 w-5/6" />
            <div className="h-1.5 rounded-full bg-accent/20 w-4/6" />
          </div>
        </motion.div>

        {/* Floating citation badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, type: "spring", stiffness: 300, damping: 20 }}
          className="absolute -right-4 top-8"
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="rounded-xl border border-border bg-surface/90 backdrop-blur-xl px-3 py-2 shadow-lg flex items-center gap-2"
          >
            <CheckCircle2 className="size-4 text-green-400" />
            <span className="text-xs font-medium">Verified</span>
          </motion.div>
        </motion.div>

        {/* Floating score badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1, type: "spring", stiffness: 300, damping: 20 }}
          className="absolute -left-4 bottom-12"
        >
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="rounded-xl border border-border bg-surface/90 backdrop-blur-xl px-3 py-2 shadow-lg"
          >
            <p className="text-xs text-muted-foreground">Confidence</p>
            <p className="text-sm font-bold text-primary">98%</p>
          </motion.div>
        </motion.div>

        {/* Decorative ring */}
        <motion.div
          className="absolute -inset-4 rounded-3xl border border-primary/10"
          animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </div>
  );
}

export default function Landing() {
  const { startDemo } = useAuth();
  const { error } = useToast();
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

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
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="brand-gradient flex size-8 items-center justify-center rounded-xl text-xs font-extrabold text-white shadow-lg">
              SS
            </span>
            <span className="text-base font-bold tracking-tight">StudySpace</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/auth"
              className="rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
      <section ref={heroRef} className="relative min-h-screen overflow-hidden">
        {/* === 3D Scene Background === */}
        <div className="absolute inset-0">
          <FloatingOrb className="top-1/4 left-1/4" color="#4f5bd5" size={200} />
          <FloatingOrb className="bottom-1/4 right-1/4" color="#e8749a" size={160} delay={1} />
          <FloatingOrb className="top-1/2 right-1/3" color="#2fb5a0" size={120} delay={2} />
          <ParticleField />
          {/* Grid overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(79,91,213,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(79,91,213,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
        </div>

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative z-10 min-h-screen flex items-center py-16 px-4 sm:px-6 lg:px-8"
        >
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center w-full">
            {/* Left: Quote + CTA */}
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-center lg:text-left"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm mb-6"
              >
                <Sparkles className="size-3 text-accent" />
                Source-grounded AI study workspace
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.1 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight text-white"
              >
                Every answer,{" "}
                <span className="relative inline-block">
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">cited</span>
                  <motion.span
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent rounded-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
                  />
                </span>
                {" "}to your sources.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.2 }}
                className="mt-6 text-base sm:text-lg max-w-xl text-pretty text-muted-foreground leading-relaxed mx-auto lg:mx-0"
              >
                Upload documents, ask questions, get answers with exact citations. Generate study material, review with spaced repetition, and plan with an AI that asks permission first.
              </motion.p>

              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.3 }}
                className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.4 }}
                className="mt-12 grid grid-cols-3 gap-3 sm:gap-4 max-w-lg w-full mx-auto lg:mx-0"
              >
                {PILLARS.map(({ icon: Icon, label, desc }) => (
                  <motion.div
                    key={label}
                    whileHover={{ y: -4, scale: 1.02 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="group rounded-2xl border border-border bg-surface/80 p-4 backdrop-blur cursor-default"
                  >
                    <Icon className="size-5 group-hover:text-primary mb-2 block transition-colors" />
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">{label}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{desc}</p>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>

            {/* Right: 3D Visual */}
            <div className="hidden lg:block h-[500px]">
              <HeroVisual />
            </div>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-1.5"
          >
            <div className="w-1 h-2 rounded-full bg-muted-foreground/50" />
          </motion.div>
        </motion.div>
      </section>

      {/* ================= STATS SECTION ================= */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {[
            { icon: "📄", label: "Source-Powered", desc: "Chat with your PDFs, notes and docs", color: "text-primary" },
            { icon: "🔐", label: "Honest Answers", desc: "Four safety layers, always grounded", color: "text-accent" },
            { icon: "📊", label: "FSRS Scheduling", desc: "Real spaced repetition, per-card tracking", color: "text-purple-500" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className="group rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur hover:bg-surface/90 hover:shadow-[0_0_30px_rgba(var(--primary),0.08)] transition-all duration-300 cursor-default"
            >
              <div className={cn("text-2xl mb-2", stat.color)}>{stat.icon}</div>
              <h3 className="text-base font-bold">{stat.label}</h3>
              <p className="text-sm text-muted-foreground mt-1">{stat.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ================= FEATURES SECTION ================= */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12" aria-label="Features">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <motion.h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Everything for a calmer, citable study habit
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 max-w-2xl mx-auto text-base text-muted-foreground"
          >
            Seven core features, no filler. Every answer is source-grounded; every AI action is honest about what it does and doesn't know.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, body, tint }, i) => (
            <motion.div
              key={title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.25 }}
              whileHover={{ y: -6, scale: 1.01 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="group rounded-2xl border border-border bg-surface/80 p-5 hover:bg-surface/90 transition-all duration-300 hover:shadow-[0_0_30px_rgba(var(--primary),0.08)]"
            >
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110" style={{ backgroundColor: hexToRgba(tint, 0.15), color: tint }}>
                <Icon className="size-5" />
              </div>
              <h3 className="text-sm font-semibold mb-1.5">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12" aria-label="How it works">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <motion.h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            How it works
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 max-w-2xl mx-auto text-base text-muted-foreground"
          >
            A three-step system to study smarter with AI-powered citation and review
          </motion.p>
        </motion.div>

        <ol className="grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.n}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.3 }}
              whileHover={{ y: -4 }}
              className="relative rounded-2xl border border-border bg-surface/80 p-6 flex items-start gap-4 group"
            >
              <span className="brand-gradient flex size-8 items-center justify-center rounded-full text-xs font-bold text-white shadow group-hover:scale-110 transition-transform duration-300">
                {s.n}
              </span>
              <div className="flex-1">
                <h3 className="font-semibold text-sm">{s.title}</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{s.body}</p>
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm opacity-40 transition-opacity group-hover:opacity-100" />
              )}
            </motion.li>
          ))}
        </ol>
      </section>

      {/* ================= TESTIMONIALS ================= */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Loved by students
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-base text-muted-foreground">
            See how StudySpace helps students study smarter with AI-powered citations
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {[
            { name: "Priya S.", role: "Medical Student", quote: "The citation feature alone saved hours of my study time. Every answer links back to the exact passage." },
            { name: "James K.", role: "CS Major", quote: "FSRS scheduling actually works. My retention improved 40% in the first month of using StudySpace." },
            { name: "Aisha M.", role: "Law Student", quote: "The AI planner asks permission before committing to my schedule. Finally, an AI that respects my time." },
          ].map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className="rounded-2xl border border-border bg-surface/80 p-5"
            >
              <p className="text-sm text-muted-foreground italic">"{t.quote}"</p>
              <div className="mt-4 flex items-center gap-3">
                <div className="brand-gradient flex size-8 items-center justify-center rounded-full text-xs font-bold text-white">
                  {t.name[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ================= COMPARISON ================= */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Why StudySpace?
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-base text-muted-foreground">
            See how we compare to traditional study methods
          </p>
        </motion.div>

        <div className="max-w-3xl mx-auto rounded-2xl border border-border overflow-hidden">
          <div className="grid grid-cols-3 bg-surface/50 p-4 text-sm font-semibold">
            <div>Feature</div>
            <div className="text-center">Traditional</div>
            <div className="text-center text-primary">StudySpace</div>
          </div>
          {[
            { feature: "Source citations", traditional: "❌ Manual", study: "✅ Automatic" },
            { feature: "Spaced repetition", traditional: "❌ Paper cards", study: "✅ FSRS algorithm" },
            { feature: "AI planning", traditional: "❌ None", study: "✅ With approval" },
            { feature: "Focus tracking", traditional: "❌ None", study: "✅ Built-in" },
            { feature: "Progress insights", traditional: "❌ None", study: "✅ Real-time" },
          ].map((row, i) => (
            <motion.div
              key={row.feature}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="grid grid-cols-3 p-4 border-t border-border text-sm"
            >
              <div className="font-medium">{row.feature}</div>
              <div className="text-center text-muted-foreground">{row.traditional}</div>
              <div className="text-center text-primary font-medium">{row.study}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ================= CTA SECTION ================= */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl border border-border bg-gradient-to-br from-primary/10 to-accent/10 p-8 sm:p-12 text-center overflow-hidden"
        >
          <FloatingOrb className="top-0 right-0" color="#4f5bd5" size={150} />
          <FloatingOrb className="bottom-0 left-0" color="#e8749a" size={120} delay={1} />
          <div className="relative z-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Ready to study smarter?
            </h2>
            <p className="mt-3 text-base text-muted-foreground max-w-xl mx-auto">
              Join students who cite every answer and review with real spaced repetition.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="gradient" size="lg" onClick={() => launchDemo(false)} disabled={launching}>
                <GraduationCap className="size-4" />
                {launching ? "Preparing demo…" : "Start free demo"}
              </Button>
              <Link to="/auth">
                <Button variant="outline" size="lg">
                  Sign in <ChevronRight className="size-4" />
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="brand-gradient flex size-6 items-center justify-center rounded-lg text-xs font-bold text-white">SS</span>
            <span className="text-sm font-bold">StudySpace</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <span>© 2026 StudySpace</span>
          </div>
        </div>
      </footer>
    </div>
  );
}