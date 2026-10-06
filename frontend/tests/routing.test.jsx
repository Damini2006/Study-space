import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Protected from "@/components/Protected";

/**
 * Nothing in the suite previously rendered a real router, which is exactly
 * where a major upgrade would have broken things. The gate is the part worth
 * pinning: it is what stands between a URL and the workspace behind it.
 *
 * The gate is mounted inside a route table rather than on its own, because
 * that is how it ships — on /auth the route renders AuthPage and Protected is
 * unmounted. Left mounted across the redirect it would keep re-issuing the
 * same navigation with a fresh state object on every pass.
 */

const session = vi.hoisted(() => ({
  current: { isAuthenticated: true, initialising: false },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => session.current }));

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="state">{JSON.stringify(location.state ?? null)}</div>
    </>
  );
}

function renderGate({ isAuthenticated, initialising, at }) {
  session.current = { isAuthenticated, initialising };
  return render(
    <MemoryRouter initialEntries={[at]}>
      <LocationProbe />
      <Routes>
        <Route
          path="/app/*"
          element={
            <Protected>
              <div data-testid="workspace">workspace</div>
            </Protected>
          }
        />
        <Route path="/auth" element={<div data-testid="signin">sign in</div>} />
        <Route path="*" element={<div data-testid="missing">nope</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Protected", () => {
  it("lets a signed-in visitor straight through to the page they asked for", () => {
    renderGate({ isAuthenticated: true, initialising: false, at: "/app/notes" });

    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent("/app/notes");
  });

  it("sends an anonymous visitor to /auth without ever showing the workspace", () => {
    renderGate({ isAuthenticated: false, initialising: false, at: "/app/notes" });

    expect(screen.queryByTestId("workspace")).toBeNull();
    expect(screen.getByTestId("signin")).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent("/auth");
  });

  it("carries the path they were after, including nested ones", () => {
    renderGate({
      isAuthenticated: false,
      initialising: false,
      at: "/app/spaces/abc123",
    });

    expect(screen.getByTestId("state")).toHaveTextContent(
      '{"from":"/app/spaces/abc123"}'
    );
  });

  it("can only ever carry an internal path", () => {
    // `from` is written by this gate and, if anything starts honouring it,
    // will be handed straight to navigate(). A pathname cannot be an
    // absolute URL and cannot be protocol-relative, so there is no shape of
    // input that could walk off the site.
    renderGate({
      isAuthenticated: false,
      initialising: false,
      at: "/app/spaces/abc123",
    });

    const { from } = JSON.parse(screen.getByTestId("state").textContent);
    expect(from.startsWith("/")).toBe(true);
    expect(from.startsWith("//")).toBe(false);
    expect(from).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
  });

  it("holds rather than bouncing a signed-in user to /auth for a frame", () => {
    renderGate({ isAuthenticated: false, initialising: true, at: "/app/notes" });

    expect(screen.queryByTestId("workspace")).toBeNull();
    expect(screen.getByTestId("path")).toHaveTextContent("/app/notes");
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });
});
