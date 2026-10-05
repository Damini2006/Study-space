import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarRange,
  FileText,
  Gauge,
  Layers,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Timer,
  Library,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export const NAV_ITEMS = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/study", label: "Study", icon: Layers },
  { to: "/app/planner", label: "Planner", icon: CalendarRange },
  { to: "/app/notes", label: "Notes", icon: FileText },
  { to: "/app/focus", label: "Focus", icon: Timer },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

function score(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 3;
  if (t.includes(q)) return 2;
  // subsequence match
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return 1;
  }
  return 0;
}

const RECENTS_KEY = "ss.palette.recents";
const RECENTS_MAX = 5;

function readRecents() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(id) {
  try {
    const next = [id, ...readRecents().filter((x) => x !== id)].slice(0, RECENTS_MAX);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — recents are a nice-to-have */
  }
}

/** Global command palette (Ctrl/Cmd+K): navigate, open spaces, quick actions. */
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { profile, startDemo, isDemo } = useAuth();
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState(readRecents);
  const inputRef = useRef(null);

  const { data: spaces = [] } = useQuery({
    queryKey: ["spaces"],
    queryFn: () => api.get("/spaces"),
    enabled: open,
  });

  const actions = useMemo(() => {
    const base = [
      ...NAV_ITEMS.map((n) => ({
        id: `nav:${n.to}`,
        group: "Go to",
        label: n.label,
        icon: n.icon,
        run: () => navigate(n.to),
      })),
      {
        id: "action:new-space",
        group: "Actions",
        label: "New study Space",
        icon: Library,
        run: () => navigate("/app/dashboard?new=1"),
      },
      {
        id: "action:due",
        group: "Actions",
        label: "Review due flashcards",
        icon: Layers,
        run: () => navigate("/app/study"),
      },
      {
        id: "action:focus",
        group: "Actions",
        label: "Start a focus session",
        icon: Timer,
        run: () => navigate("/app/focus"),
      },
    ];
    if (profile?.is_admin) {
      base.push({
        id: "nav:/app/admin",
        group: "Go to",
        label: "Admin / Evals",
        icon: ShieldCheck,
        run: () => navigate("/app/admin"),
      });
    }
    const spaceItems = spaces.map((s) => ({
      id: `space:${s.id}`,
      group: "Spaces",
      label: s.title,
      hint: s.subject || undefined,
      icon: Gauge,
      run: () => navigate(`/app/spaces/${s.id}`),
    }));
    const demoItem = isDemo
      ? [
          {
            id: "action:reset-demo",
            group: "Actions",
            label: "Reset demo workspace",
            icon: ShieldCheck,
            run: async () => {
              await startDemo({ reset: true });
              navigate("/app/dashboard");
            },
          },
        ]
      : [];
    return [...base, ...spaceItems, ...demoItem];
  }, [navigate, spaces, profile, startDemo, isDemo]);

  const results = useMemo(() => {
    const scored = actions
      .map((a) => ({ ...a, s: Math.max(score(query, a.label), query ? score(query, a.hint || "") : 0) }))
      .filter((a) => a.s > 0);
    if (query) {
      scored.sort((a, b) => b.s - a.s);
    } else {
      // Empty query: surface recently used commands first, then the default order.
      scored.sort((a, b) => {
        const ra = recents.indexOf(a.id);
        const rb = recents.indexOf(b.id);
        if (ra !== rb) return (ra === -1 ? RECENTS_MAX : ra) - (rb === -1 ? RECENTS_MAX : rb);
        return 0;
      });
    }
    return scored.slice(0, 12);
  }, [actions, query, recents]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setRecents(readRecents());
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const run = useCallback(
    (item) => {
      onClose();
      pushRecent(item.id);
      setRecents(readRecents());
      item.run();
    },
    [onClose]
  );

  return (
    <Dialog open={open} onClose={onClose} title="Command palette" className="max-w-xl p-0" aria-label="Command palette">
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) run(results[0]);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const idx = results.findIndex((r) => r.id === results[0]?.id);
              const next = results[idx + 1];
              if (next) run(next);
            }
          }}
          placeholder="Search pages, spaces and actions…"
          aria-label="Search pages, spaces and actions"
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
      </div>
      <ul className="max-h-72 overflow-y-auto p-2 scrollbar-thin" role="listbox" aria-label="Results">
        {results.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>
        )}
        {results.map((item, i) => {
          const Icon = item.icon;
          return (
            <li key={item.id} role="option" aria-selected={i === 0}>
              <button
                type="button"
                onClick={() => run(item)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2",
                  i === 0 && "bg-surface-2"
                )}
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
                {!query && recents.includes(item.id) && (
                  <span className="text-[10px] uppercase tracking-wide text-primary">Recent</span>
                )}
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.group}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
