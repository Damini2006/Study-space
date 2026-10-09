import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/ui/toast";
import App from "@/App";
import PublishDialog from "@/components/workspace/PublishDialog";
import ShareDialog from "@/components/workspace/ShareDialog";

/**
 * Share links used to end at the 404 page twice over: neither `/s/:slug`
 * nor `/spaces/shared/:token` existed as a route, and the dialog copy
 * promised things (an origin that matched nothing, role capabilities the
 * link never delivers) the app had no way to honour.
 *
 * These tests pin both ends: the routes resolve to the viewer that spends
 * the credential at the API, and the two dialogs only promise what the
 * code behind them actually does.
 */

const spacesApi = vi.hoisted(() => ({
  getPublicSpace: vi.fn(),
  getSharedSpace: vi.fn(),
  listShares: vi.fn(),
  createShare: vi.fn(),
  revokeShare: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
  getPublicInfo: vi.fn(),
}));

vi.mock("@/services/api-services", () => ({ spacesApi }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, initialising: false, user: null }),
}));

const VIEW = {
  space: {
    title: "Biology notes",
    description: "Cell structure and energy.",
    subject: "Biology",
    color: "#88aa55",
    created_at: "2026-01-01T00:00:00Z",
    source_count: 1,
    card_count: 1200,
    note_count: 1,
  },
  sources: [
    {
      title: "Lecture 1",
      type: "markdown",
      status: "ready",
      char_count: 4096,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  cards: [
    { front: "What is ATP?", back: "Energy currency", tags: ["bio"] },
    { front: "Where does glycolysis happen?", back: "Cytoplasm", tags: [] },
  ],
  notes: [
    { title: "Photosynthesis", content_text: "Light reactions make ATP.", pinned: true },
  ],
};

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("the routes behind share links", () => {
  it("opens a published link as the read-only space page", async () => {
    spacesApi.getPublicSpace.mockResolvedValue(VIEW);

    renderAt("/s/bio-notes");

    expect(await screen.findByText("Biology notes")).toBeInTheDocument();
    expect(spacesApi.getPublicSpace).toHaveBeenCalledWith("bio-notes");
    expect(spacesApi.getSharedSpace).not.toHaveBeenCalled();
    expect(screen.getByText("What is ATP?")).toBeInTheDocument();
    expect(screen.getByText("Light reactions make ATP.")).toBeInTheDocument();
    expect(screen.getByText("Lecture 1")).toBeInTheDocument();
    expect(screen.getByText(/Published · read-only/)).toBeInTheDocument();
  });

  it("opens an invite link through the shared endpoint", async () => {
    spacesApi.getSharedSpace.mockResolvedValue(VIEW);

    renderAt("/spaces/shared/tok-abc123");

    expect(await screen.findByText("Biology notes")).toBeInTheDocument();
    expect(spacesApi.getSharedSpace).toHaveBeenCalledWith("tok-abc123");
    expect(screen.getByText(/Shared · read-only/)).toBeInTheDocument();
  });

  it("tells the truth when a published link is dead", async () => {
    spacesApi.getPublicSpace.mockRejectedValue(
      Object.assign(new Error("Public space not found."), { status: 404 })
    );

    renderAt("/s/gone-slug");

    expect(
      await screen.findByText("This link doesn't open a space")
    ).toBeInTheDocument();
    expect(screen.queryByText("Biology notes")).toBeNull();
  });

  it("tells the truth when an invite link has been withdrawn", async () => {
    spacesApi.getSharedSpace.mockRejectedValue(
      Object.assign(new Error("Invalid or expired invite link."), { status: 404 })
    );

    renderAt("/spaces/shared/dead-token");

    expect(
      await screen.findByText("This invite link is no longer active")
    ).toBeInTheDocument();
    expect(screen.queryByText("Biology notes")).toBeNull();
  });

  it("offers a retry that re-runs the request when the call fails outright", async () => {
    spacesApi.getPublicSpace
      .mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 0 }))
      .mockResolvedValueOnce(VIEW);

    renderAt("/s/flaky");

    expect(await screen.findByText("Couldn't load this space")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Biology notes")).toBeInTheDocument();
    expect(spacesApi.getPublicSpace).toHaveBeenCalledTimes(2);
  });

  it("announces a capped deck instead of presenting it as the whole deck", async () => {
    spacesApi.getPublicSpace.mockResolvedValue(VIEW);

    renderAt("/s/big-deck");

    expect(await screen.findByText("Showing the first 2 of 1200.")).toBeInTheDocument();
    expect(screen.getByText("1200 in this space")).toBeInTheDocument();
  });
});

describe("PublishDialog", () => {
  it("shows the origin the link will actually open on", () => {
    render(
      <ToastProvider>
        <PublishDialog spaceId="s1" open onClose={() => {}} />
      </ToastProvider>
    );

    expect(screen.getByText(`${window.location.origin}/s/`)).toBeInTheDocument();
    expect(screen.queryByText("studyspace.app/s/")).toBeNull();
  });
});

describe("ShareDialog", () => {
  it("only promises what the link delivers: a read-only view", async () => {
    spacesApi.listShares.mockResolvedValue([]);

    render(
      <ToastProvider>
        <ShareDialog spaceId="s1" open onClose={() => {}} />
      </ToastProvider>
    );

    expect(await screen.findByText(/read-only view/)).toBeInTheDocument();
    expect(screen.queryByText("Full edit access")).toBeNull();
    expect(screen.queryByLabelText("Role")).toBeNull();
    expect(screen.queryByText("Editor — full access")).toBeNull();
  });

  it("creates a link without claiming a role it cannot honour", async () => {
    spacesApi.listShares.mockResolvedValue([]);
    spacesApi.createShare.mockResolvedValue({
      id: "sh1",
      space_id: "s1",
      role: "viewer",
      token: "tok-1234567890-abcdef",
      expires_at: null,
      created_at: "2026-10-09T00:00:00Z",
      revoked_at: null,
    });

    render(
      <ToastProvider>
        <ShareDialog spaceId="s1" open onClose={() => {}} />
      </ToastProvider>
    );

    await screen.findByText("No shares yet. Create one above.");
    fireEvent.click(screen.getByRole("button", { name: "Create invite link" }));

    await waitFor(() =>
      expect(spacesApi.createShare).toHaveBeenCalledWith("s1", {
        expires_in_days: 7,
      })
    );
    expect(screen.queryByLabelText("Role")).toBeNull();
  });
});
