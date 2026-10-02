import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surface misconfiguration immediately instead of failing on first request.
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env and fill in your Supabase project values."
  );
}

/**
 * Supabase Auth client (email/password + Google OAuth).
 * The anon key is public by design — data access is protected by RLS,
 * and the FastAPI backend only accepts verified JWTs.
 */
export const supabase = createClient(url ?? "http://localhost:54321", anonKey ?? "anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "studyspace.auth",
  },
});

export const supabaseConfigured = Boolean(url && anonKey);
