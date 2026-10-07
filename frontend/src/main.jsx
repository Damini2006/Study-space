import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "@/App";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageViewTracker from "@/components/PageViewTracker";
import { installGlobalErrorCapture } from "@/lib/clientErrors";
import { initVitalsReporting } from "@/lib/vitals";
import { AuthProvider } from "@/hooks/useAuth";
import { ToastProvider } from "@/components/ui/toast";
import "@/styles/fonts.css";
import "@/styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// As early in the entry point as imports allow: every crash after this
// line is a report, and nothing before it can be caught (imports run
// first — that window is the price of the ordering, not a hole in it).
installGlobalErrorCapture();

// Field performance for the first load: the observers start now, and the
// snapshot itself waits for load, idle, and — when the banner is still
// undecided — the user's answer.
initVitalsReporting();

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
