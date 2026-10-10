/**
 * Search the space's own sources — the first caller of
 * GET /api/spaces/:id/search inside the app. Until this surface, the
 * hybrid endpoint served only the MCP tool and chat's internals: asking
 * "which of my sources mentions X" cost a whole RAG answer, and the
 * workspace had no way to ask at all.
 *
 * Only "@/lib/api" is mocked here, so the real sourcesApi wrapper runs
 * and the exact URL each call builds is under test next to the panel's
 * behaviour — same call, same path, same encoding the backend parses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import SourcesPanel from "@/components/workspace/SourcesPanel";
import { sourcesApi } from "@/services/api-services";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
    download: vi.fn(),
  },
}));

const FIND = { timeout: 3000 };

const HIT = {
  chunk_id: "c1",
  source_id: "src1",
  source_title: "Biology notes",
  content: "Photosynthesis converts light energy into chemical energy stored in glucose.",
  page: 12,
  fused_score: 1.2,
  final_score: 0.8,
  rank: 1,
};

const SOURCES = [
  {
    id: "src1",
    title: "Cell biology",
    status: "ready",
    size_bytes: 2048,
    chunk_count: 3,
    created_at: "2026-01-01T00:00:00Z",
  },
];

function stubEndpoints({ searchResults = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (url.includes("/search?")) return Promise.resolve({ results: searchResults });
    return Promise.resolve(SOURCES);
  });
}

function renderPanel(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <SourcesPanel
          spaceId="sp1"
          selectedPassage={null}
          onClearPassage={() => {}}
          onSelectPassage={props.onSelectPassage ?? (() => {})}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
}

const searchBox = () => screen.getByLabelText("Search this space's sources");

describe("the search call", () => {
  it("asks the hybrid endpoint through the wrapper, encoding the query", async () => {
    stubEndpoints();
    await sourcesApi.search("sp1", "light & energy");
    expect(api.get).toHaveBeenCalledWith("/spaces/sp1/search?q=light%20%26%20energy&limit=10");
  });
});

describe("searching the space's sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubEndpoints();
  });

  it("spends no request below two characters", async () => {
    renderPanel();
    fireEvent.change(searchBox(), { target: { value: "p" } });
    // well past the 300 ms debounce — the guard, not the timer, held it back
    await new Promise((r) => setTimeout(r, 400));
    expect(api.get.mock.calls.filter(([url]) => url.includes("/search?"))).toHaveLength(0);
  });

  it("shows retrieved chunks in place of the source list", async () => {
    stubEndpoints({ searchResults: [HIT] });
    renderPanel();
    fireEvent.change(searchBox(), { target: { value: "photosynthesis" } });

    expect(await screen.findByText(/Photosynthesis converts/, {}, FIND)).toBeInTheDocument();
    expect(screen.getByText(/Biology notes/)).toBeInTheDocument();
    expect(screen.getByText(/p\. 12/)).toBeInTheDocument();
    // replaced, not doubled up
    expect(screen.queryByText("Cell biology")).toBeNull();
  });

  it("hands a clicked chunk to the workspace as the selected passage", async () => {
    stubEndpoints({ searchResults: [HIT] });
    const onSelectPassage = vi.fn();
    renderPanel({ onSelectPassage });
    fireEvent.change(searchBox(), { target: { value: "photosynthesis" } });

    const chunk = await screen.findByText(/Photosynthesis converts/, {}, FIND);
    fireEvent.click(chunk.closest("button"));

    expect(onSelectPassage).toHaveBeenCalledWith({
      source_id: "src1",
      source_title: "Biology notes",
      quote: HIT.content,
      page: 12,
    });
  });

  it("says plainly when nothing matched, and returns to the list when cleared", async () => {
    renderPanel();
    fireEvent.change(searchBox(), { target: { value: "zzzz" } });
    expect(await screen.findByText(/No matches for/, {}, FIND)).toBeInTheDocument();

    fireEvent.change(searchBox(), { target: { value: "" } });
    expect(await screen.findByText("Cell biology", {}, FIND)).toBeInTheDocument();
  });
});
