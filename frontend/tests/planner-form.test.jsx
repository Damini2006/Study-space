/**
 * The Planner's "Create study plan" dialog: what it sends, and whether it closes.
 *
 * The form used to be a shell. Its five inputs had no `name`, the submit
 * handler read properties off the React submit event (so every spec reached
 * POST /planner/runs as {title: undefined, exam_dates: [], ...} while the
 * copy promised "Tell the planner about your exams, availability and weak
 * topics"), the Dialog was hard-wired `open` so it covered the page from
 * load, and Cancel/X called the submit handler with no argument — reading
 * `.title` off `undefined` threw, so the dialog could never be dismissed.
 * These tests pin the wired version: name-addressed fields parsed into the
 * spec the backend models expect, a dialog that opens on "New plan" and
 * closes on Cancel/success, and one that survives a failed run instead of
 * discarding what the user typed.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import Planner from "@/pages/Planner";

const { plannerApi } = vi.hoisted(() => ({
  plannerApi: {
    listRuns: vi.fn(),
    listTasks: vi.fn(),
    createRun: vi.fn(),
    approveRun: vi.fn(),
    rejectRun: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}));

vi.mock("@/services/api-services", () => ({ plannerApi }));

function renderPlanner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Planner />
      </ToastProvider>
    </QueryClientProvider>
  );
}

async function openDialog(user) {
  await user.click(screen.getByRole("button", { name: /New plan/ }));
  return await screen.findByRole("dialog", { name: "Create study plan" });
}

const field = (container, name) => container.querySelector(`[name="${name}"]`);

beforeEach(() => {
  vi.clearAllMocks();
  plannerApi.listRuns.mockResolvedValue([]);
  plannerApi.listTasks.mockResolvedValue([]);
  plannerApi.createRun.mockResolvedValue({ id: "run-1", status: "awaiting_approval" });
});

describe("the create-plan dialog", () => {
  it("is not on screen until the user asks for it", () => {
    renderPlanner();
    expect(screen.queryByRole("dialog", { name: "Create study plan" })).toBeNull();
  });

  it("opens from the New plan button", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await openDialog(user);
    expect(screen.getByPlaceholderText("Midterm study plan")).toBeTruthy();
  });

  it("closes on Cancel without creating a run and without throwing", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(plannerApi.createRun).not.toHaveBeenCalled();
  });
});

describe("what the form sends to the planner", () => {
  it("parses every typed field into the spec POST /planner/runs accepts", async () => {
    const user = userEvent.setup();
    const { container } = renderPlanner();
    await openDialog(user);

    await user.type(field(container, "title"), "Midterm study plan");
    await user.type(field(container, "exam_dates"), "Biology, 2026-10-15{enter}Math, 2026-10-20");
    await user.type(field(container, "availability"), "0: 90{enter}2: 60");
    await user.type(field(container, "weak_topics"), "osmosis, Calvin cycle");
    await user.type(field(container, "space_ids"), "11111111-1111-1111-1111-111111111111");
    await user.click(screen.getByRole("button", { name: /Generate plan/ }));

    await waitFor(() => expect(plannerApi.createRun).toHaveBeenCalledTimes(1));
    expect(plannerApi.createRun).toHaveBeenCalledWith({
      title: "Midterm study plan",
      exam_dates: [
        { subject: "Biology", exam_date: "2026-10-15" },
        { subject: "Math", exam_date: "2026-10-20" },
      ],
      availability: [
        { weekday: 0, minutes: 90 },
        { weekday: 2, minutes: 60 },
      ],
      weak_topics: ["osmosis", "Calvin cycle"],
      space_ids: ["11111111-1111-1111-1111-111111111111"],
    });
  });

  it("sends plain values, never the submit event object", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: /Generate plan/ }));
    await waitFor(() => expect(plannerApi.createRun).toHaveBeenCalledTimes(1));
    const [spec] = plannerApi.createRun.mock.calls[0];
    expect(spec).not.toBeInstanceOf(Event);
    expect(spec.exam_dates).toEqual([]);
    expect(spec.weak_topics).toEqual([]);
  });

  it("closes the dialog once the run is accepted", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: /Generate plan/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog and the typed spec when the run fails", async () => {
    plannerApi.createRun.mockRejectedValueOnce(new Error("502"));
    const user = userEvent.setup();
    const { container } = renderPlanner();
    await openDialog(user);
    await user.type(field(container, "title"), "Keep me around");
    await user.click(screen.getByRole("button", { name: /Generate plan/ }));

    await waitFor(() => expect(plannerApi.createRun).toHaveBeenCalledTimes(1));
    // Wait past the dialog's exit animation (~180ms): a dialog that is
    // closing is gone by then, while one that kept the user's input is
    // still up. Asserting immediately would race the exit and pass either way.
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole("dialog", { name: "Create study plan" })).toBeTruthy();
    expect(field(container, "title")).toHaveValue("Keep me around");
  });
});
