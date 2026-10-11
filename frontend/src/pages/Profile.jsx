/**
 * Profile — your identity, appearance, and real study stats.
 *
 * Everything here is either a field the server actually returns from
 * GET /me, a value it accepts on PATCH /me, or a stat computed from
 * GET /analytics/summary. Nothing is invented: there are no placeholder
 * avatars, no fake "level" or "points", and the joined date is shown only
 * when the API gave us one.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  BarChart3,
  Check,
  Flame,
  Layers,
  Loader2,
  LogOut,
  Mail,
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
import { cn, formatDate, initials } from "@/lib/utils";

export default function Profile() {
  const { profile, loadProfile, signOut, isDemo } = useAuth();
  const { theme, setTheme, themes } = useTheme();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  // The stats are the same real summary the Dashboard uses — no separate
  // "profile stats" endpoint exists, so we do not pretend one does.
  const { data: summary, isLoading: statsLoading } = useQuery({
    queryKey: ["analytics", "summary"],
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

  const stats = useMemo(() => {
    const s = summary || {};
    return [
      { label: "Day streak", value: s.streak_days ?? 0, icon: Flame, unit: "days" },
      { label: "Cards", value: s.cards_total ?? 0, icon: Layers, unit: "total" },
      { label: "Due today", value: s.due_today ?? 0, icon: CalendarDays, unit: "cards" },
      { label: "This week", value: s.minutes_this_week ?? 0, icon: Timer, unit: "min focused" },
    ];
  }, [summary]);

  const joined = profile?.created_at ? formatDate(profile.created_at) : null;
  const trimmed = name.trim();
  const canSave = editing && trimmed.length > 0 && trimmed !== (profile?.display_name || "");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your name, appearance, and the study stats your account has earned.
          </p>
        </div>
        {isDemo && (
          <span className="rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-semibold uppercase text-info">
            Demo account
          </span>
        )}
      </div>

      {/* Identity */}
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <span
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary"
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
                <h2 className="truncate text-xl font-semibold">{profile?.display_name || "Unnamed"}</h2>
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
          <Link to="/app/settings">
            <Button size="sm" variant="outline">
              <User className="size-4" /> Account settings
            </Button>
          </Link>
          <Button size="sm" variant="outline" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </Card>

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
                {active && <Check className="size-3.5" aria-hidden />}
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

      {/* Real stats from analytics */}
      <Card className="p-5">
        <h3 className="font-semibold">Your activity</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Straight from your study history — nothing here is estimated.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, unit }) => (
            <div key={label} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Icon className="size-3.5 text-primary" aria-hidden />
                {label}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {statsLoading ? "—" : value}
              </div>
              <div className="text-[11px] text-muted-foreground">{unit}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Link to="/app/analytics">
            <Button size="sm" variant="outline">
              <BarChart3 className="size-4" /> Open analytics
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
