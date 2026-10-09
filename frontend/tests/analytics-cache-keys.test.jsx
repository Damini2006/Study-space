/**
 * Analytics and the Dashboard ask for different windows of the same
 * summary — 90 days and 30 days — but both used the one cache key
 * ["analytics", "summary"]. Whichever page filled the cache first won:
 * opening Analytics after the Dashboard painted the Dashboard's 30-day
 * payload as if it were the 90-day page (and vice versa) until a
 * background refetch quietly corrected it. These pin one key per
 * window: each page starts from its own request and its cache entry
 * names the range it was fetched for.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/ui/toast";
import Analytics from "@/pages/Analytics";
import Dashboard from "@/pages/Dashboard";

const { analyticsApi, habitsApi, plannerApi, spacesApi, studyApi } = vi.hoisted(() => ({
  analyticsApi: { summary: vi.fn() },
  habitsApi: { list: vi.fn(), create: vi.fn(), delete: vi.fn(), toggleLog: vi.fn() },
  plannerApi: { listTasks: vi.fn() },
  spacesApi: { list: vi.fn(), create: vi.fn() },
  studyApi: { due: vi.fn() },
}));

vi.mock("@/services/api-services", () => ({
  analyticsApi,
  habitsApi,
  plannerApi,
  spacesApi,
  studyApi,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ profile: null }) }));

const SUMMARY = {
  heatmap: [],
  streak_days: 0,
  minutes_this_week: 0,
  minutes_last_week: 0,
  focus_sessions_this_week: 0,
  due_today: 0,
  reviews_today: 0,
  cards_total: 0,
  per_subject: [],
  weak_topics: [],
  per_space_refusals: [],
  daily_quote: null,
};

let client;

function renderWith(ui) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  spacesApi.list.mockResolvedValue([]);
  studyApi.due.mockResolvedValue({ due_count: 0, total_cards: 0 });
  habitsApi.list.mockResolvedValue([]);
  plannerApi.listTasks.mockResolvedValue([]);
  analyticsApi.summary.mockResolvedValue(SUMMARY);
});

describe("the summary cache", () => {
  it("does not paint Dashboard's 30-day quote onto the Analytics page", async () => {
    analyticsApi.summary.mockResolvedValueOnce({
      ...SUMMARY,
      daily_quote: "thirty window",
    });
    const dashboard = renderWith(<Dashboard />);
    await dashboard.findByText(/thirty window/);
    dashboard.unmount();

    analyticsApi.summary.mockResolvedValueOnce({
      ...SUMMARY,
      daily_quote: "ninety window",
    });
    renderWith(<Analytics />);

    // Before its own request resolves, Analytics may show a skeleton —
    // never the payload Dashboard left behind.
    expect(screen.queryByText("thirty window")).toBeNull();
    expect(await screen.findByText("ninety window")).toBeInTheDocument();
    expect(analyticsApi.summary).toHaveBeenLastCalledWith(90);
  });

  it("does not paint Analytics' 90-day quote onto the Dashboard", async () => {
    analyticsApi.summary.mockResolvedValueOnce({
      ...SUMMARY,
      daily_quote: "ninety window",
    });
    const analytics = renderWith(<Analytics />);
    await analytics.findByText("ninety window");
    analytics.unmount();

    analyticsApi.summary.mockResolvedValueOnce({
      ...SUMMARY,
      daily_quote: "thirty window",
    });
    renderWith(<Dashboard />);

    expect(screen.queryByText(/ninety window/)).toBeNull();
    expect(await screen.findByText(/thirty window/)).toBeInTheDocument();
    expect(analyticsApi.summary).toHaveBeenLastCalledWith(30);
  });

  it("stores each page's summary under the window it fetched", async () => {
    const dashboard = renderWith(<Dashboard />);
    await waitFor(() =>
      expect(client.getQueryData(["analytics", "summary", 30])).toBeDefined()
    );
    expect(client.getQueryData(["analytics", "summary"])).toBeUndefined();
    dashboard.unmount();

    renderWith(<Analytics />);
    await waitFor(() =>
      expect(client.getQueryData(["analytics", "summary", 90])).toBeDefined()
    );
    expect(client.getQueryData(["analytics", "summary"])).toBeUndefined();
  });
});
