import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import AppShell from "@/components/layout/AppShell";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Workspace from "@/pages/Workspace";
import Study from "@/pages/Study";
import Planner from "@/pages/Planner";
import Notes from "@/pages/Notes";
import Focus from "@/pages/Focus";
import Analytics from "@/pages/Analytics";
import VisionBoard from "@/pages/VisionBoard";
import Finance from "@/pages/Finance";
import Settings from "@/pages/Settings";
import AdminEvals from "@/pages/AdminEvals";
import AuthCallback from "@/pages/AuthCallback";
import NotFound from "@/pages/NotFound";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import ThankYou from "@/pages/ThankYou";
import Security from "@/pages/Security";
import Contact from "@/pages/Contact";
import CookieBanner from "@/components/layout/CookieBanner";

function Protected({ children }) {
  const { isAuthenticated, initialising } = useAuth();
  const location = useLocation();
  if (initialising) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" aria-label="Loading" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }
  return children;
}

const PAGE_META = {
  "/": { title: "StudySpace \u2014 source-grounded AI study workspace", desc: "Chat with your notes, generate study material, review with spaced repetition." },
  "/auth": { title: "Sign in \u2014 StudySpace", desc: "Sign in to your StudySpace workspace." },
  "/app/dashboard": { title: "Dashboard \u2014 StudySpace", desc: "Your today view: plan, streaks, spaces and habits." },
  "/app/focus": { title: "Focus \u2014 StudySpace", desc: "Pomodoro, ambient sounds, habits and session history." },
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
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/thanks" element={<ThankYou />} />
      <Route path="/security" element={<Security />} />
      <Route path="/contact" element={<Contact />} />
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
    </>
  );
}
