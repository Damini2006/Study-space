/**
 * Controls that were wired to nothing: the MCP "Copy token" button, the
 * studio "Open in study" link, and the import drop zone's click handler.
 *
 * - Settings' list-row Copy button read `t.token` — a field the list
 *   endpoint has never carried — wrote the literal string "undefined" to
 *   the clipboard and toasted success. The one-time secret now lives in
 *   the creation dialog itself, with a copy that only claims success once
 *   the clipboard accepted the text.
 * - Studio's flashcards view linked to /spaces/<id>/studio/<output>?card
 *   — no route matches it — so every click opened a 404 in a new tab.
 * - The drop zone held its "ref" in a useState array, so the node React
 *   attached was the zone div itself: clicking anywhere re-entered
 *   handleClick through div.click() until the stack blew.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import ImportDialog from "@/components/workspace/ImportDialog";
import StudioPanel from "@/components/workspace/StudioPanel";
import SettingsPage from "@/pages/Settings";

// Every export of api-services, so any panel Settings imports resolves;
// the tests only exercise the tokens tab, which mounts these three.
const apis = vi.hoisted(() => {
  const makeApi = () =>
    new Proxy({}, { get: (t, p) => (t[p] ??= vi.fn().mockResolvedValue([])) });
  const out = {};
  for (const n of [
    "spacesApi",
    "sourcesApi",
    "chatApi",
    "studioApi",
    "studyApi",
    "plannerApi",
    "notesApi",
    "focusApi",
    "habitsApi",
    "visionApi",
    "financeApi",
    "analyticsApi",
    "evalsApi",
    "demoApi",
    "meApi",
    "modelsApi",
    "promptTemplatesApi",
    "ragApi",
  ]) {
    out[n] = makeApi();
  }
  return out;
});

vi.mock("@/services/api-services", () => apis);
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isDemo: false,
    isAuthenticated: false,
    initialising: false,
    profile: null,
    signOut: vi.fn(),
  }),
}));

function renderWithProviders(ui) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("the import drop zone", () => {
  it("routes a zone click through the file input exactly once, never re-entering itself", () => {
    renderWithProviders(<ImportDialog spaceId="s1" open onClose={() => {}} />);

    const input = screen.getByLabelText("Choose files");
    const zone = input.parentElement;
    const click = vi.spyOn(input, "click");

    // The pre-fix code called div.click() from the div's own onClick —
    // each pass re-entered until RangeError.
    expect(() => fireEvent.click(zone)).not.toThrow();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("still feeds chosen files into the import list", () => {
    renderWithProviders(<ImportDialog spaceId="s1" open onClose={() => {}} />);

    const input = screen.getByLabelText("Choose files");
    const file = new File(["hello"], "notes.md", { type: "text/markdown" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("1 file(s) selected")).toBeInTheDocument();
  });
});

const TOKEN_ROW = {
  id: "t1",
  name: "Claude Desktop",
  token_prefix: "ss_live_abcd",
  scopes: ["read"],
  created_at: "2026-01-01T00:00:00Z",
  revoked_at: null,
};

async function openCreateDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "Create token" }));
  const dialog = await screen.findByRole("dialog");
  const nameInput = within(dialog).getByLabelText("Name");
  fireEvent.change(nameInput, { target: { value: "New client" } });
  // jsdom runs no default action for a submit click, so dispatch the
  // submit event the browser would have fired.
  fireEvent.submit(nameInput.closest("form"));
  return dialog;
}

describe("the MCP token controls", () => {
  it("offers no copy control on token rows — the list never holds the secret", async () => {
    apis.meApi.mcpTokens.mockResolvedValue([TOKEN_ROW]);
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByText("Claude Desktop")).toBeInTheDocument();
    expect(screen.queryByTitle("Copy token")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy token" })).toBeNull();
  });

  it("says when the token was last used, and never claims a use it did not record", async () => {
    // Assertions match the label words per card, not formatted dates — a
    // date rendered from a UTC midnight lands on the previous day west of
    // Greenwich, and the claim under test is which card says what.
    apis.meApi.mcpTokens.mockResolvedValue([
      { ...TOKEN_ROW, id: "t1", name: "Used client", last_used_at: "2026-01-02T00:00:00Z" },
      { ...TOKEN_ROW, id: "t2", name: "Fresh client", last_used_at: null },
    ]);
    renderWithProviders(<SettingsPage />);

    await screen.findByText("Fresh client"); // both rows have rendered
    // Each card's meta line — scopes · created · last-used — must carry
    // the label belonging to its own row.
    const metaOf = (name) =>
      within(screen.getByText(name).parentElement).getByText(/Last used|Never used|read/);
    expect(metaOf("Used client").textContent).toContain("Last used");
    expect(metaOf("Used client").textContent).toContain("read"); // scopes kept
    expect(metaOf("Fresh client").textContent).toContain("Never used");
  });

  it("shows the one-time token in the dialog and copies exactly it", async () => {
    const SECRET = "ss_live_full_secret_value_123";
    apis.meApi.createMcpToken.mockResolvedValue({ id: "t2", token: SECRET });
    renderWithProviders(<SettingsPage />);

    const dialog = await openCreateDialog();

    expect(await within(dialog).findByText(SECRET)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Copy token/ }));

    await screen.findByText("Token copied to clipboard!");
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(SECRET);
  });

  it("reports a failed copy instead of toasting success over it", async () => {
    const SECRET = "ss_live_full_secret_value_123";
    apis.meApi.createMcpToken.mockResolvedValue({ id: "t2", token: SECRET });
    renderWithProviders(<SettingsPage />);

    const dialog = await openCreateDialog();
    await within(dialog).findByText(SECRET);
    window.navigator.clipboard.writeText.mockRejectedValue(new Error("denied"));

    fireEvent.click(within(dialog).getByRole("button", { name: /Copy token/ }));

    expect(
      await screen.findByText(/Couldn't reach the clipboard/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Token copied to clipboard!")).toBeNull();
  });
});

describe("the studio flashcards view", () => {
  it("offers no Open in study link to a route that does not exist", async () => {
    apis.studioApi.listOutputs.mockResolvedValue([
      {
        id: "out1",
        space_id: "s1",
        type: "flashcards",
        title: "Cell deck",
        created_at: "2026-01-01T00:00:00Z",
        content: {
          cards: [
            { front: "What is ATP?", back: "Energy currency", source_chunk_id: "ch1" },
          ],
        },
      },
    ]);
    renderWithProviders(<StudioPanel spaceId="s1" />);

    fireEvent.click(await screen.findByRole("button", { name: /Cell deck/ }));

    expect(await screen.findByText("What is ATP?")).toBeInTheDocument();
    expect(screen.queryByText("Open in study")).toBeNull();
  });
});
