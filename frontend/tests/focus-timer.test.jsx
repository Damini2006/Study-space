/**
 * Focus: one session log per completed timer.
 *
 * The timer's completion branch used to run inside the setRemaining
 * updater. StrictMode (which main.jsx mounts the app under) re-invokes
 * updater functions to surface impurity, so a full Pomodoro called
 * focusApi.create twice and counted two completions for one run. These
 * pin the pure tick plus the completion effect: exactly one create per
 * phase with the payload the backend expects, and the focus → break
 * switch that follows.
 */
import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import Focus from "@/pages/Focus";

const { focusApi } = vi.hoisted(() => ({
  focusApi: { sessions: vi.fn(), create: vi.fn() },
}));

vi.mock("@/services/api-services", () => ({ focusApi }));

function renderFocus() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <Focus />
        </ToastProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

// Runs the interval for `ms` of fake wall-clock time; act flushes the
// renders and effects each timer step batch produces.
const runClock = async (ms) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  focusApi.sessions.mockResolvedValue([]);
  focusApi.create.mockResolvedValue({ id: "session-1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the focus timer's completion", () => {
  it("logs exactly one focus session for a completed run", async () => {
    renderFocus();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await runClock(25 * 60 * 1000);

    expect(focusApi.create).toHaveBeenCalledTimes(1);
    expect(focusApi.create).toHaveBeenCalledWith({
      kind: "focus",
      duration_min: 25,
      completed: true,
    });
    expect(screen.getByText("1 completed this session")).toBeInTheDocument();
  });

  it("switches to the break and logs that run once too", async () => {
    renderFocus();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await runClock(25 * 60 * 1000);

    // Phase flipped: the length label now describes the break.
    expect(
      screen.getByText(/Session length \(break minutes\)/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await runClock(5 * 60 * 1000);

    expect(focusApi.create).toHaveBeenCalledTimes(2);
    expect(focusApi.create.mock.calls[1][0]).toEqual({
      kind: "break",
      duration_min: 5,
      completed: true,
    });
    expect(screen.getByText("2 completed this session")).toBeInTheDocument();
  });

  it("does not log while paused or reset", async () => {
    renderFocus();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await runClock(10 * 1000);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await runClock(60 * 1000);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await runClock(60 * 1000);

    expect(focusApi.create).not.toHaveBeenCalled();
    expect(screen.getByText("0 completed this session")).toBeInTheDocument();
  });
});
