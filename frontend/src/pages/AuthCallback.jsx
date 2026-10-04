import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
        // Password-recovery links land here with a hash fragment.
        const hash = window.location.hash || "";
        const isRecovery = /type=recovery|recovery/.test(hash) || url.searchParams.get("type") === "recovery";
        if (alive) navigate(isRecovery ? "/auth?mode=reset" : "/app/dashboard", { replace: true });
      } catch (err) {
        if (alive) setMessage(err.message || "Sign-in failed. Please try again.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
