/**
 * Fires a GA page_view on every SPA navigation (no-op until VITE_GA_ID is set).
 *
 * Lives in its own file rather than in `main.jsx`: a module that defines a
 * component but exports nothing can't participate in Fast Refresh, so HMR
 * would have to reload the whole entry point just to update this.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function PageViewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (window.gtag && import.meta.env.VITE_GA_ID) {
      window.gtag("event", "page_view", { page_path: pathname });
    }
  }, [pathname]);
  return null;
}
