import { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { useLocation } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
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
