/**
 * Profile — your identity, appearance, and real study stats.
 *
 * Everything here is either a field the server actually returns from
 * GET /me, a value it accepts on PATCH /me, or a stat computed from
 * GET /analytics/summary. Nothing is invented: there are no placeholder
 * avatars, no fake "level" or "points", and the joined date is shown only
 * when the API gave us one. The charts read the same daily rows Analytics
 * and the Dashboard use, through the shared chart components — so an empty
 * chart says so in words instead of drawing a convincing empty frame.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  Flame,
  Layers,
  Loader2,
  LogOut,
  Mail,
  Minus,
  Pencil,
  Shield,
  Timer,
  User,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/components/ui/toast";
import { analyticsApi, meApi } from "@/services/api-services";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { ActivityHeatmap, BarList, ChartCard, Sparkline, TrendBars } from "@/components/charts/charts";
import { lastNDaysSeries, trendPct } from "@/components/charts/chart-maths";
import { cn, formatDate, initials } from "@/lib/utils";

export default function Profile() {
  const { profile, loadProfile, signOut, isDemo } = useAuth();
  const { theme, setTheme, themes } = useTheme();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  // The stats are the same real summary the Dashboard uses — no separate
  // "profile stats" endpoint exists, so we do not pretend one does. The
  // window is part of the key: Dashboard owns 30 days and Analytics owns
  // 90, and sharing one key painted whichever page loaded first with the
  // other's numbers. This page asks for 120 and stores it under 120.
  const { data: summary, isLoading: statsLoading } = useQuery({
    queryKey: ["analytics", "summary", 120],
    queryFn: () => analyticsApi.summary(120),
  });

  const [name, setName] = useState(profile?.display_name || "");
  const [editing, setEditing] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);

  // Seed the editor once the profile arrives, and again if it changes under us
  // (e.g. after sign-in completes) so the field is never silently stale.
  useEffect(() => {
    if (!editing) setName(profile?.display_name || "");
  }, [profile?.display_name, editing]);

  const saveName = useMutation({
    mutationFn: (displayName) => meApi.update({ display_name: displayName }),
    onSuccess: async () => {
      await loadProfile();
      queryClient.invalidateQueries({ queryKey: ["meta", "me"] });
      success("Name updated.");
      setEditing(false);
    },
    onError: (err) => error(err.message),
  });

  // The theme hook persists through PATCH /me itself, so we only surface the
  // honest outcome rather than pretending we did the saving here.
  const pickTheme = async (id) => {
    setThemeSaving(true);
    await setTheme(id);
    setThemeSaving(false);
  };

  // Real chart series, derived only from what the summary actually returned.
  // weekDelta stays null whenever there is no truthful baseline (zero minutes
  // last week), and the UI says "no baseline" rather than inventing "+100%".
  const week = useMemo(() => lastNDaysSeries(summary?.heatmap || [], "minutes", 7), [summary]);
  const weekDelta = useMemo(
    () => trendPct(summary?.minutes_this_week ?? 0, summary?.minutes_last_week ?? 0),
    [summary]
  );
  const heatmapDays = useMemo(() => summary?.heatmap || [], [summary]);
  const subjects = useMemo(
    () => (summary?.per_subject || []).map((s) => ({ label: s.subject, value: s.minutes })),
    [summary]
  );
  const hasFocus = week.some((d) => d.value > 0);

  const stats = useMemo(() => {
    const s = summary || {};
    return [
      { label: "Day streak", value: s.streak_days ?? 0, icon: Flame, unit: "days" },
      { label: "Cards", value: s.cards_total ?? 0, icon: Layers, unit: "total" },
      { label: "Due today", value: s.due_today ?? 0, icon: CalendarDays, unit: "cards" },
      {
        label: "This week",
        value: s.minutes_this_week ?? 0,
        icon: Timer,
        unit: "min focused",
        sparkline: hasFocus ? week.map((d) => d.value) : null,
        delta: weekDelta,
      },
    ];
  }, [summary, hasFocus, week, weekDelta]);

  const joined = profile?.created_at ? formatDate(profile.created_at) : null;
  const trimmed = name.trim();
  const canSave = editing && trimmed.length > 0 && trimmed !== (profile?.display_name || "");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Hero — identity on the same gradient band the Dashboard opens with */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/12 via-primary/5 to-accent/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Your account</p>
          {isDemo ? (
            <span className="rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-semibold uppercase text-info">
              Demo account
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex items-start gap-4">
          <span
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary ring-4 ring-background/50"
            aria-hidden
          >
            {initials(profile?.display_name || profile?.email || "S")}
          </span>

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2">
                <Label htmlFor="profile-name">Display name</Label>
                <div className="flex gap-2">
                  <Input
                    id="profile-name"
                    value={name}
                    maxLength={40}
                    autoFocus
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSave) saveName.mutate(trimmed);
                      if (e.key === "Escape") setEditing(false);
                    }}
                    placeholder="How you'd like to be addressed"
                  />
                  <Button size="sm" onClick={() => saveName.mutate(trimmed)} disabled={!canSave || saveName.isPending}>
                    {saveName.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Up to 40 characters. Press Enter to save, Escape to cancel.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight">
                  {profile?.display_name || "Unnamed"}
                </h1>
                <Button size="sm" variant="ghost" aria-label="Edit display name" onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" />
                </Button>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5" aria-hidden />
                {profile?.email || "No email on file"}
              </span>
              {joined ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" aria-hidden />
                  Joined {joined}
                </span>
              ) : null}
              {profile?.is_admin ? (
                <span className="inline-flex items-center gap-1.5 text-primary">
                  <Shield className="size-3.5" aria-hidden />
                  Admin
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Link to="/app/analytics">
            <Button size="sm" variant="outline">
              <BarChart3 className="size-4" /> Open analytics
            </Button>
          </Link>
          <Link to="/app/settings">
            <Button size="sm" variant="outline">
              <User className="size-4" /> Account settings
            </Button>
          </Link>
          <Button size="sm" variant="outline" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </div>

      {/* Stat strip — real numbers from the same summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, unit, sparkline, delta }) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Icon className="size-3.5 text-primary" aria-hidden />
              {label}
            </div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="text-2xl font-bold tabular-nums">{statsLoading ? "—" : value}</div>
              {sparkline && sparkline.length > 1 ? (
                <Sparkline points={sparkline} label={`${label} trend, last 7 days`} />
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {delta === undefined ? null : <DeltaBadge delta={delta} />}
              <span>{unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts — a skeleton while loading, an honest sentence when empty */}
      {statsLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="skeleton h-48 w-full rounded-2xl lg:col-span-2" />
          <div className="skeleton h-48 w-full rounded-2xl" />
          <div className="skeleton h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            className="lg:col-span-2"
            title="Focus, last 7 days"
            description="Minutes focused per day — a flat bar means no session that day."
            isEmpty={!hasFocus}
            emptyMessage="No focus sessions yet — start one from Focus."
          >
            <TrendBars data={week} format={(v) => `${v}m`} height={120} caption="Focus minutes per day, last 7 days" />
          </ChartCard>

          <ChartCard
            title="Activity"
            description="Focused minutes by day, last 12 weeks"
            isEmpty={heatmapDays.length === 0}
            emptyMessage="Once you study or focus, your daily activity shows up here."
          >
            <ActivityHeatmap days={heatmapDays} valueKey="minutes" weeks={12} format={(v) => `${v}m`} caption="Daily focused minutes" />
            <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
              Less
              <span className="size-2.5 rounded-[3px]" style={{ background: "var(--surface-2)" }} />
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: "color-mix(in srgb, var(--primary) 45%, var(--surface-2))" }}
              />
              <span className="size-2.5 rounded-[3px]" style={{ background: "var(--primary)" }} />
              More
            </div>
          </ChartCard>

          <ChartCard
            title="Time per subject"
            description="Focused minutes, all time"
            isEmpty={subjects.length === 0}
            emptyMessage="Log focus sessions against Spaces that have a subject."
          >
            <BarList items={subjects} format={(v) => `${v}m`} caption="Focused minutes per subject" />
          </ChartCard>
        </div>
      )}

      {/* Appearance */}
      <Card className="p-5">
        <h3 className="font-semibold">Appearance</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Saved to your account, so it follows you to any device.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {themes.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTheme(t.id)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-surface-2"
                )}
              >
                <span
                  className="size-4 rounded-full border border-border"
                  style={{ background: t.swatch }}
                  aria-hidden
                />
                {t.label}
                {active ? <Check className="size-3.5" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
        {themeSaving ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
          </p>
        ) : null}
      </Card>
    </div>
  );
}

/**
 * A real week-over-week delta. `trendPct` returns null whenever there is no
 * honest baseline to compare against (nothing focused last week), and we say
 * so in words rather than inventing a "+100%".
 */
function DeltaBadge({ delta }) {
  if (delta === null || delta === undefined) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Minus className="size-3" aria-hidden /> no baseline
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Minus className="size-3" aria-hidden /> no change
      </span>
    );
  }
  const up = delta > 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        up ? "bg-success-bg text-success" : "bg-destructive/10 text-destructive"
      )}
    >
      <Arrow className="size-3" aria-hidden />
      {up ? "+" : ""}
      {delta}%
    </span>
  );
}
