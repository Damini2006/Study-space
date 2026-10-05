import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  ChevronDown,
  Clock,
  Loader2,
  Plus,
  ShieldCheck,
  X,
  BarChart3,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/dialog";
import { plannerApi } from "@/services/api-services";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => `${i % 12 || 12}${i < 12 ? " AM" : " PM"}`);

function GhostTaskCard({ task, index, onRemove, onEdit }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="ghost-card rounded-xl p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground font-mono">{DAYS[new Date(task.due).getDay()] || "—"}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{task.title}</p>
          {task.topic && <p className="text-xs text-muted-foreground">{task.topic}</p>}
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3" /> {task.duration_min} min
            {task.space_id && <span className="px-1.5 py-0.5 rounded bg-surface-2">Space</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onEdit(index)}
            className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            aria-label="Edit task"
          >
            <ChevronDown className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-destructive"
            aria-label="Remove task"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ApprovedTaskCard({ task, onToggle, onDelete }) {
  return (
    <Card className="p-4 space-y-2 flex items-center gap-3">
      <input
        type="checkbox"
        checked={task.status === "done"}
        onChange={(e) => onToggle(task.id, e.target.checked ? "done" : "pending")}
        className="size-4 accent-primary"
      />
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium truncate", task.status === "done" && "line-through text-muted-foreground")}>{task.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {task.due && <span>{formatDate(task.due)}</span>}
          <Clock className="size-3" /> {task.duration_min} min
          {task.space_id && <span className="px-1.5 py-0.5 rounded bg-surface-2 text-[10px]">Space</span>}
          {task.source === "ai" && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">AI</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-destructive"
        aria-label="Delete task"
      >
        <X className="size-3.5" />
      </button>
    </Card>
  );
}

function PlannerForm({ onSubmit, pending, defaultValues = {} }) {
  return (
    <Dialog
      open onClose={() => onSubmit?.()}
      title="Create study plan"
      description="Tell the planner about your exams, availability and weak topics."
      className="max-w-xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Plan title</Label>
          <Input defaultValue={defaultValues.title || ""} placeholder="Midterm study plan" />
        </div>

        <div className="space-y-1.5">
          <Label>Exam dates (one per line: Subject, YYYY-MM-DD)</Label>
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            defaultValue={defaultValues.exam_dates?.map(e => `${e.subject}, ${e.exam_date}`).join("\n") || ""}
            placeholder="Biology, 2026-10-15&#10;Math, 2026-10-20"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Weekly availability (weekday: minutes)</Label>
          <textarea
            className="min-h-[60px] w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            defaultValue={defaultValues.availability?.map(a => `${a.weekday}: ${a.minutes}`).join("\n") || ""}
            placeholder="0: 90 (Mon)&#10;2: 60 (Wed)&#10;4: 120 (Fri)"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Weak topics (comma-separated)</Label>
          <Input defaultValue={defaultValues.weak_topics?.join(", ") || ""} placeholder="osmosis, Calvin cycle, HTML semantics" />
        </div>

        <div className="space-y-1.5">
          <Label>Spaces to draw from (optional)</Label>
          <Input defaultValue={defaultValues.space_ids?.join(", ") || ""} placeholder="space-id-1, space-id-2" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={() => onSubmit?.()}>Cancel</Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin mr-1" />}
            Generate plan
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Planner() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState("proposals");
  const [view, setView] = useState("calendar"); // "calendar" or "list"
  const [dragTask, setDragTask] = useState(null);

  const { data: runs = [] } = useQuery({ queryKey: ["planner", "runs"], queryFn: plannerApi.listRuns });
  const { data: tasks = [] } = useQuery({ queryKey: ["planner", "tasks"], queryFn: () => plannerApi.listTasks(false) });

  const pendingRun = runs.find(r => r.status === "awaiting_approval");
  const approvedRuns = runs.filter(r => r.status === "approved");

  const createRun = useMutation({
    mutationFn: (body) => plannerApi.createRun(body),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["planner", "runs"] });
      success("Plan drafted — review the ghost tasks and approve when ready.");
    },
    onError: error,
  });

  const approveRun = useMutation({
    mutationFn: ({ runId, body }) => plannerApi.approveRun(runId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planner", "runs"] });
      queryClient.invalidateQueries({ queryKey: ["planner", "tasks"] });
      success("Plan approved — tasks added to your schedule.");
    },
    onError: error,
  });

  const rejectRun = useMutation({
    mutationFn: (runId) => plannerApi.rejectRun(runId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planner", "runs"] }),
    onError: error,
  });

  const handleSubmit = (data) => {
    const spec = {
      title: data.title,
      exam_dates: data.exam_dates?.split("\n").filter(Boolean).map(line => {
        const [subject, exam_date] = line.split(",").map(s => s.trim());
        return { subject, exam_date };
      }) || [],
      availability: data.availability?.split("\n").filter(Boolean).map(line => {
        const [weekday, minutes] = line.split(":").map(s => s.trim());
        return { weekday: parseInt(weekday), minutes: parseInt(minutes) };
      }) || [],
      weak_topics: data.weak_topics?.split(",").map(s => s.trim()).filter(Boolean) || [],
      space_ids: data.space_ids?.split(",").map(s => s.trim()).filter(Boolean) || [],
    };
    createRun.mutate(spec);
    setShowForm(false);
  };

  // Calendar view state
  const [selectedDate, setSelectedDate] = useState(null);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(d.getDate() + diff));
  });

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    // Navigate to that date
    setWeekStart(new Date(date));
  };

  const prevWeek = () => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() - 7);
    setWeekStart(date);
  };

  const nextWeek = () => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + 7);
    setWeekStart(date);
  };

  // Get tasks for the current week
  const weekTasks = tasks.filter((task) => {
    if (!task.due) return false;
    const taskDate = new Date(task.due);
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    return taskDate >= weekStartDate && taskDate <= weekEndDate;
  });

  // Get pending runs
  const handleRunAction = (runId, action) => {
    if (action === "approve") {
      approveRun.mutate({ runId, body: { tasks: pendingRun?.proposal?.tasks || [] } });
    } else if (action === "reject") {
      rejectRun.mutate(runId);
    } else if (action === "view") {
      // Navigate to details
    } else if (action === "run") {
      queryClient.invalidateQueries({ queryKey: ["evals", "runs"] });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planner</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            AI drafts your study week around exams and weak topics — you approve.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setShowForm(true)}>
            <Plus className="size-4 mr-1" /> New plan
          </Button>

          {/* View switch */}
          <Tabs value={view} onValueChange={setView} ariaLabel="Planner views">
            <TabsList>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="calendar">
              <div className="space-y-4">
                {/* Calendar grid */}
                <div className="grid grid-cols-7">
                  {DAYS.map((day) => (
                    <div key={day} className="min-h-14 text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Week numbers and days */}
                {Array.from({ length: 7 }).map((_, i) => {
                  const date = new Date(weekStart);
                  date.setDate(weekStart.getDate() + i);
                  const today = new Date();
                  const isToday =
                    date.getFullYear() === today.getFullYear() &&
                    date.getMonth() === today.getMonth() &&
                    date.getDate() === today.getDate();

                  const dayTasks = weekTasks.filter((t) => {
                    if (!t.due) return false;
                    const taskDate = new Date(t.due);
                    return (
                      taskDate.getFullYear() === date.getFullYear() &&
                      taskDate.getMonth() === date.getMonth() &&
                      taskDate.getDate() === date.getDate()
                    );
                  });

                  return (
                    <div
                      key={i}
                      className={cn(
                        "min-h-14 border-y border-border border-border/50",
                        isToday && "border-primary"
                      )}
                    >
                      <div className="p-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {DAYS[date.getDay()]} {date.getDate()}{" "}
                        {date.toLocaleDateString(undefined, { month: "short" })}
                      </div>
                      {dayTasks.length > 0 && (
                        <div className="p-2 text-[10px] text-success">
                          {dayTasks.length} task{dayTasks.length === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Nav buttons */}
                <div className="flex justify-between p-2 text-muted-foreground">
                  <Button variant="ghost" onClick={prevWeek} size="icon-sm" aria-label="Previous week">
                    <ArrowLeft className="size-4" />
                  </Button>
                  <Button variant="ghost" onClick={nextWeek} size="icon-sm" aria-label="Next week">
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="list">
              {tasks.length === 0 ? (
                <Card className="p-8 text-center">
                  <Calendar className="size-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-lg font-semibold">No tasks yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Approve a plan proposal to add tasks, or create them manually.
                  </p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <ApprovedTaskCard
                      key={task.id}
                      task={task}
                      onToggle={(id, status) => {
                        plannerApi.updateTask(id, { status });
                        queryClient.invalidateQueries({ queryKey: ["planner", "tasks"] });
                      }}
                      onDelete={(id) => {
                        plannerApi.deleteTask(id);
                        queryClient.invalidateQueries({ queryKey: ["planner", "tasks"] });
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history">
              {runs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No planner runs yet.</p>
              ) : (
                <div className="space-y-2">
                  {runs.map((run) => (
                    <Card key={run.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={
                              run.status === "approved" ? "success" :
                              run.status === "awaiting_approval" ? "warning" :
                              run.status === "rejected" ? "danger" : "default"
                            }
                          >
                            {run.status}
                          </Badge>
                          <div>
                            <p className="font-medium">{run.input?.title || "Study plan"}</p>
                            <p className="text-xs text-muted-foreground">Created {formatDate(run.created_at)}</p>
                          </div>
                        </div>
                        {run.status === "failed" && <Badge variant="danger">Failed</Badge>}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Pending run section */}
      {pendingRun && pendingRun.status === "awaiting_approval" ? (
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Review your study plan</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                These are proposed ghost tasks — nothing is committed until you approve.
              </p>
            </div>
          </div>

          <Card className="p-4 space-y-3">
            {pendingRun.proposal?.rationale && <p className="text-sm text-muted-foreground">{pendingRun.proposal.rationale}</p>}
            <AnimatePresence>
              {pendingRun.proposal.tasks?.length ? (
                pendingRun.proposal.tasks.map((t, i) => (
                  <GhostTaskCard
                    key={t.title + i}
                    task={t}
                    index={i}
                    onRemove={() => {}}
                    onEdit={() => {}}
                  />
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">No tasks proposed.</p>
              )}
            </AnimatePresence>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => rejectRun.mutate(pendingRun.id)} disabled={rejectRun.isPending}>
              <X className="size-4 mr-1" /> Reject
            </Button>
            <Button
              onClick={() => approveRun.mutate({ runId: pendingRun.id, body: { tasks: pendingRun.proposal?.tasks || [] } })}
              disabled={approveRun.isPending}
            >
              <ShieldCheck className="size-4 mr-1" /> Approve plan
            </Button>
          </div>
        </div>
      ) : null}

      {/* Create plan form */}
      <PlannerForm open={showForm} onClose={() => setShowForm(false)} onSubmit={handleSubmit} pending={createRun.isPending} />

      {/* Progress tracking */}
      {approvedRuns.length > 0 && (
        <div className="mt-6 p-4 bg-surface-2 rounded-xl border border-border">
          <h2 className="text-semibold mb-4">Study Progress</h2>
          <BarChart3 className="size-6 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {approvedRuns.length} plans approved, {tasks.length} active tasks
          </p>
        </div>
      )}
    </div>
  );
}