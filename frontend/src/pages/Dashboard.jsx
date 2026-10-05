import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Flame,
  Layers,
  Loader2,
  Plus,
  Quote,
  Sparkles,
  Timer,
} from "lucide-react";
import { analyticsApi, habitsApi, plannerApi, spacesApi, studyApi } from "@/services/api-services";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/input";
import { cn, formatDate, relativeTime } from "@/lib/utils";

export default function Dashboard() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [creatingSpace, setCreatingSpace] = useState(searchParams.get("new") === "1");

  const { data: spaces = [], isLoading } = useQuery({ queryKey: ["spaces"], queryFn: () => spacesApi.list() });
  const { data: due } = useQuery({ queryKey: ["study", "due"], queryFn: studyApi.due });
  const { data: analytics } = useQuery({ queryKey: ["analytics", "summary"], queryFn: () => analyticsApi.summary(30) });
  const { data: habits = [] } = useQuery({ queryKey: ["habits"], queryFn: habitsApi.list });
  const { data: tasks = [] } = useQuery({ queryKey: ["plan", "tasks"], queryFn: () => plannerApi.listTasks(false) });

  const upcoming = useMemo(() => tasks.filter((t) => t.status === "pending").slice(0, 5), [tasks]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return "Burning the midnight oil";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Good night";
  }, []);

  const createSpace = useMutation({
    mutationFn: (payload) => spacesApi.create(payload),
    onSuccess: (space) => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      success(`Space “${space.title}” created.`);
      setCreatingSpace(false);
      setSearchParams({}, { replace: true });
    },
    onError: (err) => error(err.message),
  });

  const toggleHabit = useMutation({
    mutationFn: (id) => habitsApi.toggleLog(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["habits"] }),
    onError: (err) => error(err.message),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">{greeting}</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {profile?.display_name ? profile.display_name.split(" ")[0] : "there"} 👋
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/app/analytics">
            <Button variant="outline" size="sm">
              <BarChart3 className="size-4" /> Analytics
            </Button>
          </Link>
          <Button size="sm" onClick={() => setCreatingSpace(true)}>
            <Plus className="size-4" /> New Space
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Due today" value={due?.due_count ?? 0} icon={Layers} hint={`${due?.total_cards ?? 0} cards total`} to="/app/study" />
        <StatCard label="Day streak" value={analytics?.streak_days ?? 0} icon={Flame} hint="days active in a row" />
        <StatCard label="This week" value={`${analytics?.minutes_this_week ?? 0}m`} icon={Timer} hint={`${analytics?.focus_sessions_this_week ?? 0} focus sessions`} to="/app/focus" />
        <StatCard label="Reviews today" value={analytics?.reviews_today ?? 0} icon={CalendarDays} hint="cards reviewed" to="/app/study" />
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Button size="sm" onClick={() => setCreatingSpace(true)}>
          <Plus className="size-4 mr-2" /> Create Space
        </Button>
        <Link to="/app/study">
          <Button size="sm">
            <Loader2 className="size-4 mr-2" /> Review
          </Button>
        </Link>
        <Link to="/app/focus">
          <Button size="sm">
            <Timer className="size-4 mr-2" /> Focus
          </Button>
        </Link>
        <Link to="/app/analytics">
          <Button size="sm">
            <BarChart3 className="size-4 mr-2" /> Analyze
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Spaces */}
        <section aria-label="Your spaces">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Your Spaces</h2>
            <Link to="/app/planner" className="text-xs font-medium text-primary hover:underline">View plan</Link>
          </div>
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : spaces.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Sparkles className="size-8 text-primary-soft" />
                <p className="text-sm text-muted-foreground">
                  No Spaces yet. Create one, upload a document, and start studying.
                </p>
                <Button onClick={() => setCreatingSpace(true)}>
                  <Plus className="size-4" /> Create your first Space
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {spaces.map((s) => (
                <Link key={s.id} to={`/app/spaces/${s.id}`}>
                  <Card className="h-full p-4 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: s.color || "#4F5BD5" }} aria-hidden />
                      <h3 className="truncate text-sm font-semibold">{s.title}</h3>
                    </div>
                    {s.subject && <p className="mt-0.5 text-xs text-muted-foreground">{s.subject}</p>}
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant="default">{s.ready_source_count}/{s.source_count} sources</Badge>
                      <Badge variant={s.due_today > 0 ? "warning" : "default"}>{s.due_today} due</Badge>
                      <span className="ml-auto">{!s.updated_at ? "" : `updated ${relativeTime(s.updated_at)}`}</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Sidebar column */}
        <div className="space-y-6">
          {/* Daily quote */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Quote className="size-4 text-accent" /> Daily quote
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm italic text-muted-foreground">“{analytics?.daily_quote || "Be consistent, not perfect."}”</p>
            </CardContent>
          </Card>

          {/* Habits today */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">Habits today</CardTitle>
              <CardDescription>Tap to toggle — streaks build on Analytics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {habits.length === 0 && <p className="text-xs text-muted-foreground">No habits yet — add some on the Focus page area.</p>}
              {habits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => toggleHabit.mutate(h.id)}
                  aria-pressed={h.done_today}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                >
                  <span
                    className={cn(
                      "flex size-4.5 items-center justify-center rounded-md border",
                      h.done_today ? "border-transparent bg-success text-white" : "border-border"
                    )}
                    aria-hidden
                  >
                    {h.done_today && <Check className="size-3" />}
                  </span>
                  <span className={cn("flex-1", h.done_today && "text-muted-foreground line-through")}>{h.name}</span>
                  <span className="text-[11px] text-muted-foreground">{h.streak}d streak</span>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Upcoming tasks */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center justify-between text-sm">
                Upcoming tasks
                <Link to="/app/planner" className="text-xs font-medium text-primary hover:underline">All</Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {upcoming.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nothing scheduled. Let the planner draft a study week for you.
                </p>
              )}
              {upcoming.map((t) => (
                <Link key={t.id} to="/app/planner" className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-sm hover:bg-surface-2">
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.due && <span className="text-[11px] text-muted-foreground">{formatDate(t.due)}</span>}
                  <span className="text-[11px] text-primary">{t.duration_min}m</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create space dialog */}
      <NewSpaceDialog
        open={creatingSpace}
        onClose={() => {
          setCreatingSpace(false);
          setSearchParams({}, { replace: true });
        }}
        onSubmit={(payload) => createSpace.mutate(payload)}
        busy={createSpace.isPending}
      />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, hint, to }) {
  const inner = (
    <Card className="p-4 flex flex-col gap-2 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden />
        {label}
      </div>
      <div className="mt-1 flex-1 text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function NewSpaceDialog({ open, onClose, onSubmit, busy }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [color, setColor] = useState("#4F5BD5");
  const colors = ["#4F5BD5", "#E8749A", "#2FB5A0", "#F2B14A", "#8B6FD6", "#5AA9E6"];
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), subject: subject.trim() || undefined, color });
    setTitle("");
    setSubject("");
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New study Space"
      description="A Space holds one course or topic — sources, chat, studio outputs, cards and notes."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title.trim()}>
            {busy && <Loader2 className="size-4 animate-spin" />} Create Space
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="space-title">Title</Label>
          <Input id="space-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cell Biology 201" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="space-subject">Subject (optional)</Label>
          <Input id="space-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Biology" />
        </div>
        <div className="space-y-1.5">
          <Label>Color</Label>
          <div className="flex gap-2">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Choose color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn("size-6 rounded-full border-2", color === c ? "border-foreground" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
