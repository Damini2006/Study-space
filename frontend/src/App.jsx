import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { motion } from "framer-motion";
import Protected from "@/components/Protected";
import Landing from "@/pages/Landing";
import AuthCallback from "@/pages/AuthCallback";
import NotFound from "@/pages/NotFound";
import CookieBanner from "@/components/layout/CookieBanner";

// Everything behind a route is code-split, so the first paint pulls in
// only what a stranger at / actually sees: Landing, the 404 fallback, the
// OAuth callback (tiny, and someone is waiting on it while it runs), the
// cookie banner, and Protected — the gate every /app route passes
// through. Each route already renders RouteFallback while its chunk
// arrives, so this is the behaviour the secondary routes have always
// had, applied to the rest of them.
const AppShell = lazy(() => import("@/components/layout/AppShell"));
const AuthPage = lazy(() => import("@/pages/Auth"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const Study = lazy(() => import("@/pages/Study"));
const Planner = lazy(() => import("@/pages/Planner"));
const Focus = lazy(() => import("@/pages/Focus"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const VisionBoard = lazy(() => import("@/pages/VisionBoard"));
const Finance = lazy(() => import("@/pages/Finance"));
// Notes carries the rich-text editor: tiptap and its whole ProseMirror
// tree. Notes.jsx is the only module importing either (verified by
// grep — @tiptap and @/lib/editor appear nowhere else), so splitting it
// here takes all of it out of the first load. A stranger at / was paying
// for an editor they cannot reach without signing in first.
const Notes = lazy(() => import("@/pages/Notes"));
const Settings = lazy(() => import("@/pages/Settings"));
const AdminEvals = lazy(() => import("@/pages/AdminEvals"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const ThankYou = lazy(() => import("@/pages/ThankYou"));
const Security = lazy(() => import("@/pages/Security"));
const Contact = lazy(() => import("@/pages/Contact"));
// The page behind a share link. It sits outside /app because it must
// open for a stranger holding the URL — published pages (/s/:slug) and
// invite links (/spaces/shared/:token) spend their credential at the
// API, not this gate.
const SharedSpace = lazy(() => import("@/pages/SharedSpace"));

function RouteFallback() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="mx-auto flex min-h-[50vh] w-full max-w-6xl flex-col justify-center gap-4"
    >
      <div className="h-7 w-48 animate-pulse rounded-md bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}

const PAGE_META = {
  "/": { title: "StudySpace \u2014 source-grounded AI study workspace", desc: "Chat with your notes, generate study material, review with spaced repetition." },
  "/auth": { title: "Sign in \u2014 StudySpace", desc: "Sign in to your StudySpace workspace." },
  "/app/dashboard": { title: "Dashboard \u2014 StudySpace", desc: "Your today view: plan, streaks, spaces and habits." },
  "/app/focus": { title: "Focus \u2014 StudySpace", desc: "Pomodoro, ambient sounds and session history." },
  "/app/vision": { title: "Vision Board \u2014 StudySpace", desc: "Drag stickies and images on your vision board." },
  "/app/finance": { title: "Finance \u2014 StudySpace", desc: "Track spending and see your category breakdown." },
  "/privacy": { title: "Privacy Policy \u2014 StudySpace", desc: "How StudySpace handles your data." },
  "/terms": { title: "Terms of Service \u2014 StudySpace", desc: "StudySpace terms of service." },
  "/thanks": { title: "Welcome \u2014 StudySpace", desc: "Your workspace is ready." },
  "/security": { title: "Security \u2014 StudySpace", desc: "Twenty security hardening controls protecting StudySpace: RLS, IDOR and injection testing, secret scanning, rate limiting and controlled attack testing." },
  "/contact": { title: "Contact \u2014 StudySpace", desc: "E-mail the StudySpace team in Bengaluru, India. Bug reports, security disclosures and partnership enquiries." },
};

const FALLBACK_META = {
  title: "StudySpace",
  desc: "Source-grounded AI study workspace.",
};

function setMeta(name, attr, content) {
  let tag = document.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function RouteMeta() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname.replace(/\/$/, "") || "/";
    const meta = PAGE_META[path] || FALLBACK_META;

    document.title = meta.title;
    setMeta("description", "name", meta.desc);

    // Open Graph + Twitter, per page
    setMeta("og:title", "property", meta.title);
    setMeta("og:description", "property", meta.desc);
    setMeta("og:type", "property", "website");
    setMeta("og:url", "property", window.location.href);
    setMeta("og:image", "property", "/og-image.png");
    setMeta("twitter:card", "name", "summary_large_image");
    setMeta("twitter:title", "name", meta.title);
    setMeta("twitter:description", "name", meta.desc);
    setMeta("twitter:image", "name", "/og-image.png");

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.href);
  }, [location.pathname]);
  return null;
}

export default function App() {
  const location = useLocation();

  // reset scroll on route change (SPA nicety)
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <>
    <RouteMeta />
    <CookieBanner />
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
    <Suspense fallback={<RouteFallback />}>
    <Routes location={location}>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/thanks" element={<ThankYou />} />
      <Route path="/security" element={<Security />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/s/:slug" element={<SharedSpace />} />
      <Route path="/spaces/shared/:token" element={<SharedSpace />} />
      <Route
        path="/app"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="spaces/:spaceId" element={<Workspace />} />
        <Route path="study" element={<Study />} />
        <Route path="planner" element={<Planner />} />
        <Route path="notes" element={<Notes />} />
        <Route path="focus" element={<Focus />} />
        <Route path="vision" element={<VisionBoard />} />
        <Route path="finance" element={<Finance />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin" element={<AdminEvals />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
    </motion.div>
    </>
  );
}
