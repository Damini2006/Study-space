import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Eye,
  EyeOff,
  FileText,
  Flame,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  Timer,
} from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import ThemeToggle from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Left visual panel — theme-aware, depth-parallax                    */
/* ------------------------------------------------------------------ */

function SourceCard({ delay, page, section, lines, className, rotate, depth = 1 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, rotate: rotate - 3 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ x: depth }}
      className={cn(
        "w-[250px] rounded-lg border border-border bg-card/85 p-3.5 shadow-sm backdrop-blur-md",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          <FileText className="size-3" />
          {section}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">{page}</span>
      </div>
      <div className="mt-3 space-y-1.5">
        {lines.map((w, i) => (
          <motion.div
            key={i}
            className="h-1.5 origin-left rounded-full bg-muted"
            style={{ width: `${w}%` }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: delay + 0.3 + i * 0.08, duration: 0.5, ease: "easeOut" }}
          />
        ))}
      </div>
    </motion.div>
  );
}

const ANSWER = "Because no heat crosses the boundary, any work the gas does comes from its own internal energy.";

function StreamingAnswer() {
  const words = useMemo(() => ANSWER.split(" "), []);
  return (
    <p className="text-[13px] leading-relaxed">
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ delay: 0.65 + i * 0.035, duration: 0.35 }}
        >
          {w}{" "}
        </motion.span>
      ))}
      <span className="ml-1 inline-flex translate-y-[1px] rounded border border-primary/35 bg-primary/12 px-1 py-px font-mono text-[9px] font-medium text-primary">
        1
      </span>
      <span className="ml-0.5 inline-flex translate-y-[1px] rounded border border-primary/35 bg-primary/12 px-1 py-px font-mono text-[9px] font-medium text-primary">
        2
      </span>
    </p>
  );
}

function OrbitRing({ size, duration, reverse, dotClass, dotPos }) {
  return (
    <motion.div
      aria-hidden
      className={cn("pointer-events-none absolute rounded-full border border-border/70", reverse ? "border-dashed" : "")}
      style={{ width: size, height: size, left: "50%", top: "50%", marginLeft: -size / 2, marginTop: -size / 2 }}
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    >
      <span className={cn("absolute size-2 rounded-full", dotClass)} style={dotPos} />
    </motion.div>
  );
}

function VisualPanel() {
  const ref = useRef(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 90, damping: 18 });
  const sy = useSpring(my, { stiffness: 90, damping: 18 });

  const rotY = useTransform(sx, [-0.5, 0.5], [-9, 9]);
  const rotX = useTransform(sy, [-0.5, 0.5], [7, -7]);
  const layerA = useTransform(sx, [-0.5, 0.5], [14, -14]);
  const layerB = useTransform(sy, [-0.5, 0.5], [10, -10]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onMove = (e) => {
      const r = node.getBoundingClientRect();
      mx.set((e.clientX - r.left) / r.width - 0.5);
      my.set((e.clientY - r.top) / r.height - 0.5);
    };
    const onLeave = () => { mx.set(0); my.set(0); };
    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseleave", onLeave);
    return () => {
      node.removeEventListener("mousemove", onMove);
      node.removeEventListener("mouseleave", onLeave);
    };
  }, [mx, my]);

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden bg-gradient-to-br from-primary/12 via-surface to-accent/12">
      {/* theme-aware grid + colour blooms */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="hero-grid absolute inset-0 [mask-image:radial-gradient(75%_65%_at_50%_40%,#000,transparent)]" />
        <motion.div
          className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/35 blur-[110px]"
          animate={{ x: [0, 26, 0], y: [0, 20, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent/30 blur-[110px]"
          animate={{ x: [0, -22, 0], y: [0, -24, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        <motion.div
          className="absolute bottom-1/3 left-1/4 h-56 w-56 rounded-full bg-success/20 blur-[110px]"
          animate={{ x: [0, 18, 0], y: [0, -16, 0] }}
          transition={{ duration: 17, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
      </div>

      {/* drifting specks */}
      {[
        [12, 20, 4, "bg-primary", 0],
        [80, 16, 3, "bg-accent", 1.2],
        [26, 76, 5, "bg-success", 2.1],
        [88, 62, 3, "bg-warning", 0.6],
        [58, 40, 2, "bg-primary-soft", 1.7],
        [8, 56, 3, "bg-info", 2.6],
      ].map(([x, y, s, c, d], i) => (
        <motion.span
          key={i}
          aria-hidden
          className={cn("absolute rounded-full", c)}
          style={{ left: `${x}%`, top: `${y}%`, width: s, height: s }}
          animate={{ y: [0, -18, 0], opacity: [0.35, 0.95, 0.35] }}
          transition={{ duration: 5 + d, repeat: Infinity, ease: "easeInOut", delay: d }}
        />
      ))}

      {/* orbit rings behind the stack */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-72 w-72">
          <OrbitRing
            size={288}
            duration={30}
            dotClass="bg-primary shadow-[0_0_12px_var(--primary)]"
            dotPos={{ left: "50%", top: -4, marginLeft: -4 }}
          />
          <OrbitRing
            size={400}
            duration={48}
            reverse
            dotClass="bg-accent shadow-[0_0_12px_var(--accent)]"
            dotPos={{ right: -3, top: "50%", marginTop: -3 }}
          />
        </div>
      </div>

      {/* parallax card stack */}
      <div className="relative flex h-full items-center justify-center px-8">
        <motion.div
          style={{ rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative space-y-4" style={{ perspective: 1000 }}>
            <motion.div style={{ x: layerA }} className="origin-bottom-right">
              <SourceCard delay={0.15} rotate={-2.5} page="p.14" section="3.2 Adiabatic work" lines={[96, 88, 74, 92, 60]} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative mx-auto w-[290px] rounded-lg border border-border bg-card/90 p-4 shadow-[0_24px_60px_-26px_rgba(15,23,42,0.55)] backdrop-blur-xl"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-success/35 bg-success/15">
                  <CircleCheck className="size-3 text-success" />
                </span>
                <div className="min-w-0">
                  <StreamingAnswer />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-border pt-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="text-success">coverage 100%</span>
                <span className="h-3 w-px bg-border" />
                <span>0 claims added</span>
              </div>
            </motion.div>

            <motion.div style={{ x: layerB }} className="ml-6 origin-top-left">
              <SourceCard delay={0.55} rotate={2} page="p.21" section="Worked example 4" lines={[84, 66, 90, 52]} />
            </motion.div>

            {/* floating citation chip */}
            <motion.span
              aria-hidden
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
              transition={{ delay: 1, duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-6 top-6 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-primary shadow-sm"
            >
              cite [1]
            </motion.span>
            <motion.span
              aria-hidden
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, y: [0, 8, 0] }}
              transition={{ delay: 1.4, duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -left-8 bottom-10 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-accent shadow-sm"
            >
              grounded
            </motion.span>
          </div>
        </motion.div>
      </div>

      {/* headline + stats */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.6 }}
        className="absolute inset-x-0 bottom-0 px-8 pb-7"
      >
        <p className="max-w-sm text-lg font-medium leading-snug tracking-tight">
          Nothing gets asserted without a page number behind it.
        </p>
        <div className="mt-4 grid max-w-sm grid-cols-3 divide-x divide-border border-y border-border">
          {[
            ["4", "grounding layers", KeyRound],
            ["0", "unsourced claims", Lock],
            ["FSRS", "schedule", Timer],
          ].map(([v, l, Icon], i) => (
            <div key={l} className="py-2.5 pl-3 first:pl-0">
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <Icon className="size-3" /> {l}
              </p>
              <p className="text-base font-semibold leading-tight">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Flame className="size-3 text-accent" />
          12-day streak across 3 spaces
          <span className="ml-auto flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider">
            <Sparkles className="size-3 text-primary" /> beta
          </span>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function scorePassword(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 5);
}

const STRENGTH = [
  { label: "Too short", bar: "bg-muted", w: "8%" },
  { label: "Weak", bar: "bg-destructive", w: "22%" },
  { label: "Weak", bar: "bg-destructive", w: "40%" },
  { label: "Fair", bar: "bg-warning", w: "60%" },
  { label: "Good", bar: "bg-success", w: "80%" },
  { label: "Strong", bar: "bg-success", w: "100%" },
];

function StrengthMeter({ value }) {
  const s = STRENGTH[value];
  return (
    <div aria-live="polite">
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn("h-full rounded-full", s.bar)}
          initial={false}
          animate={{ width: s.w }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
        />
      </div>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        strength · {s.label}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AuthPage() {
  const location = useLocation();
  const initialMode = useMemo(() => {
    const q = new URLSearchParams(location.search).get("mode");
    return q === "reset" ? "reset" : "signin";
  }, [location.search]);

  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  const { signIn, signUp, signInWithGoogle, startDemo, resetPassword, updatePassword } = useAuth();
  const { error, success } = useToast();
  const navigate = useNavigate();

  useEffect(() => { setMode(initialMode); setErrors({}); }, [initialMode]);

  const strength = scorePassword(password);
  const from = "/app/dashboard";

  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    setSent(false);
    setShowPassword(false);
  };

  const checkEmail = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setErrors((e) => ({ ...e, email: "Enter a valid e-mail address." }));
      return false;
    }
    setErrors((e) => { const n = { ...e }; delete n.email; return n; });
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      if (mode === "signin") {
        if (!checkEmail()) { setBusy(false); return; }
        if (password.length < 8) { setErrors({ password: "Passwords need at least 8 characters." }); setBusy(false); return; }
        await signIn(email.trim(), password);
        success("Welcome back.");
        navigate(from, { replace: true });
      } else if (mode === "signup") {
        if (!checkEmail()) { setBusy(false); return; }
        if (strength < 3) { setErrors({ password: "Pick something stronger — at least fair." }); setBusy(false); return; }
        if (name.trim().length > 0 && name.trim().length < 2) { setErrors({ name: "That name looks too short." }); setBusy(false); return; }
        await signUp(email.trim(), password, name.trim() || undefined);
        success("Account created. Check your e-mail to confirm, then sign in.");
        setMode("signin");
      } else if (mode === "forgot") {
        if (!checkEmail()) { setBusy(false); return; }
        await resetPassword(email.trim());
        setSent(true);
        success("Reset link sent.");
      } else if (mode === "reset") {
        if (strength < 3) { setErrors({ password: "Pick something stronger — at least fair." }); setBusy(false); return; }
        if (password !== confirm) { setErrors({ confirm: "Passwords do not match." }); setBusy(false); return; }
        await updatePassword(password);
        success("Password updated. You are signed in.");
        navigate("/app/dashboard", { replace: true });
      }
    } catch (err) {
      const msg = err.message || "Something went wrong. Please try again.";
      setErrors({ form: msg });
      error(msg);
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    setErrors({});
    try {
      await startDemo();
      navigate("/app/dashboard", { replace: true });
    } catch (err) {
      setErrors({ form: err.message || "Could not start the demo." });
      error(err.message);
      setBusy(false);
    }
  };

  const TITLE = {
    signin: ["01", "Sign in", "Welcome back.", "Your spaces, review queue and focus log are where you left them."],
    signup: ["02", "Create account", "Start with one file.", "Create a workspace, upload something you have to read, and ask it a question."],
    forgot: ["03", "Reset password", "Forgot your password?", "We will e-mail you a link that sets a new one. It expires in an hour."],
    reset: ["04", "New password", "Choose a new password.", "Pick something you have not used on another site."],
  }[mode];

  if (!supabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md p-6">
          <h1 className="text-lg font-semibold">Supabase isn&apos;t configured</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Copy <code className="font-mono text-xs">.env.example</code> to{" "}
            <code className="font-mono text-xs">.env</code> at the repo root, fill in your Supabase
            URL and anon key, and restart Vite.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left visual panel */}
      <aside className="relative hidden w-[46%] shrink-0 border-r border-border lg:block">
        <VisualPanel />
        <Link
          to="/"
          className="absolute left-8 top-7 z-10 flex items-center gap-2 rounded-md border border-border bg-card/80 px-2.5 py-1.5 text-[13px] text-muted-foreground backdrop-blur transition-colors hover:bg-card hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to site
        </Link>
      </aside>

      {/* Right form panel */}
      <main className="flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pt-6 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="StudySpace home">
            <span className="brand-gradient flex size-7 items-center justify-center rounded-md text-[11px] font-bold text-white">SS</span>
            <span className="text-[15px] font-semibold tracking-tight">StudySpace</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle size="sm" />
            <Link to="/" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              Home
            </Link>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[380px]"
          >
            <div className="hidden items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground lg:flex">
              <span className="text-primary">{TITLE[0]}</span>
              <span className="h-px w-8 bg-border" />
              <span>{TITLE[1]}</span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em]">{TITLE[2]}</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{TITLE[3]}</p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 rounded-xl border border-border bg-card p-5">
              {sent ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="py-4 text-center">
                  <span className="mx-auto flex size-11 items-center justify-center rounded-full border border-success/35 bg-success/12">
                    <Mail className="size-5 text-success" />
                  </span>
                  <h2 className="mt-4 text-[15px] font-semibold">Check your inbox</h2>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    If <span className="font-medium text-foreground">{email.trim()}</span> has an
                    account, a reset link is on its way. It expires in one hour.
                  </p>
                  <div className="mt-5 flex flex-col gap-2">
                    <Button variant="outline" onClick={() => { setSent(false); setMode("signin"); }}>
                      Back to sign in
                    </Button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      onClick={() => setSent(false)}
                    >
                      Resend to a different address
                    </button>
                  </div>
                </motion.div>
              ) : (
                <form onSubmit={submit} noValidate className="space-y-4">
                  <AnimatePresence initial={false}>
                    {errors.form && (
                      <motion.div
                        role="alert"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <p className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-[13px] leading-snug text-destructive">
                          {errors.form}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {mode === "signup" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-1.5 overflow-hidden"
                      >
                        <Label htmlFor="name">Display name</Label>
                        <Input
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Ada Lovelace"
                          autoComplete="name"
                          aria-invalid={!!errors.name}
                        />
                        {errors.name && <p role="alert" className="text-xs text-destructive">{errors.name}</p>}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {mode !== "reset" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="email">E-mail</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@school.edu"
                        autoComplete="email"
                        aria-invalid={!!errors.email}
                        aria-describedby={errors.email ? "email-err" : undefined}
                        className={errors.email && "border-destructive focus-visible:ring-destructive/40"}
                      />
                      {errors.email && <p id="email-err" role="alert" className="text-xs text-destructive">{errors.email}</p>}
                    </div>
                  )}

                  {(mode === "signin" || mode === "signup" || mode === "reset") && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        {mode === "signin" && (
                          <button
                            type="button"
                            onClick={() => switchMode("forgot")}
                            className="text-[11px] text-primary transition-colors hover:underline"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyUp={(e) => setCapsOn(e.getModifierState && e.getModifierState("CapsLock"))}
                          onKeyDown={(e) => setCapsOn(e.getModifierState && e.getModifierState("CapsLock"))}
                          placeholder={mode === "reset" ? "New password" : "At least 8 characters"}
                          autoComplete={mode === "signin" ? "current-password" : "new-password"}
                          aria-invalid={!!errors.password}
                          aria-describedby={errors.password ? "password-err" : undefined}
                          className={errors.password && "border-destructive focus-visible:ring-destructive/40 pr-9"}
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                      {capsOn && (
                        <p role="status" className="text-xs text-warning">Caps Lock is on.</p>
                      )}
                      {errors.password && <p id="password-err" role="alert" className="text-xs text-destructive">{errors.password}</p>}

                      {mode !== "signin" && <StrengthMeter value={strength} />}
                    </div>
                  )}

                  {mode === "reset" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm">Confirm new password</Label>
                      <Input
                        id="confirm"
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Repeat it"
                        autoComplete="new-password"
                        aria-invalid={!!errors.confirm}
                        className={errors.confirm && "border-destructive focus-visible:ring-destructive/40"}
                      />
                      {errors.confirm && <p role="alert" className="text-xs text-destructive">{errors.confirm}</p>}
                    </div>
                  )}

                  {mode === "signup" && (
                    <ul className="grid grid-cols-2 gap-1.5">
                      {[
                        ["8+ characters", password.length >= 8],
                        ["Upper + lower", /[A-Z]/.test(password) && /[a-z]/.test(password)],
                        ["A number", /\d/.test(password)],
                        ["A symbol", /[^A-Za-z0-9]/.test(password)],
                      ].map(([t, ok]) => (
                        <li key={t} className={cn("flex items-center gap-1.5 text-[11px]", ok ? "text-success" : "text-muted-foreground")}>
                          <span className={cn("flex size-3.5 items-center justify-center rounded-full border", ok ? "border-success/50 bg-success/15" : "border-border")}>
                            {ok && <Check className="size-2.5" />}
                          </span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}

                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    {mode === "signin" && "Sign in"}
                    {mode === "signup" && "Create account"}
                    {mode === "forgot" && "Send reset link"}
                    {mode === "reset" && "Save new password"}
                    {!busy && mode !== "forgot" && <ArrowRight className="size-4" />}
                  </Button>

                  {mode === "forgot" && (
                    <button
                      type="button"
                      onClick={() => switchMode("signin")}
                      className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ArrowLeft className="size-3.5" />
                      Back to sign in
                    </button>
                  )}
                </form>
              )}
            </div>

            {/* social + demo (hidden in reset mode) */}
            {mode !== "reset" && !sent && (
              <>
                <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => signInWithGoogle()} disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    Google
                  </Button>
                  <Button variant="secondary" onClick={demo} disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <GraduationCap className="size-4" />}
                    Demo
                  </Button>
                </div>
              </>
            )}

            {/* mode switch */}
            {!sent && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                {mode === "signin" && (
                  <>
                    New here?{" "}
                    <button type="button" className="font-medium text-primary transition-colors hover:underline" onClick={() => switchMode("signup")}>
                      Create an account
                    </button>
                  </>
                )}
                {mode === "signup" && (
                  <>
                    Already have an account?{" "}
                    <button type="button" className="font-medium text-primary transition-colors hover:underline" onClick={() => switchMode("signin")}>
                      Sign in
                    </button>
                  </>
                )}
                {(mode === "forgot" || mode === "reset") && mode !== "forgot" && (
                  <>
                    Remembered it?{" "}
                    <button type="button" className="font-medium text-primary transition-colors hover:underline" onClick={() => switchMode("signin")}>
                      Sign in
                    </button>
                  </>
                )}
              </p>
            )}

            {/* trust markers */}
            <ul className="mt-5 space-y-2">
              {[
                { icon: FileText, t: "Every answer opens the passage it came from" },
                { icon: Lock, t: "Row-level security on every record" },
                { icon: KeyRound, t: "Reset links expire after one hour" },
                { icon: Sparkles, t: "Free while the beta runs" },
              ].map(({ icon: Icon, t }, i) => (
                <motion.li
                  key={t}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.07 }}
                  className="flex items-center gap-2.5 text-xs text-muted-foreground"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-surface">
                    <Icon className="size-3 text-primary" />
                  </span>
                  {t}
                </motion.li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border pt-5 text-[11px] text-muted-foreground lg:justify-start">
              <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
              <Link to="/terms" className="transition-colors hover:text-foreground">Terms</Link>
              <Link to="/security" className="transition-colors hover:text-foreground">Security</Link>
              <Link to="/contact" className="transition-colors hover:text-foreground">Contact</Link>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
