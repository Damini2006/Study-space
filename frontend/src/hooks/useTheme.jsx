import { useCallback, useEffect, useState } from "react";
import { meApi } from "@/services/api-services";
import { useAuth } from "@/hooks/useAuth";

// `swatch` is the preview colour used by the theme pickers (Settings, AppShell).
export const THEMES = [
  { id: "light", label: "Light", swatch: "#f7f8fc" },
  { id: "dark", label: "Dark", swatch: "#171a2e" },
  { id: "cozy", label: "Cozy", swatch: "#faf3e8" },
  { id: "pastel", label: "Pastel", swatch: "#fbf7ff" },
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
          await meApi.update({ theme: next });
        } catch {
          /* theme still applies locally if the API is unreachable */
        }
      }
    },
    [isAuthenticated]
  );

  return { theme, setTheme, themes: THEMES };
}
