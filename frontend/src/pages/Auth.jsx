import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Left visual panel                                                  */
/* ------------------------------------------------------------------ */

function SourceCard({ delay, page, section, lines, className, rotate }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotate: rotate - 4 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn("w-[260px] rounded-lg border border-white/12 bg-white/[0.045] p-3.5 backdrop-blur-md", className)}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">
          <FileText className="size-3" />
          {section}
        </span>
        <span className="font-mono text-[9px] text-white/35">{page}</span>
      </div>
      <div className="mt-3 space-y-1.5">
        {lines.map((w, i) => (
          <motion.div
            key={i}
            className="h-1.5 origin-left rounded-full bg-white/12"
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

function VisualPanel() {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onMove = (e) => {
      const r = node.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      node.style.setProperty("--rx", `${(-py * 7).toFixed(2)}deg`);
      node.style.setProperty("--ry", `${(px * 9).toFixed(2)}deg`);
    };
    const onLeave = () => {
      node.style.setProperty("--rx", "0deg");
      node.style.setProperty("--ry", "0deg");
    };
    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseleave", onLeave);
    return () => {
      node.removeEventListener("mousemove", onMove);
      node.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative h-full w-full overflow-hidden bg-[#0d1526]"
      style={{ "--rx": "0deg", "--ry": "0deg" }}
    >
      {/* background field */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/40 blur-[110px]" />
        <div className="absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-accent/30 blur-[110px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:radial-gradient(70%_60%_at_45%_40%,#000,transparent)]" />
      </div>

      {/* floating specs */}
      {[
        [12, 22, 4, "#4f5bd5", 0],
        [78, 18, 3, "#e8749a", 1.2],
        [30, 74, 5, "#2fb5a0", 2.1],
        [86, 66, 3, "#f2b14a", 0.6],
        [58, 44, 2, "#8b6fd6", 1.7],
        [8, 58, 3, "#5aa9e6", 2.6],
      ].map(([x, y, s, c, d], i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute rounded-full"
          style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, background: c }}
          animate={{ y: [0, -18, 0], opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 5 + d, repeat: Infinity, ease: "easeInOut", delay: d }}
        />
      ))}

      {/* 3D stack */}
      <div className="relative flex h-full items-center justify-center px-8">
        <div
          className="relative"
          style={{
            transform: "rotateX(var(--rx)) rotateY(var(--ry))",
            transformStyle: "preserve-3d",
            transition: "transform 350ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <div className="space-y-4" style={{ perspective: 900 }}>
            <SourceCard
              delay={0.15}
              rotate={-2.5}
              page="p.14"
              section="3.2 Adiabatic work"
              lines={[96, 88, 74, 92, 60]}
              className="origin-bottom-right"
            />
            <motion.div
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative mx-auto w-[290px] rounded-lg border border-white/15 bg-white/[0.07] p-4 backdrop-blur-xl shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-emerald-300/30 bg-emerald-300/15">
                  <CircleCheck className="size-3 text-emerald-300" />
                </span>
                <p className="text-[13px] leading-relaxed text-white/85">
                  The gas does work at the expense of its own internal energy, so temperature falls
                  while the surroundings remain unchanged.
                  <span className="ml-1 inline-flex translate-y-[1px] rounded border border-primary-soft/40 bg-primary-soft/20 px-1 py-px font-mono text-[9px] text-white">
                    1
                  </span>
                </p>
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-white/10 pt-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">
                <span>coverage 100%</span>
                <span className="h-3 w-px bg-white/15" />
                <span>0 claims added</span>
              </div>
            </motion.div>
            <SourceCard
              delay={0.55}
              rotate={2}
              page="p.21"
              section="Worked example 4"
              lines={[84, 66, 90, 52]}
              className="origin-top-left ml-6"
            />
          </div>
        </div>
      </div>

      {/* headline */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.6 }}
        className="absolute inset-x-0 bottom-0 px-8 pb-8"
      >
        <p className="max-w-sm text-lg font-medium leading-snug tracking-tight text-white">
          Nothing gets asserted without a page number behind it.
        </p>
        <div className="mt-5 grid max-w-sm grid-cols-3 divide-x divide-white/10 border-y border-white/10">
          {[["4", "layers"], ["0", "guesses"], ["FSRS", "schedule"]].map(([v, l]) => (
            <div key={l} className="py-2.5 pl-3 first:pl-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">{l}</p>
              <p className="text-base font-semibold leading-tight text-white">{v}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function AuthPage() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const { signIn, signUp, signInWithGoogle, startDemo } = useAuth();
  const { error, success } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from || "/app/dashboard";

  const switchMode = (next) => {
    setMode(next);
    setErrors({});
  };

  const validate = () => {
    const e = {};
    if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid e-mail address.";
    if (password.length < 8) e.password = "Passwords need at least 8 characters.";
    if (mode === "signup" && name.trim().length > 0 && name.trim().length < 2) {
      e.name = "That name looks too short.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setErrors({});
    try {
      if (mode === "signup") {
        await signUp(email.trim(), password, name.trim() || undefined);
        success("Account created. Check your e-mail to confirm, then sign in.");
        setMode("signin");
      } else {
        await signIn(email.trim(), password);
        success("Welcome back.");
        navigate(from, { replace: true });
      }
    } catch (err) {
      setErrors({ form: err.message || "Something went wrong. Please try again." });
      error(err.message || "Something went wrong. Please try again.");
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
      <aside className="relative hidden w-[46%] shrink-0 lg:block">
        <VisualPanel />
        <Link
          to="/"
          className="absolute left-8 top-7 z-10 flex items-center gap-2 rounded-md border border-white/12 bg-white/5 px-2.5 py-1.5 text-[13px] text-white/70 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
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

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[380px]"
          >
            <div className="hidden items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground lg:flex">
              <span className="text-primary">{mode === "signin" ? "01" : "02"}</span>
              <span className="h-px w-8 bg-border" />
              <span>{mode === "signin" ? "Sign in" : "Create account"}</span>
            </div>

            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em]">
              {mode === "signin" ? "Welcome back." : "Start with one file."}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {mode === "signin"
                ? "Your spaces, review queue and focus log are where you left them."
                : "Create a workspace, upload something you have to read, and ask it a question."}
            </p>

            <div className="mt-6 rounded-xl border border-border bg-card p-5">
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
                      <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] leading-snug text-destructive">
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

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === "signin" && (
                      <span className="text-[11px] text-muted-foreground">min. 8 characters</span>
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
                      placeholder="At least 8 characters"
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
                  {errors.password && <p id="password-err" role="alert" className="text-xs text-destructive">{errors.password}</p>}
                </div>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {mode === "signin" ? "Sign in" : "Create account"}
                  {!busy && <ArrowRight className="size-4" />}
                </Button>
              </form>

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

              <p className="mt-4 text-center text-xs text-muted-foreground">
                {mode === "signin" ? (
                  <>
                    New here?{" "}
                    <button
                      type="button"
                      className="font-medium text-primary transition-colors hover:underline"
                      onClick={() => switchMode("signup")}
                    >
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="font-medium text-primary transition-colors hover:underline"
                      onClick={() => switchMode("signin")}
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>

            {/* trust markers */}
            <ul className="mt-5 space-y-2">
              {[
                { icon: FileText, t: "Every answer opens the passage it came from" },
                { icon: Lock, t: "Row-level security on every record" },
                { icon: Sparkles, t: "Free while the beta runs" },
              ].map(({ icon: Icon, t }, i) => (
                <motion.li
                  key={t}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
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
