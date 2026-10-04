import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Sparkles,
} from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "@/components/ui/theme-toggle";
import ScenePanel from "@/components/auth/ScenePanel";
import { StudySpaceLogo } from "@/components/brand/study-space-logo";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Copy                                                               */
/* ------------------------------------------------------------------ */

const FORM_TITLE = {
  signin: [
    "Welcome back.",
    "Your spaces, review queue and focus log are where you left them.",
  ],
  signup: [
    "Create your account.",
    "Start with one file and a question you actually have to answer.",
  ],
  forgot: [
    "Forgot your password?",
    "We will e-mail you a link that sets a new one. It expires in one hour.",
  ],
  reset: [
    "Choose a new password.",
    "Pick something you have not used on another site.",
  ],
};

/* Left panel caption — slides in and out as the mode changes. */
const SCENE_CAPTION = {
  signin: [
    "Every answer arrives with its receipts.",
    "The citation chips light up as each claim is matched to a page.",
  ],
  signup: [
    "One file becomes a study set.",
    "Upload a reading, get flashcards, a quiz and a plan with page numbers attached.",
  ],
  forgot: [
    "A link, not a phone call.",
    "Single-use reset links that expire in one hour.",
  ],
  reset: [
    "Same account, new password.",
    "Nothing else moves \u2014 your spaces stay exactly where they are.",
  ],
};

/* Measured on our 100-question golden set (see README \u2014 Evaluation Results). */
const EVAL_STATS = [
  { v: "89%", l: "faithfulness" },
  { v: "92%", l: "citation precision" },
  { v: "7%", l: "hallucination rate" },
];

const EASE = [0.22, 1, 0.36, 1];

/* ------------------------------------------------------------------ */
/*  Google mark                                                        */
/* ------------------------------------------------------------------ */

function GoogleIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3.02h3.88c2.27-2.09 3.54-5.17 3.54-8.89z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.27a12 12 0 0 0 0 10.76l4-2.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.11C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
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
      <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/75">
        strength &middot; {s.label}
      </p>
    </div>
  );
}

/** Turn an opaque OAuth failure into something the user can act on. */
function friendlyOAuthError(err) {
  const m = String(err?.message || err || "");
  const low = m.toLowerCase();
  if (/failed to fetch|networkerror|load failed|network request failed|cors/.test(low)) {
    return "Can't reach the sign-in service. Start Docker and Supabase (supabase start) and try again.";
  }
  if (/provider is not enabled|provider.*not.*supported|invalid.+oauth/.test(low)) {
    return "Google sign-in isn't configured yet. Add a Google client ID and secret in Supabase, or use e-mail instead.";
  }
  return m || "Google sign-in failed. You can use e-mail instead.";
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
  const [googleBusy, setGoogleBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);

  const { signIn, signUp, signInWithGoogle, startDemo, resetPassword, updatePassword } =
    useAuth();
  const { error, success } = useToast();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const dark = theme === "dark";

  useEffect(() => {
    setMode(initialMode);
    setErrors({});
  }, [initialMode]);

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
    setErrors((e) => {
      const n = { ...e };
      delete n.email;
      return n;
    });
    return true;
  };

  /** Short fade + expansion, then hand over to the dashboard. */
  const exitTo = (to) => {
    leavingRef.current = true;
    setLeaving(true);
    window.setTimeout(() => navigate(to, { replace: true }), 340);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      if (mode === "signin") {
        if (!checkEmail()) {
          setBusy(false);
          return;
        }
        if (password.length < 8) {
          setErrors({ password: "Passwords need at least 8 characters." });
          setBusy(false);
          return;
        }
        await signIn(email.trim(), password);
        success("Welcome back.");
        exitTo(from);
      } else if (mode === "signup") {
        if (!checkEmail()) {
          setBusy(false);
          return;
        }
        if (strength < 3) {
          setErrors({ password: "Pick something stronger \u2014 at least fair." });
          setBusy(false);
          return;
        }
        if (name.trim().length > 0 && name.trim().length < 2) {
          setErrors({ name: "That name looks too short." });
          setBusy(false);
          return;
        }
        await signUp(email.trim(), password, name.trim() || undefined);
        success("Account created. Check your e-mail to confirm, then sign in.");
        setMode("signin");
      } else if (mode === "forgot") {
        if (!checkEmail()) {
          setBusy(false);
          return;
        }
        await resetPassword(email.trim());
        setSent(true);
        success("Reset link sent.");
      } else if (mode === "reset") {
        if (strength < 3) {
          setErrors({ password: "Pick something stronger \u2014 at least fair." });
          setBusy(false);
          return;
        }
        if (password !== confirm) {
          setErrors({ confirm: "Passwords do not match." });
          setBusy(false);
          return;
        }
        await updatePassword(password);
        success("Password updated. You are signed in.");
        exitTo("/app/dashboard");
      }
    } catch (err) {
      const msg = err.message || "Something went wrong. Please try again.";
      setErrors({ form: msg });
      error(msg);
      if (!leavingRef.current) setBusy(false);
      return;
    }
    if (!leavingRef.current) setBusy(false);
  };

  const demo = async () => {
    setBusy(true);
    setErrors({});
    try {
      await startDemo();
      exitTo("/app/dashboard");
    } catch (err) {
      setErrors({ form: err.message || "Could not start the demo." });
      error(err.message || "Could not start the demo.");
      setBusy(false);
    }
  };

  const google = async () => {
    setErrors({});
    setGoogleBusy(true);
    try {
      // on success the browser leaves for the provider, so busy stays on
      await signInWithGoogle();
    } catch (err) {
      const msg = friendlyOAuthError(err);
      setErrors({ form: msg });
      error(msg);
      setGoogleBusy(false);
    }
  };

  const form = FORM_TITLE[mode];
  const scene = SCENE_CAPTION[mode];
  const busyNow = busy || googleBusy;

  if (!supabaseConfigured) {
    return (
      <div className="auth-page flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <Card className="max-w-md p-6">
          <h1 className="text-lg font-semibold">Supabase isn&apos;t configured</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Copy <code className="font-mono text-xs">.env.example</code> to{" "}
            <code className="font-mono text-xs">.env</code> at the repo root, fill in your
            Supabase URL and anon key, and restart Vite.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      className="auth-page flex min-h-screen bg-background text-foreground"
      animate={leaving ? { opacity: 0, scale: 1.035 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.32, ease: EASE }}
      style={{ transformOrigin: "center center" }}
    >
      {/* ---------------- Left panel: 3D scene ---------------- */}
      <aside className="relative hidden w-[46%] shrink-0 flex-col overflow-hidden border-r border-border lg:flex">
        <div className="relative z-10 flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-8 py-7 xl:px-11">
          {/* StudySpace logo, top of the panel, links home */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="shrink-0"
          >
            <StudySpaceLogo size={30} />
          </motion.div>

          {/* the 3D scene (lazy, with a static fallback) — ScenePanel runs
              its own entrance so the canvas is only ever scaled once */}
          <ScenePanel
            mode={mode}
            dark={dark}
            className="min-h-[240px] flex-1 rounded-[28px] border border-border/70"
          />

          {/* caption — slides out and in when the mode changes */}
          <motion.div
            className="min-h-[96px] shrink-0 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: -22, filter: "blur(6px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: 22, filter: "blur(6px)" }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <p className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                  {scene[0]}
                </p>
                {/* rule redraws from the left on every mode change */}
                <motion.span
                  aria-hidden="true"
                  className="mt-2 block h-px w-full origin-left bg-gradient-to-r from-primary via-accent to-transparent"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.6, delay: 0.12, ease: EASE }}
                />
                <p className="mt-2.5 max-w-[54ch] text-[13px] leading-relaxed text-foreground/80">
                  {scene[1]}
                </p>
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* measured eval numbers, full width of the panel grid */}
          <motion.div
            className="shrink-0 border-y border-foreground/25"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.42, ease: EASE }}
          >
            <dl className="grid grid-cols-3">
              {EVAL_STATS.map((s, i) => (
                <div
                  key={s.l}
                  className={cn(
                    "py-3 pr-3",
                    i > 0 && "border-l border-foreground/20 pl-4"
                  )}
                >
                  <dd className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                    {s.v}
                  </dd>
                  <dt className="mt-1.5 font-mono text-[11px] uppercase leading-tight tracking-[0.13em] text-foreground/75">
                    {s.l}
                  </dt>
                </div>
              ))}
            </dl>
          </motion.div>
          <motion.p
            className="-mt-3 shrink-0 font-mono text-[11px] uppercase tracking-[0.13em] text-foreground/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.52 }}
          >
            Measured on a 100-question eval set
          </motion.p>
        </div>
      </aside>

      {/* ---------------- Right: the form ---------------- */}
      <main className="flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-8">
          {/* explicit way home — the logo does this too, but only one of
              them is visible on a phone, and neither says so */}
          <Link
            to="/"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 py-1.5 text-[13px] font-medium text-foreground/80 shadow-sm backdrop-blur transition-colors hover:border-primary/45 hover:text-foreground"
          >
            <ArrowLeft className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Back to home
          </Link>
          <ThemeToggle size="sm" />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pb-10 pt-2 sm:px-8">
          <div className="w-full max-w-[380px]">
            {/* mobile: full logo centred above the form */}
            <div className="mb-6 flex justify-center lg:hidden">
              <StudySpaceLogo size={30} />
            </div>

            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em]">
              {form[0]}
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-foreground/80">{form[1]}</p>

            <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
              {sent ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-4 text-center"
                >
                  <span className="mx-auto flex size-11 items-center justify-center rounded-full border border-success/35 bg-success/12">
                    <Mail className="size-5 text-success" />
                  </span>
                  <h2 className="mt-4 text-[15px] font-semibold">Check your inbox</h2>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/80">
                    If <span className="font-medium text-foreground">{email.trim()}</span> has
                    an account, a reset link is on its way. It expires in one hour.
                  </p>
                  <div className="mt-5 flex flex-col gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSent(false);
                        setMode("signin");
                      }}
                    >
                      Back to sign in
                    </Button>
                    <button
                      type="button"
                      className="text-xs text-foreground/75 underline-offset-4 hover:text-foreground hover:underline"
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
                        <Label htmlFor="name" className="text-[13px] text-foreground/85">
                          Display name
                        </Label>
                        <Input
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Ada Lovelace"
                          autoComplete="name"
                          aria-invalid={!!errors.name}
                        />
                        {errors.name && (
                          <p role="alert" className="text-xs text-destructive">
                            {errors.name}
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {mode !== "reset" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-[13px] text-foreground/85">
                        E-mail
                      </Label>
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
                      {errors.email && (
                        <p id="email-err" role="alert" className="text-xs text-destructive">
                          {errors.email}
                        </p>
                      )}
                    </div>
                  )}

                  {(mode === "signin" || mode === "signup" || mode === "reset") && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="password" className="text-[13px] text-foreground/85">
                          Password
                        </Label>
                        {mode === "signin" && (
                          <button
                            type="button"
                            onClick={() => switchMode("forgot")}
                            className="text-[12.5px] font-medium text-primary transition-colors hover:underline"
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
                          onKeyUp={(e) =>
                            setCapsOn(e.getModifierState && e.getModifierState("CapsLock"))
                          }
                          onKeyDown={(e) =>
                            setCapsOn(e.getModifierState && e.getModifierState("CapsLock"))
                          }
                          placeholder={
                            mode === "reset"
                              ? "New password"
                              : mode === "signup"
                                ? "At least 8 characters"
                                : "Enter your password"
                          }
                          autoComplete={mode === "signin" ? "current-password" : "new-password"}
                          aria-invalid={!!errors.password}
                          aria-describedby={errors.password ? "password-err" : undefined}
                          className={errors.password && "border-destructive focus-visible:ring-destructive/40 pr-9"}
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-foreground/70 transition-colors hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                      {capsOn && (
                        <p role="status" className="text-xs text-warning">
                          Caps Lock is on.
                        </p>
                      )}
                      {errors.password && (
                        <p id="password-err" role="alert" className="text-xs text-destructive">
                          {errors.password}
                        </p>
                      )}

                      {mode !== "signin" && <StrengthMeter value={strength} />}
                    </div>
                  )}

                  {mode === "reset" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm" className="text-[13px] text-foreground/85">
                        Confirm new password
                      </Label>
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
                      {errors.confirm && (
                        <p role="alert" className="text-xs text-destructive">
                          {errors.confirm}
                        </p>
                      )}
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
                        <li
                          key={t}
                          className={cn(
                            "flex items-center gap-1.5 text-[12px]",
                            ok ? "text-success" : "text-foreground/75"
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-3.5 items-center justify-center rounded-full border",
                              ok ? "border-success/50 bg-success/15" : "border-border"
                            )}
                          >
                            {ok && <Check className="size-2.5" />}
                          </span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}

                  <Button type="submit" className="w-full" disabled={busyNow}>
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
                      className="flex w-full items-center justify-center gap-1.5 text-xs text-foreground/75 transition-colors hover:text-foreground"
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
                <div className="my-4 flex items-center gap-3 text-xs text-foreground/75">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={google}
                    disabled={busyNow}
                    aria-busy={googleBusy}
                  >
                    {googleBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <GoogleIcon className="size-4" />
                    )}
                    Google
                  </Button>
                  <Button variant="outline" onClick={demo} disabled={busyNow}>
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <GraduationCap className="size-4" />
                    )}
                    Demo
                  </Button>
                </div>
              </>
            )}

            {/* mode switch */}
            {!sent && (
              <p className="mt-4 text-center text-[12.5px] text-foreground/80">
                {mode === "signin" && (
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
                )}
                {mode === "signup" && (
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
                {mode === "reset" && (
                  <>
                    Remembered it?{" "}
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
                  transition={{ delay: 0.3 + i * 0.07, duration: 0.3 }}
                  className="flex items-center gap-2.5 text-[12.5px] text-foreground/80"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-surface">
                    <Icon className="size-3 text-primary" />
                  </span>
                  {t}
                </motion.li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border pt-5 text-[12px] text-foreground/75 lg:justify-start">
              <Link to="/privacy" className="transition-colors hover:text-foreground">
                Privacy
              </Link>
              <Link to="/terms" className="transition-colors hover:text-foreground">
                Terms
              </Link>
              <Link to="/security" className="transition-colors hover:text-foreground">
                Security
              </Link>
              <Link to="/contact" className="transition-colors hover:text-foreground">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </main>
    </motion.div>
  );
}
