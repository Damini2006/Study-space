import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart3,
  BarChart2,
  Calendar,
  Clock,
  Flame,
  Target,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/dialog";
import { analyticsApi } from "@/services/api-services";
import { cn, formatDate, formatClock } from "@/lib/utils";

const HEAT_COLORS = [
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
  "bg-heat-5",
];

function HeatmapCell({ day, minutes, reviews, habits, today }) {
  const total = minutes + reviews * 10 + habits * 5;
  const intensity = Math.min(4, Math.floor(total / 30));
  return (
    <motion.div
      key={day}
      className={cn("relative size-8 rounded flex items-end justify-center p-0.5", HEAT_COLORS[intensity], today && "ring-2 ring-primary")}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.random() * 0.2 }}
      title={`${formatDate(day)}: ${minutes}m focus, ${reviews} reviews, ${habits} habits`}
    >
      <span className="absolute bottom-0.5 left-0 right-0 text-[7px] text-center font-medium text-white/80">{new Date(day).getDate()}</span>
    </motion.div>
  );
}

function StatCard({ label, value, icon: Icon, hint, trend, to }) {
  const content = (
    <Card className="p-4 transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 flex items-end gap-1">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {trend && <TrendingUp className="size-4 text-success" />}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
  return to ? <a href={to}>{content}</a> : content;
}

export default function Analytics() {
  const { data: analytics, isLoading } = useQuery({ queryKey: ["analytics", "summary"], queryFn: () => analyticsApi.summary(90) });
  
  const weeks = [];
  if (analytics?.heatmap) {
    const weekMap = new Map();
    for (const h of analytics.heatmap) {
      const d = new Date(h.day);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay()); // Sunday start
      const key = weekStart.toISOString().slice(0, 10);
      if (!weekMap.has(key)) weekMap.set(key, []);
      weekMap.get(key).push(h);
    }
    for (const [weekStart, days] of weekMap.entries().slice(-8).reverse()) {
      weeks.push({ start: weekStart, days });
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0,1,2,3].map(i => <div key={i} className="skeleton h-28 w-full rounded-xl" />)}
        </div>
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Your study patterns, streaks and weak spots.</p>
        </div>
        <Badge variant="info" className="text-xs">{analytics?.daily_quote || "—"}</Badge>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Day streak" value={analytics?.streak_days ?? 0} icon={Flame} hint="days active in a row" />
        <StatCard label="This week" value={`${analytics?.minutes_this_week ?? 0}m`} icon={Clock} hint={`${analytics?.focus_sessions_this_week ?? 0} sessions`} />
        <StatCard label="Reviews today" value={analytics?.reviews_today ?? 0} icon={Target} hint="cards reviewed" />
        <StatCard label="Total cards" value={analytics?.cards_total ?? 0} icon={BarChart2} hint={`${analytics?.due_today ?? 0} due today`} />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
          <TabsTrigger value="subjects">By subject</TabsTrigger>
          <TabsTrigger value="weak">Weak topics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Focus this week</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Minutes</span>
                  <span className="font-mono">{analytics?.minutes_this_week ?? 0}m</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sessions</span>
                  <span className="font-mono">{analytics?.focus_sessions_this_week ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last week</span>
                  <span className="font-mono">{analytics?.minutes_last_week ?? 0}m</span>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Study cards</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-mono">{analytics?.cards_total ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Due today</span>
                  <span className="font-mono">{analytics?.due_today ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Reviewed today</span>
                  <span className="font-mono">{analytics?.reviews_today ?? 0}</span>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">Daily quote</h3>
            <p className="text-base italic text-muted-foreground">“{analytics?.daily_quote || "Be consistent, not perfect."}”</p>
          </Card>
        </TabsContent>

        <TabsContent value="heatmap" className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Activity heatmap (last 90 days)</h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">Less <span className="w-4 h-4 rounded bg-heat-1" /> <span className="w-4 h-4 rounded bg-heat-5" /> More</div>
              </div>
            </div>
            <div className="space-y-2">
              {weeks.map((week, wi) => (
                <div key={week.start} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 text-right">{formatDate(week.start)}</span>
                  <div className="flex gap-1">
                    {week.days.map(d => <HeatmapCell key={d.day} day={d.day} minutes={d.minutes} reviews={d.reviews} habits={d.habits} today={d.day === new Date().toISOString().slice(0,10)} />)}
                    {[...Array(7 - week.days.length)].map((_, i) => <div key={i} className="size-8 rounded" />)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="subjects" className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3">Time per subject</h3>
            {analytics?.per_subject?.length ? (
              <div className="space-y-2">
                {analytics.per_subject.map((s, i) => (
                  <motion.div key={s.subject} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white" style={{ background: `var(--chart-${(i % 6) + 1})` }}>{String.fromCharCode(65 + i)}</span>
                    <span className="flex-1 truncate font-medium">{s.subject}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                      <motion.div className="h-full rounded-full" style={{ background: `var(--chart-${(i % 6) + 1})` }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (s.minutes / Math.max(...analytics.per_subject.map(x => x.minutes))) * 100)}%` }} transition={{ delay: i * 0.05, duration: 0.5 }} />
                    </div>
                    <span className="text-sm font-mono text-muted-foreground w-20 text-right">{s.minutes}m</span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No subject data yet. Log focus sessions with Spaces that have a subject.</p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="weak" className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3">Weak topics (high lapse rate)</h3>
            {analytics?.weak_topics?.length ? (
              <div className="space-y-2">
                {analytics.weak_topics.map((w, i) => (
                  <motion.div key={w.topic} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <p className="font-medium">{w.topic}</p>
                      <p className="text-xs text-muted-foreground">{w.samples} reviews · {Math.round(w.lapse_rate * 100)}% lapse rate</p>
                    </div>
                    <Badge variant={w.lapse_rate > 0.4 ? "danger" : "warning"}>{Math.round(w.lapse_rate * 100)}%</Badge>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Review more flashcards to identify weak topics.</p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}