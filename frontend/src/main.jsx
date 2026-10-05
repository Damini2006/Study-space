import React from "react";
import { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "@/App";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AuthProvider } from "@/hooks/useAuth";
import { ToastProvider } from "@/components/ui/toast";
import "@/styles/globals.css";

// Fires a GA page_view on every SPA navigation (no-op until VITE_GA_ID is set)
function PageViewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (window.gtag && import.meta.env.VITE_GA_ID) {
      window.gtag("event", "page_view", { page_path: pathname });
    }
  }, [pathname]);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <PageViewTracker />
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// Offline support. The worker lives in `public/` so it's served unbundled from
// the site root — a hashed asset URL would 404 since SW scope must be "/".
// Registration itself is driven by the useServiceWorker hook; this block only
// warms it up as early as possible so the first navigation is already covered.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {
      /* offline support unavailable — the app still works online */
    });
  });
}
