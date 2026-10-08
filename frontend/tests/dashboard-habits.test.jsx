/**
 * Dashboard habits: creating and deleting, and the pointers that used to lie.
 *
 * Habits were unreachable from the UI — no create control anywhere, no
 * delete — while four places of copy sent users to the Focus page or the
 * Planner for habit management that does not exist on either. These
 * tests pin the wired version (New habit dialog posts to habitsApi.create,
 * delete asks first, empty state points at this card) plus the source-level
 * claims that the Focus and Planner blurbs no longer promise habits.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/ui/toast";
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

const HABIT = {
  id: "habit-1",
  name: "Drink water",
  target_days: 7,
  streak: 3,
  done_today: false,
  color: "#2FB5A0",
  icon: "droplet",
  user_id: "user-1",
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-08T09:00:00Z",
};

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <Dashboard />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  spacesApi.list.mockResolvedValue([]);
  studyApi.due.mockResolvedValue({ due_count: 0, total_cards: 0 });
  analyticsApi.summary.mockResolvedValue({});
  habitsApi.list.mockResolvedValue([]);
  plannerApi.listTasks.mockResolvedValue([]);
  habitsApi.create.mockResolvedValue({ ...HABIT, id: "habit-2" });
  habitsApi.delete.mockResolvedValue(undefined);
  habitsApi.toggleLog.mockResolvedValue({});
  spacesApi.create.mockResolvedValue({});
});

describe("habit creation", () => {
  it("creates a habit from the card's own New habit button", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "New habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    await user.type(within(dialog).getByLabelText("Name"), "Drink water");
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    await waitFor(() =>
      expect(habitsApi.create).toHaveBeenCalledWith({ name: "Drink water", target_days: 7 })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("sends the weekly target alongside the name", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "New habit" }));
    const dialog = await screen.findByRole("dialog", { name: "New habit" });
    const days = within(dialog).getByLabelText("Days per week (1–7)");
    fireEvent.change(days, { target: { value: "4" } });
    await user.type(within(dialog).getByLabelText("Name"), "Stretch");
    await user.click(within(dialog).getByRole("button", { name: "Add habit" }));

    await waitFor(() =>
      expect(habitsApi.create).toHaveBeenCalledWith({ name: "Stretch", target_days: 4 })
    );
  });
});

describe("habit deletion", () => {
  it("deletes a habit once the confirm is accepted", async () => {
    habitsApi.list.mockResolvedValue([HABIT]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Delete Drink water" }));
    await waitFor(() => expect(habitsApi.delete).toHaveBeenCalledWith("habit-1"));
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("keeps the habit when the confirm is declined", async () => {
    habitsApi.list.mockResolvedValue([HABIT]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Delete Drink water" }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(habitsApi.delete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete Drink water" })).toBeInTheDocument();
    confirm.mockRestore();
  });
});

describe("the empty state", () => {
  it("points at this card instead of the Focus page", async () => {
    renderDashboard();

    const hint = await screen.findByText(/No habits yet/);
    expect(hint.textContent).not.toMatch(/Focus page/);
    expect(hint.textContent).toMatch(/New habit/);
  });
});

describe("page pointers", () => {
  const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
    ? process.cwd()
    : path.join(process.cwd(), "frontend");
  // Normalise line endings: the working tree may be CRLF while git stores LF.
  const read = (...parts) =>
    fs.readFileSync(path.join(FRONTEND, ...parts), "utf8").replace(/\r\n/g, "\n");

  it("names only the pages that actually hold the feature", () => {
    const APP = read("src", "App.jsx");
    const NOT_FOUND = read("src", "pages", "NotFound.jsx");

    // Focus has no habit management — its blurb must not promise any.
    const focusLine = APP.split("\n").find((l) => l.includes('"/app/focus"'));
    expect(focusLine).toBeDefined();
    expect(focusLine).not.toMatch(/habits/);

    // The Dashboard does hold habits, and still says so.
    const dashboardLine = APP.split("\n").find((l) => l.includes('"/app/dashboard"'));
    expect(dashboardLine).toMatch(/habits/);

    // The Planner has no habits either.
    expect(NOT_FOUND).toContain('hint: "Calendar and tasks"');
    expect(NOT_FOUND).not.toContain("tasks and habits");
  });
});
