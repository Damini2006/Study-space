/**
 * Analytics: the refusal rates the Landing page promises.
 *
 * "If the corpus does not contain it, the model says so" — the verdict
 * (messages.status) was persisted by the backend and never surfaced
 * anywhere in the product. These tests pin the Refusals tab: each
 * space's answered-vs-refused counts with the rate, and a plain empty
 * state while nobody has chatted inside a Space yet.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Analytics from "@/pages/Analytics";

const { analyticsApi } = vi.hoisted(() => ({ analyticsApi: { summary: vi.fn() } }));
vi.mock("@/services/api-services", () => ({ analyticsApi }));

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

function renderAnalytics() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Analytics />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  analyticsApi.summary.mockResolvedValue(EMPTY_SUMMARY);
});

describe("the Refusals tab", () => {
  it("shows each space's refused answers with its rate", async () => {
    analyticsApi.summary.mockResolvedValue({
      ...EMPTY_SUMMARY,
      per_space_refusals: [{ space: "Biology", asked: 3, refused: 1 }],
    });
    const user = userEvent.setup();
    renderAnalytics();

    await user.click(await screen.findByRole("tab", { name: "Refusals" }));

    expect(await screen.findByText("Biology")).toBeInTheDocument();
    expect(screen.getByText("1 refused of 3 answers")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
  });

  it("says so plainly when nothing has been asked yet", async () => {
    const user = userEvent.setup();
    renderAnalytics();

    await user.click(await screen.findByRole("tab", { name: "Refusals" }));

    expect(
      await screen.findByText(/No assistant answers yet/)
    ).toBeInTheDocument();
  });
});
