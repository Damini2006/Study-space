import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarRange,
  ChevronDown,
  FileText,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Palette,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Timer,
  X,
  BarChart3,
  Flame,
  Image,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme, THEMES } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { useCommandPalette } from "@/components/layout/CommandPalette";
import CommandPalette from "@/components/layout/CommandPalette";
import { initials } from "@/lib/utils";

const NAV = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/study", label: "Study", icon: Layers },
  { to: "/app/planner", label: "Planner", icon: CalendarRange },
  { to: "/app/notes", label: "Notes", icon: FileText },
  { to: "/app/focus", label: "Focus", icon: Timer },
  { to: "/app/vision", label: "Vision Board", icon: Image },
  { to: "/app/finance", label: "Finance", icon: Wallet },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

const THEME_ICONS = { light: Sun, dark: Moon, cozy: Flame, pastel: Palette };

/** Shell-shaped placeholder shown while a lazily-loaded route chunk arrives. */
function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-5">
      <div className="h-7 w-52 animate-pulse rounded-md bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-surface-2" />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}

function ThemeDot({ id }) {
  const colors = {
    light: "#f7f8fc",
    dark: "#171a2e",
    cozy: "#faf3e8",
    pastel: "#fbf7ff",
  };
  return (
    <span
      className="inline-block size-3 rounded-full border border-border"
      style={{ background: colors[id] }}
      aria-hidden
    />
  );
}

export default function AppShell() {
  const { profile, signOut, isDemo } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [themeMenu, setThemeMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const palette = useCommandPalette();

  // header gains a border/shadow once the page scrolls
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // close mobile nav on navigation
  useEffect(() => {
    setMobileOpen(false);
    setThemeMenu(false);
  }, [location.pathname]);

  // close theme menu on outside click
  const navRef = useRef(null);
  useEffect(() => {
    if (!themeMenu) return undefined;
    const handler = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setThemeMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [themeMenu]);

  // `animated` — only the visible sidebar should own the sliding pill;
  // the mobile drawer (mounted over the hidden desktop sidebar) uses a
  // plain active style so two layoutId owners never coexist.
  const buildNav = (animated) => (
    <nav className="flex flex-col gap-1" aria-label="Main navigation">
      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
        Workspace
      </p>
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
              isActive
                ? animated
                  ? "text-primary"
                  : "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && animated && (
                <motion.span
                  layoutId="nav-active-pill"
                  className="absolute inset-0 rounded-xl bg-primary/10"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  aria-hidden
                />
              )}
              <span className="relative flex items-center gap-3">
                <Icon className="size-4" aria-hidden />
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
      {profile?.is_admin && (
        <NavLink
          to="/app/admin"
          className={({ isActive }) =>
            cn(
              "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
              isActive
                ? animated
                  ? "text-primary"
                  : "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && animated && (
                <motion.span
                  layoutId="nav-active-pill"
                  className="absolute inset-0 rounded-xl bg-primary/10"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  aria-hidden
                />
              )}
              <span className="relative flex items-center gap-3">
                <ShieldCheck className="size-4" aria-hidden />
                Admin / Evals
              </span>
            </>
          )}
        </NavLink>
      )}
    </nav>
  );

  const navLinks = buildNav(true);

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-border bg-surface lg:flex lg:flex-col">
        <div className="flex items-center gap-3 border-b border-border px-5 py-5">
          <div className="brand-gradient flex size-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm">
            SS
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">StudySpace</div>
            <div className="text-[11px] text-muted-foreground">
              {isDemo ? "Demo workspace" : profile?.display_name || "Workspace"}
            </div>
          </div>
        </div>
        <div className="flex-1 p-4">{navLinks}</div>
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={() => palette.setOpen(true)}
            className="mb-2 flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-border/40"
          >
            <Search className="size-3.5" aria-hidden />
            <span className="flex-1">Search</span>
            <kbd className="rounded border border-border bg-card px-1 text-[10px]">⌘K</kbd>
          </button>

          {/* Theme picker */}
          <div className="relative" ref={navRef}>
            <button
              type="button"
              onClick={() => setThemeMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={themeMenu}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <Palette className="size-4" aria-hidden />
              <span className="flex-1 text-left capitalize">{theme}</span>
              <ChevronDown className="size-3.5" aria-hidden />
            </button>
            {themeMenu && (
              <div
                role="menu"
                aria-label="Theme"
                className="absolute inset-x-0 bottom-full mb-1 rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-md)]"
              >
                {THEMES.map((t) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={theme === t.id}
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2",
                      theme === t.id && "text-primary"
                    )}
                  >
                    <ThemeDot id={t.id} />
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className={cn(
          "sticky top-0 z-30 flex items-center gap-2 border-b px-3 py-2.5 backdrop-blur transition-shadow lg:hidden",
          scrolled ? "border-border bg-surface/85 shadow-[var(--shadow-sm)]" : "border-transparent bg-surface/95"
        )}>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2"
          >
            <Menu className="size-5" />
          </button>
          <div className="brand-gradient flex size-8 items-center justify-center rounded-lg text-xs font-bold text-white">
            SS
          </div>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold">StudySpace</div>
          <button
            type="button"
            onClick={() => palette.setOpen(true)}
            aria-label="Search"
            className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2"
          >
            <Search className="size-5" />
          </button>
        </header>

        {/* Desktop title bar (subtle) */}
        <header className={cn(
          "hidden items-center gap-3 border-b bg-surface/80 px-8 py-4 backdrop-blur-xl transition-all lg:flex",
          scrolled ? "border-border shadow-[var(--shadow-sm)]" : "border-transparent"
        )}>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {isDemo ? (
                <>
                  <span className="mr-1.5 inline-block rounded-full bg-info-bg px-2 py-0.5 align-middle text-[10px] font-semibold uppercase text-info">Demo</span>
                  Demo workspace — data can be reset from the command palette
                </>
              ) : (
              <>Signed in as <span className="font-medium text-foreground">{profile?.email}</span></>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => palette.setOpen(true)}
            className="flex w-64 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground hover:bg-border/30"
          >
            <Search className="size-4" aria-hidden />
            <span className="flex-1 text-left">Search or jump to…</span>
            <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px]">⌘K</kbd>
          </button>
          <span
            className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            title={profile?.email || "You"}
            aria-label={`Account ${profile?.display_name || ""}`}
          >
            {initials(profile?.display_name || profile?.email || "S")}
          </span>
        </header>

        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-on-primary focus:shadow-lg"
        >
          Skip to main content
        </a>

        <main id="main-content" className="min-w-0 flex-1 px-4 py-6 pb-24 lg:px-10 lg:pb-10" tabIndex={-1}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface px-1 pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden"
          aria-label="Mobile navigation"
        >
          {NAV.slice(0, 5).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[min(300px,84vw)] border-r border-border bg-surface p-4 lg:hidden"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "tween", duration: 0.18 }}
              aria-label="Mobile navigation"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold">StudySpace</div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2"
                >
                  <X className="size-4" />
                </button>
              </div>
              {buildNav(false)}
              <div className="mt-4 border-t border-border pt-3">
                <div className="text-xs font-medium text-muted-foreground">Theme</div>
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id)}
                      aria-pressed={theme === t.id}
                      title={t.label}
                      className={cn(
                        "rounded-lg border p-2 text-[10px]",
                        theme === t.id ? "border-primary text-primary" : "border-border text-muted-foreground"
                      )}
                    >
                      <ThemeDot id={t.id} />
                      <span className="mt-1 block">{t.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    navigate("/");
                  }}
                  className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2"
                >
                  <LogOut className="size-4" aria-hidden /> Sign out
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
    </div>
  );
}
