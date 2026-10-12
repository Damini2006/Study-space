/**
 * Profile's stats section — the honest bits.
 *
 * Profile asked for a 120-day analytics summary under the bare key
 * ["analytics", "summary"] while Dashboard (30 days) and Analytics (90 days)
 * had already been given windowed keys. Whichever page filled the cache first
 * won, so Profile could render another page's window as its own. This pins the
 * third window, and the two claims the charts make: an empty chart says so in
 * words, and a week with no baseline to compare against says "no baseline"
 * instead of inventing a "+100%".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/ui/toast";
import Profile from "@/pages/Profile";

const { analyticsApi, meApi } = vi.hoisted(() => ({
  analyticsApi: { summary: vi.fn() },
  meApi: { update: vi.fn() },
}));

vi.mock("@/services/api-services", () => ({ analyticsApi, meApi }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    profile: {
      display_name: "Rishika",
      email: "panel.test@example.com",
      created_at: "2026-01-01T00:00:00Z",
      is_admin: false,
    },
    loadProfile: vi.fn(),
    signOut: vi.fn(),
    isDemo: false,
    isAuthenticated: true,
  }),
}));

const EMPTY_SUMMARY = {
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

function renderProfile() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <Profile />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  analyticsApi.summary.mockResolvedValue(EMPTY_SUMMARY);
});

describe("Profile's analytics window", () => {
  it("asks for 120 days and stores it under that window, not the bare key", async () => {
    renderProfile();

    await waitFor(() =>
      expect(client.getQueryData(["analytics", "summary", 120])).toBeDefined()
    );
    expect(analyticsApi.summary).toHaveBeenCalledWith(120);
    // The shared bare key is what let Dashboard and Analytics paint each
    // other; Profile must not reintroduce it.
    expect(client.getQueryData(["analytics", "summary"])).toBeUndefined();
  });
});

describe("Profile's charts", () => {
  it("says in words when there is nothing to draw", async () => {
    renderProfile();

    expect(
      await screen.findByText("No focus sessions yet — start one from Focus.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Log focus sessions against Spaces that have a subject.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Once you study or focus, your daily activity shows up here.")
    ).toBeInTheDocument();
  });

  it("says 'no baseline' rather than inventing a percentage", async () => {
    analyticsApi.summary.mockResolvedValue({
      ...EMPTY_SUMMARY,
      minutes_this_week: 45,
      minutes_last_week: 0,
    });
    renderProfile();

    // 45 against a zero baseline has no honest ratio — trendPct returns null.
    expect(await screen.findByText("no baseline")).toBeInTheDocument();
    expect(screen.queryByText(/\+100%/)).toBeNull();
  });

  it("shows the real week-over-week change when there is a baseline", async () => {
    analyticsApi.summary.mockResolvedValue({
      ...EMPTY_SUMMARY,
      minutes_this_week: 45,
      minutes_last_week: 20,
    });
    renderProfile();

    expect(await screen.findByText("+125%")).toBeInTheDocument();
    expect(screen.queryByText("no baseline")).toBeNull();
  });

  it("renders the subject minutes the summary actually returned", async () => {
    analyticsApi.summary.mockResolvedValue({
      ...EMPTY_SUMMARY,
      per_subject: [
        { subject: "Biology", minutes: 90 },
        { subject: "History", minutes: 30 },
      ],
    });
    renderProfile();

    // BarList renders a screen-reader table beside the visible bars, so each
    // label and value legitimately appears twice.
    expect((await screen.findAllByText("Biology")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("90m").length).toBeGreaterThan(0);
    expect(screen.getAllByText("History").length).toBeGreaterThan(0);
    expect(screen.getAllByText("30m").length).toBeGreaterThan(0);
    // No subject data means no bar list — not an empty one.
    expect(
      screen.queryByText("Log focus sessions against Spaces that have a subject.")
    ).toBeNull();
  });
});
