import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  FileText,
  Layers,
  LayoutDashboard,
  Settings,
  Timer,
} from "lucide-react";

/**
 * Destinations shared by the sidebar, the mobile bottom nav and the command
 * palette.
 *
 * This lives in its own module — separate from `CommandPalette.jsx` — because
 * React Fast Refresh reloads every importer of an edited file. The app shell
 * imports the hook below, so keeping them together meant a tweak to the palette
 * markup remounted the whole workspace shell.
 */
export const NAV_ITEMS = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/study", label: "Study", icon: Layers },
  { to: "/app/planner", label: "Planner", icon: CalendarRange },
  { to: "/app/notes", label: "Notes", icon: FileText },
  { to: "/app/focus", label: "Focus", icon: Timer },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

/**
 * Open/close state for the global command palette plus its Ctrl/Cmd+K binding.
 *
 * Only one listener is ever attached because the hook itself is rendered once,
 * by the app shell.
 */
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
