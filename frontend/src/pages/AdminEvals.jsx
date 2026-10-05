import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Play,
  ShieldCheck,
  Table,
  TrendingUp,
  XCircle,
  Zap,
  CreditCard,
  Clock,
  Layout,
  Eye,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { evalsApi } from "@/services/api-services";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";
import { ConfidenceMeter, LayerStatusBadge } from "@/components/ui/confidence-meter";
import { useRef } from "react";

const DEFAULT_CONFIGS = [
  { name: "baseline", relevance_gate: false, citation_validation: false, claim_verification: false, enabled: true },
  { name: "+relevance-gate", relevance_gate: true, citation_validation: false, claim_verification: false, enabled: true },
  { name: "+citation-validation", relevance_gate: true, citation_validation: true, claim_verification: false, enabled: true },
  { name: "+claim-verification", relevance_gate: true, citation_validation: true, claim_verification: true, enabled: true },
];

function ConfigBadge({ config }) {
  const parts = [];
  if (config.relevance_gate) parts.push("Gate");
  if (config.citation_validation) parts.push("Cite");
  if (config.claim_verification) parts.push("Claims");
  return parts.length ? (
    <span className="flex flex-wrap gap-1">
      {parts.map(p => <Badge key={p} variant="default" className="text-[10px]">{p}</Badge>)}
    </span>
  ) : (
    <Badge variant="default" className="text-[10px]">Baseline</Badge>
  );
}

function MetricCell({ value, higherIsBetter = true }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  const color = higherIsBetter
    ? value >= 0.8 ? "text-success" : value >= 0.6 ? "text-warning" : "text-destructive"
    : value <= 0.2 ? "text-success" : value <= 0.4 ? "text-warning" : "text-destructive";
  return <span className={cn("font-mono font-medium", color)}>{typeof value === "number" ? (value * 100).toFixed(1) + "%" : value}</span>;
}

function RunCard({ run, onRun, showDetails }) {
  const summary = run.summary || {};
  const total = summary.total || 0;
  const passed = summary.passed || 0;
  const hallucination = summary.hallucination_rate ?? null;
  const notFound = summary.correct_not_found_rate ?? null;
  const avgLatency = summary.avg_latency_ms ?? null;
  const cost = summary.cost_usd ?? null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={run.status === "completed" ? "success" : run.status === "running" ? "info" : run.status === "failed" ? "danger" : "default"}>
            {run.status}
          </Badge>
          <span className="text-sm font-medium">{run.label}</span>
          <ConfigBadge config={run.config} />
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{formatDate(run.created_at)}</div>
          {run.finished_at && <div>Finished {formatDate(run.finished_at)}</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total questions</span>
          <span className="font-mono">{total}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Completed</span>
          <span className="font-mono text-success">{passed}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Hallucination rate</span>
          <MetricCell value={hallucination} higherIsBetter={false} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Correct "not found"</span>
          <MetricCell value={notFound} />
        </div>
      </div>

      {avgLatency !== null && (
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Avg. latency</span>
          <span>{avgLatency} ms</span>
        </div>
      )}

      {cost !== null && (
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Est. cost</span>
          <span>${cost.toFixed(4)}</span>
        </div>
      )}

      {run.status === "running" && (
        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: "45%" }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }} />
        </div>
      )}

      {run.status === "awaiting_approval" && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onRun(run.id, "approve")}><CheckCircle2 className="size-3.5 mr-1" /> Approve</Button>
          <Button variant="destructive" size="sm" onClick={() => onRun(run.id, "reject")}><XCircle className="size-3.5 mr-1" /> Reject</Button>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={() => showDetails(run.id)}><Table className="size-3.5 mr-1" /> Details</Button>
        {run.status === "pending" && <Button size="sm" onClick={() => onRun(run.id, "run")}><Play className="size-3.5 mr-1" /> Run</Button>}
      </div>
    </Card>
  );
}

export default function AdminEvals() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [configs, setConfigs] = useState(DEFAULT_CONFIGS);
  const [label, setLabel] = useState("eval");
  const [dataset, setDataset] = useState("v1");
  const [limit, setLimit] = useState(100);
  const [detailRun, setDetailRun] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState("csv");

  const { data: runs = [], isLoading } = useQuery({ queryKey: ["evals", "runs"], queryFn: evalsApi.listRuns });

  const startRun = useMutation({
    mutationFn: (body) => evalsApi.startRun(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evals", "runs"] });
      success("Evaluation started.");
    },
    onError: error,
  });

  const start = () => {
    startRun.mutate({ label, dataset_version: dataset, configs, limit: limit || undefined });
    setRunning(false);
  };

  const handleExport = async (format) => {
    setExportFormat(format);
    setShowExport(true);
  };

  const confirmExport = async () => {
    try {
      const res = await fetch(evalsApi.results(detailRun?.id || ""), {
        // Export endpoint
      });
      if (!res.ok) throw new Error("Export failed");
      
      let blob = await res.blob();
      let url, filename;
      
      if (exportFormat === "csv") {
        filename = `evals-report-${new Date().toISOString().slice(0,10)}.csv`;
      } else if (exportFormat === "json") {
        filename = `evals-report-${new Date().toISOString().slice(0,10)}.json`;
      } else {
        filename = `evals-report-${new Date().toISOString().slice(0,10)}.pdf`;
      }
      
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      success(`${exportFormat.toUpperCase()} exported.`);
      setShowExport(false);
    } catch (err) {
      error(err.message || "Export failed.");
      setShowExport(false);
    }
  };

  const handleRunAction = (runId, action) => {
    if (action === "view") setDetailRun(runs.find(r => r.id === runId));
    else if (action === "run") queryClient.invalidateQueries({ queryKey: ["evals", "runs"] });
  };

  // Compute summary stats
  const completedRuns = runs.filter(r => r.status === "completed");
  const avgFaithfulness = completedRuns.length > 0 
    ? Math.round((completedRuns.reduce((sum, r) => sum + (r.summary?.faithfulness ?? 0), 0) / completedRuns.length) * 100) / 100
    : null;
  const avgRelevancy = completedRuns.length > 0
    ? Math.round((completedRuns.reduce((sum, r) => sum + (r.summary?.relevancy ?? 0), 0) / completedRuns.length) * 100) / 100
    : null;
  const avgPrecision = completedRuns.length > 0
    ? Math.round((completedRuns.reduce((sum, r) => sum + (r.summary?.precision ?? 0), 0) / completedRuns.length) * 100) / 100
    : null;
  const avgRecall = completedRuns.length > 0
    ? Math.round((completedRuns.reduce((sum, r) => sum + (r.summary?.recall ?? 0), 0) / completedRuns.length) * 100) / 100
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin / Evals</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Run the hallucination evaluation suite and compare safety layers.</p>
        </div>
        <Button onClick={() => setRunning(true)}><ShieldCheck className="size-4 mr-1" /> Run evaluation</Button>
      </div>

      <Dialog open={running} onClose={() => setRunning(false)} title="Run evaluation" className="max-w-xl">
        <form onSubmit={e => { e.preventDefault(); start(); }} className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="eval_label">Run label</Label>
            <Input id="eval_label" value={label} onChange={e => setLabel(e.target.value)} placeholder="midterm-baseline" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eval_dataset">Dataset version</Label>
            <Input id="eval_dataset" value={dataset} onChange={e => setDataset(e.target.value)} placeholder="v1" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eval_limit">Question limit (optional)</Label>
            <Input id="eval_limit" type="number" value={limit} onChange={e => setLimit(parseInt(e.target.value) || 0)} placeholder="100" />
          </div>
          <div className="space-y-1.5">
            <Label>Configurations</Label>
            <div className="space-y-2">
              {configs.map((c, i) => (
                <label key={c.name} className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={c.enabled !== false}
                    onChange={e => setConfigs(cs => cs.map((cc, j) => j === i ? { ...cc, enabled: e.target.checked } : cc))}
                    className="size-4 accent-primary"
                  />
                  <ConfigBadge config={c} />
                  <span className="ml-2 text-sm">{c.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setRunning(false)}>Cancel</Button>
            <Button type="submit" disabled={startRun.isPending}>
              {startRun.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
              Start evaluation
            </Button>
          </div>
        </form>
      </Dialog>

      {isLoading ? (
        <div className="space-y-3">
          {[0,1,2].map(i => <div key={i} className="skeleton h-28 w-full rounded-xl" />)}
        </div>
      ) : runs.length === 0 ? (
        <Card className="p-8 text-center">
          <BarChart3 className="size-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold">No evaluation runs yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Click "Run evaluation" to start the suite.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Summary stats row */}
          {completedRuns.length > 0 && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="p-3 rounded-lg bg-surface-2 border border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Faithfulness</p>
                <ConfidenceMeter value={avgFaithfulness} size="sm" showLabel={false} className="w-20" />
              </div>
              <div className="p-3 rounded-lg bg-surface-2 border border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Relevancy</p>
                <ConfidenceMeter value={avgRelevancy} size="sm" showLabel={false} className="w-20" />
              </div>
              <div className="p-3 rounded-lg bg-surface-2 border border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Precision</p>
                <ConfidenceMeter value={avgPrecision} size="sm" showLabel={false} className="w-20" />
              </div>
              <div className="p-3 rounded-lg bg-surface-2 border border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Recall</p>
                <ConfidenceMeter value={avgRecall} size="sm" showLabel={false} className="w-20" />
              </div>
            </div>
          )}

          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              onRun={(id, action) => handleRunAction(run.id, action)}
            />
          ))}
        </div>
      )}
    </div>
  );
}