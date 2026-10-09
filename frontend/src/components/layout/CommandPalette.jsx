import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Gauge,
  Layers,
  Search,
  ShieldCheck,
  Timer,
  Library,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { spacesApi } from "@/services/api-services";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { NAV_ITEMS } from "@/components/layout/use-command-palette";

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
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listboxId = useId();

  const { data: spaces = [] } = useQuery({
    queryKey: ["spaces"],
    queryFn: () => spacesApi.list(),
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

  // Focus stays in the input throughout, so which row is "under the cursor"
  // has to be tracked here and handed to the input as aria-activedescendant.
  // Clamped, because the list can shrink out from under the index.
  const active = Math.min(activeIndex, Math.max(results.length - 1, 0));

  useEffect(() => {
    setActiveIndex(0);
  }, [query, results.length]);

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
    <Dialog open={open} onClose={onClose} title="Command palette" className="max-w-xl p-0">
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Focus never leaves this field: the active row is handed to
            // assistive tech through aria-activedescendant, so these keys
            // move a cursor rather than focus. Enter runs the row it lands
            // on. Home and End stay with the text, where they move the caret.
            if (e.key === "Enter") {
              e.preventDefault();
              if (results[active]) run(results[active]);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (results.length > 0) {
                setActiveIndex((i) => (i + 1) % results.length);
              }
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              if (results.length > 0) {
                setActiveIndex((i) => (i - 1 + results.length) % results.length);
              }
            }
          }}
          placeholder="Search pages, spaces and actions…"
          aria-label="Search pages, spaces and actions"
          role="combobox"
          aria-expanded
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            results[active] ? `${listboxId}-opt-${active}` : undefined
          }
          className="h-12 flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
        />
        <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
      </div>
      <ul
        id={listboxId}
        role="listbox"
        aria-label="Results"
        className="max-h-72 overflow-y-auto p-2 scrollbar-thin"
      >
        {results.length === 0 && (
          <li
            role="presentation"
            className="px-3 py-6 text-center text-sm text-muted-foreground"
          >
            No matches
          </li>
        )}
        {results.map((item, i) => {
          const Icon = item.icon;
          return (
            <li
              key={item.id}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onClick={() => run(item)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-2",
                i === active && "bg-surface-2"
              )}
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
              {!query && recents.includes(item.id) && (
                <span className="text-[10px] uppercase tracking-wide text-primary">Recent</span>
              )}
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.group}</span>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

