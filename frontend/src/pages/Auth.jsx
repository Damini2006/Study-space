import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, GraduationCap, Loader2 } from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export default function AuthPage() {
  const [mode, setMode] = useState("signin"); // signin | signup
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <span className="brand-gradient flex size-8 items-center justify-center rounded-lg text-xs font-bold text-white">SS</span>
          <span className="text-lg font-bold">StudySpace</span>
        </Link>
        <Card className="p-6">
          <h1 className="text-xl font-bold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to your study workspace." : "Start your source-grounded study habit."}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" autoComplete="name" />
              </div>
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
      </div>
    </div>
  );
}
