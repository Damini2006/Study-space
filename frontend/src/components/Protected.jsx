import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Gate for everything mounted under `/app`.
 *
 * While the session is still resolving there is nothing to decide yet, so we
 * hold on a spinner rather than bouncing a signed-in user to /auth for a
 * frame. Once we know, an anonymous visitor is replaced (not pushed) with
 * /auth, and the path they were actually after is left in location.state as
 * `from` — a pathname, which is why it is safe to carry around: it can only
 * ever have come from the router.
 */
export default function Protected({ children }) {
  const { isAuthenticated, initialising } = useAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
          aria-label="Loading"
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return children;
}
