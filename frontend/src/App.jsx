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
  "/": { title: "StudySpace — source-grounded AI study workspace", desc: "Chat with your notes, generate study material, review with spaced repetition." },
  "/auth": { title: "Sign in — StudySpace", desc: "Sign in to your StudySpace workspace." },
  "/app/dashboard": { title: "Dashboard — StudySpace", desc: "Your today view: plan, streaks, spaces and habits." },
  "/app/focus": { title: "Focus — StudySpace", desc: "Pomodoro, ambient sounds, habits and session history." },
  "/app/vision": { title: "Vision Board — StudySpace", desc: "Drag stickies and images on your vision board." },
  "/app/finance": { title: "Finance — StudySpace", desc: "Track spending and see your category breakdown." },
  "/privacy": { title: "Privacy Policy — StudySpace", desc: "How StudySpace handles your data." },
  "/terms": { title: "Terms of Service — StudySpace", desc: "StudySpace terms of service." },
  "/thanks": { title: "Welcome — StudySpace", desc: "Your workspace is ready." },
};

function RouteMeta() {
  const location = useLocation();
  useEffect(() => {
    const meta = PAGE_META[location.pathname] || {
      title: "StudySpace",
      desc: "Source-grounded AI study workspace.",
    };
    document.title = meta.title;
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "description");
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", meta.desc);
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
