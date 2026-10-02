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
        if (alive) navigate("/app/dashboard", { replace: true });
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
