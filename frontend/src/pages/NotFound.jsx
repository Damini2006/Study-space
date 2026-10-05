import { useLocation } from "react-router-dom";
import { Compass, LayoutDashboard, Layers } from "lucide-react";

const SUGGESTIONS = [
  { to: "/app/dashboard", label: "Dashboard", hint: "Today's plan, streaks and spaces", icon: LayoutDashboard },
  { to: "/app/study", label: "Study", hint: "Review due flashcards", icon: Layers },
  { to: "/app/planner", label: "Planner", hint: "Calendar, tasks and habits", icon: Compass },
];

export default function NotFound() {
  const location = useLocation();
  const notFound = location.pathname.startsWith("/app");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
        <SearchX className="size-7" aria-hidden />
      </span>
      <div>
        <p className="text-6xl font-black tracking-tight brand-text">404</p>
        <h1 className="mt-1 text-xl font-semibold">Page not found</h1>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        Nothing lives at <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{location.pathname}</code>.
        The page may have moved, or the link is wrong.
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        <Link to="/">
          <Button variant="outline">
            <ArrowLeft className="size-4" aria-hidden /> Home
          </Button>
        </Link>
        <Link to="/app/dashboard">
          <Button>Go to Dashboard</Button>
        </Link>
      </div>

      <div className="mt-2 w-full max-w-md space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {notFound ? "Jump back in" : "Popular places"}
        </p>
        <ul className="space-y-1.5">
          {SUGGESTIONS.map(({ to, label, hint, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
