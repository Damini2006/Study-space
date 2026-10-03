import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, GraduationCap, Loader2 } from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

function FloatingParticle({ delay = 0, x = 0, y = 0, size = 4, color = "#4f5bd5" }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, backgroundColor: color }}
      animate={{
        y: [0, -20, 0],
        x: [0, 10, 0],
        opacity: [0.2, 0.6, 0.2],
        scale: [1, 1.2, 1],
      }}
      transition={{
        duration: 4 + delay,
        repeat: Infinity,
        ease: "easeInOut",
        delay: delay,
      }}
    />
  );
}

function ThreeDPanel() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 100, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 100, damping: 20 });
  const rotateX = useTransform(springY, [-0.5, 0.5], [15, -15]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-15, 15]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const rect = document.getElementById("auth-panel-area")?.getBoundingClientRect();
      if (rect) {
        mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
        mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div id="auth-panel-area" className="relative w-full h-full flex items-center justify-center" style={{ perspective: 800 }}>
      {/* Background glow */}
      <motion.div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: "radial-gradient(ellipse at center, rgba(79,91,213,0.15) 0%, transparent 70%)",
        }}
        animate={{
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Floating particles */}
      <FloatingParticle delay={0} x={20} y={30} size={4} color="#4f5bd5" />
      <FloatingParticle delay={1} x={70} y={20} size={3} color="#e8749a" />
      <FloatingParticle delay={2} x={40} y={70} size={5} color="#2fb5a0" />
      <FloatingParticle delay={0.5} x={80} y={60} size={3} color="#8b6fd6" />
      <FloatingParticle delay={1.5} x={15} y={80} size={4} color="#f2b14a" />
      <FloatingParticle delay={2.5} x={60} y={40} size={2} color="#5aa9e6" />

      {/* 3D Card */}
      <motion.div
        className="relative z-10"
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      >
        <motion.div
          className="w-32 h-40 sm:w-36 sm:h-44 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 via-surface to-accent/20 backdrop-blur-xl flex flex-col items-center justify-center gap-3 shadow-[0_0_40px_rgba(79,91,213,0.2)]"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          {/* Logo */}
          <motion.div
            className="brand-gradient flex size-12 items-center justify-center rounded-xl text-lg font-extrabold text-white shadow-lg"
            animate={{
              rotateY: [0, 360],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{ transformStyle: "preserve-3d" }}
          >
            SS
          </motion.div>

          {/* Text */}
          <div className="text-center">
            <p className="text-sm font-bold text-white">StudySpace</p>
            <p className="text-xs text-muted-foreground mt-0.5">AI Study Workspace</p>
          </div>

          {/* Decorative ring */}
          <motion.div
            className="absolute -inset-2 rounded-3xl border border-primary/10"
            animate={{
              scale: [1, 1.05, 1],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>

        {/* Reflection */}
        <motion.div
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-24 h-4 rounded-full bg-primary/20 blur-md"
          animate={{
            opacity: [0.3, 0.5, 0.3],
            scaleX: [0.8, 1, 0.8],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Feature highlights */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6">
        {[
          { icon: "📄", label: "Cited" },
          { icon: "🔐", label: "Safe" },
          { icon: "📊", label: "Smart" },
        ].map((f, i) => (
          <motion.div
            key={f.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 + i * 0.2 }}
            className="flex flex-col items-center gap-1"
          >
            <span className="text-lg">{f.icon}</span>
            <span className="text-xs text-muted-foreground">{f.label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const { signIn, signUp, signInWithGoogle, startDemo } = useAuth();
  const { error, success } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from || "/app/dashboard";

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || password.length < 8) {
      error("Enter a valid email and a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email.trim(), password, name.trim() || undefined);
        success("Account created — check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        await signIn(email.trim(), password);
        success("Welcome back!");
        navigate(from, { replace: true });
      }
    } catch (err) {
      error(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    try {
      await startDemo();
      navigate("/app/dashboard", { replace: true });
    } catch (err) {
      error(err.message);
      setBusy(false);
    }
  };

  if (!supabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md p-6">
          <h1 className="text-lg font-semibold">Supabase isn't configured</h1>
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
      {/* Left 3D Panel - hidden on mobile */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden border-r border-border">
        <ThreeDPanel />
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <Link to="/" className="mb-6 flex items-center gap-2">
            <span className="brand-gradient flex size-8 items-center justify-center rounded-xl text-xs font-bold text-white">SS</span>
            <span className="text-base font-bold">StudySpace</span>
          </Link>

          <Card className="p-6">
            <motion.h1
              key={mode}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl font-bold tracking-tight"
            >
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </motion.h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signin" ? "Sign in to your study workspace." : "Start your source-grounded study habit."}
            </p>

            <form onSubmit={submit} className="mt-5 space-y-3">
              {mode === "signup" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-1.5"
                >
                  <Label htmlFor="name">Display name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" autoComplete="name" />
                </motion.div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
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
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => signInWithGoogle()} disabled={busy}>
                Google
              </Button>
              <Button variant="secondary" onClick={demo} disabled={busy}>
                <GraduationCap className="size-4" />
                Demo
              </Button>
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              {mode === "signin" ? (
                <>
                  New here?{" "}
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode("signup")}>
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode("signin")}>
                    Sign in
                  </button>
                </>
              )}
            </p>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}