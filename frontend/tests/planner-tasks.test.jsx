/**
 * The planner's proposal and task controls: buttons that do something.
 *
 * The ghost-task "Edit task" and "Remove task" buttons were wired to
 * `onEdit={() => {}}` / `onRemove={() => {}}` — hover affordances that did
 * nothing — while "Approve plan" posted `proposal.tasks` unchanged, so a
 * removed task still committed. The committed-task checkbox and delete
 * button fired un-awaited promises with no error path: a failed toggle
 * flipped and reverted with no message. And the tab panels rendered inside
 * the header's `flex items-center gap-2` row as siblings of the New plan
 * button. These tests pin the wired version: edits and removals change what
 * approve posts, an emptied proposal cannot be approved (with a hint saying
 * why), mutation failures surface in a toast, and the panels are page
 * content rather than header furniture.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

const RUN = {
  id: "run-1",
  status: "awaiting_approval",
  input: {},
  proposal: {
    rationale: "Two blocks a day around your midterms.",
    tasks: [
      { title: "Read chapter 4", topic: "Mitosis", due: "2026-10-12", duration_min: 45, space_id: null, day: "Sun" },
      { title: "Practice problems", topic: "Algebra", due: "2026-10-13", duration_min: 30, space_id: null, day: "Mon" },
    ],
  },
  plan_id: null,
  error: null,
  created_at: "2026-10-08T09:00:00Z",
  updated_at: "2026-10-08T09:00:00Z",
};

const TASK = {
  id: "task-1",
  plan_id: "plan-1",
  title: "Read chapter 4",
  topic: "Mitosis",
  due: "2026-10-12",
  duration_min: 45,
  space_id: null,
  status: "pending",
  source: "ai",
  order_idx: 0,
  created_at: "2026-10-08T09:00:00Z",
  updated_at: "2026-10-08T09:00:00Z",
};

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

async function removeTaskAt(user, remainingAfter) {
  await user.click(screen.getAllByRole("button", { name: "Remove task" })[0]);
  // Wait for the exit animation to unmount the card, so the next call sees
  // the current list rather than a card that is already on its way out.
  await waitFor(() =>
    expect(screen.queryAllByRole("button", { name: "Remove task" })).toHaveLength(remainingAfter)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  plannerApi.listRuns.mockResolvedValue([RUN]);
  plannerApi.listTasks.mockResolvedValue([]);
  plannerApi.createRun.mockResolvedValue({});
  plannerApi.approveRun.mockResolvedValue({ id: "run-1", status: "approved" });
  plannerApi.rejectRun.mockResolvedValue({ id: "run-1", status: "rejected" });
  plannerApi.updateTask.mockResolvedValue({ ...TASK, status: "done" });
  plannerApi.deleteTask.mockResolvedValue(undefined);
});

describe("the proposal controls", () => {
  it("posts only the tasks still on screen when approving after a removal", async () => {
    const user = userEvent.setup();
    renderPlanner();
    expect(await screen.findByText("Read chapter 4")).toBeTruthy();

    await removeTaskAt(user, 1);
    await user.click(screen.getByRole("button", { name: /Approve plan/ }));

    await waitFor(() => expect(plannerApi.approveRun).toHaveBeenCalledTimes(1));
    expect(plannerApi.approveRun).toHaveBeenCalledWith("run-1", {
      tasks: [RUN.proposal.tasks[1]],
    });
  });

  it("posts the edited task when approving after an edit", async () => {
    const user = userEvent.setup();
    renderPlanner();
    expect(await screen.findByText("Read chapter 4")).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Edit task" })[0]);
    const title = await screen.findByLabelText("Task title");
    expect(title).toHaveValue("Read chapter 4");
    await user.clear(title);
    await user.type(title, "Read chapter 5");
    await user.click(screen.getByRole("button", { name: "Save task" }));

    await user.click(screen.getByRole("button", { name: /Approve plan/ }));
    await waitFor(() => expect(plannerApi.approveRun).toHaveBeenCalledTimes(1));
    expect(plannerApi.approveRun).toHaveBeenCalledWith("run-1", {
      tasks: [
        expect.objectContaining({ title: "Read chapter 5", topic: "Mitosis", duration_min: 45 }),
        RUN.proposal.tasks[1],
      ],
    });
  });

  it("cannot approve an emptied proposal and says why", async () => {
    const user = userEvent.setup();
    renderPlanner();
    expect(await screen.findByText("Read chapter 4")).toBeTruthy();

    await removeTaskAt(user, 1);
    await removeTaskAt(user, 0);

    expect(
      await screen.findByText("Every proposed task was removed — reject the plan instead.")
    ).toBeTruthy();
    const approve = screen.getByRole("button", { name: /Approve plan/ });
    expect(approve).toBeDisabled();
    await user.click(approve);
    expect(plannerApi.approveRun).not.toHaveBeenCalled();
  });
});

describe("the committed-task controls", () => {
  it("surfaces a failed toggle instead of flipping and reverting silently", async () => {
    plannerApi.listRuns.mockResolvedValue([]);
    plannerApi.listTasks.mockResolvedValue([TASK]);
    plannerApi.updateTask.mockRejectedValueOnce(new Error("Task update failed"));
    const user = userEvent.setup();
    renderPlanner();

    await user.click(screen.getByRole("tab", { name: "List" }));
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    await waitFor(() =>
      expect(plannerApi.updateTask).toHaveBeenCalledWith("task-1", { status: "done" })
    );
    const toast = await screen.findByRole("status");
    expect(toast).toHaveTextContent("Task update failed");
    // The server rejected it: the checkbox must still show the real state.
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("deletes through the mutation and refreshes the list", async () => {
    plannerApi.listRuns.mockResolvedValue([]);
    plannerApi.listTasks.mockResolvedValueOnce([TASK]).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderPlanner();

    await user.click(screen.getByRole("tab", { name: "List" }));
    await user.click(await screen.findByRole("button", { name: "Delete task" }));

    await waitFor(() => expect(plannerApi.deleteTask).toHaveBeenCalledWith("task-1"));
    await waitFor(() => expect(plannerApi.listTasks).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Read chapter 4")).toBeNull());
  });
});

describe("where the tab panels render", () => {
  it("are page content, not children of the header row", async () => {
    renderPlanner();
    await screen.findByRole("button", { name: /New plan/ });

    const newPlan = screen.getByRole("button", { name: /New plan/ });
    const headerRow = newPlan.parentElement;
    expect(within(headerRow).getByRole("tablist")).toBeTruthy();
    expect(headerRow.querySelector('[role="tabpanel"]')).toBeNull();
    expect(screen.getByRole("tabpanel")).toBeTruthy();
  });
});
