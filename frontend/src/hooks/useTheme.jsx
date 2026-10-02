import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export const THEMES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "cozy", label: "Cozy" },
  { id: "pastel", label: "Pastel" },
];

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

/**
 * Theme is stored per user (profiles.theme) and mirrored to localStorage so it
 * can be applied before first paint (see index.html inline script).
 */
export function useTheme() {
  const { profile, isAuthenticated } = useAuth();
  const [theme, setThemeState] = useState(currentTheme);

  useEffect(() => {
    if (profile?.theme && profile.theme !== theme) {
      setThemeState(profile.theme);
      document.documentElement.setAttribute("data-theme", profile.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.theme]);

  const setTheme = useCallback(
    async (next) => {
      setThemeState(next);
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("studyspace.theme", next);
      } catch {
        /* ignore */
      }
      if (isAuthenticated) {
        try {
          await api.patch("/me", { theme: next });
        } catch {
          /* theme still applies locally if the API is unreachable */
        }
      }
    },
    [isAuthenticated]
  );

  return { theme, setTheme, themes: THEMES };
}
