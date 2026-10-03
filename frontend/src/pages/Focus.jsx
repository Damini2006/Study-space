import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Target,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/dialog";
import AmbientMixer from "@/components/focus/AmbientMixer";
import { focusApi } from "@/services/api-services";
import { useToast } from "@/components/ui/toast";
import { cn, formatClock, formatDate } from "@/lib/utils";

const DEFAULT_FOCUS = 25;
const DEFAULT_BREAK = 5;

function SessionCard({ session }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <span className={cn("size-10 rounded-full flex items-center justify-center text-sm font-medium", session.kind === "focus" ? "bg-primary/10 text-primary" : "bg-success-bg text-success")}>
        {session.kind === "focus" ? <Target className="size-5" /> : <CheckCircle2 className="size-5" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium capitalize">{session.kind}</p>
        <p className="text-sm text-muted-foreground">
          {formatClock(session.duration_min * 60)} · {formatDate(session.started_at)}
        </p>
      </div>
      <span className="text-sm font-mono text-muted-foreground">{session.duration_min}m</span>
    </Card>
  );
}

function TimerCircle({ progress, children }) {
  const circumference = 2 * Math.PI * 90;
  return (
    <svg className="relative w-40 h-40 -rotate-90" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="8" className="text-surface-2" />
      <circle
        cx="100" cy="100" r="90"
        fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        className="text-primary transition-transform duration-500"
        style={{ filter: "drop-shadow(0 0 8px currentColor)" }}
      />
      <g className="absolute inset-0 flex items-center justify-center">{children}</g>
    </svg>
  );
}

export default function Focus() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState("focus");
  const [duration, setDuration] = useState(DEFAULT_FOCUS);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(DEFAULT_FOCUS * 60);
  const [completed, setCompleted] = useState(0);
  const intervalRef = useRef(null);
  
  const { data: sessions = [] } = useQuery({ queryKey: ["focus", "sessions"], queryFn: () => focusApi.sessions(50) });
  
  const createSession = useMutation({
    mutationFn: (body) => focusApi.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["focus", "sessions"] });
      success(`${kind === "focus" ? "Focus" : "Break"} session logged.`);
    },
    onError: error,
  });

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => setRemaining(r => {
        if (r <= 1) {
          setRunning(false);
          setCompleted(c => c + 1);
          createSession.mutate({ kind, duration_min: duration, completed: true });
          if (kind === "focus") {
            setKind("break");
            setDuration(DEFAULT_BREAK);
            setRemaining(DEFAULT_BREAK * 60);
          } else {
            setKind("focus");
            setDuration(DEFAULT_FOCUS);
            setRemaining(DEFAULT_FOCUS * 60);
          }
          return 0;
        }
        return r - 1;
      }), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, remaining]);

  const progress = (duration * 60 - remaining) / (duration * 60);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Focus</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Pomodoro sessions with automatic break switching.</p>
        </div>
        <Badge variant={kind === "focus" ? "primary" : "success"}>{kind.charAt(0).toUpperCase() + kind.slice(1)}</Badge>
      </div>

      {/* Timer */}
      <Card className="p-8 text-center">
        <div className="relative mx-auto mb-6">
          <TimerCircle progress={progress}>
            <div className="flex flex-col items-center">
              <span className="text-5xl font-mono font-bold tabular-nums">{formatClock(remaining)}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{kind === "focus" ? "Focus" : "Break"}</span>
            </div>
          </TimerCircle>
        </div>
        
        <div className="flex items-center justify-center gap-3 mb-4">
          <Button
            variant={running ? "secondary" : "default"}
            size="lg"
            onClick={() => setRunning(!running)}
            disabled={running && remaining === 0}
            className="min-w-[120px]"
          >
            {running ? <Pause className="size-5" /> : <Play className="size-5" />}
            {running ? "Pause" : "Start"}
          </Button>
          <Button variant="outline" size="lg" onClick={() => {
            setRunning(false);
            setRemaining(duration * 60);
          }}>
            <RotateCcw className="size-5" /> Reset
          </Button>
        </div>

        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <span>{completed} completed this session</span>
          <span className="px-2 py-0.5 rounded bg-surface-2">Total focus: {sessions.filter(s => s.kind === "focus").reduce((a, s) => a + s.duration_min, 0)}m</span>
        </div>

        {/* Duration picker */}
        <div className="mt-6 pt-6 border-t border-border space-y-3">
          <Label>Session length ({kind === "focus" ? "focus" : "break"} minutes)</Label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="1"
              max={kind === "focus" ? 90 : 30}
              value={duration}
              onChange={e => {
                const v = parseInt(e.target.value);
                setDuration(v);
                if (!running) setRemaining(v * 60);
              }}
              className="flex-1 accent-primary"
            />
            <Input type="number" min="1" max={kind === "focus" ? 90 : 30} value={duration} onChange={e => { const v = parseInt(e.target.value) || 1; setDuration(v); if (!running) setRemaining(v * 60); }} className="w-20 text-center" />
          </div>
        </div>
      </Card>

      <AmbientMixer />

      {/* Recent sessions */}
      <div className="space-y-3">
        <h3 className="font-semibold">Recent sessions</h3>
        {sessions.length === 0 ? (
          <Card className="p-8 text-center">
            <Clock className="size-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No sessions yet. Start your first focus session above.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 10).map(s => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}