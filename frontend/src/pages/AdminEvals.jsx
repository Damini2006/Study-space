import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart3,
  Download,
  Loader2,
  ShieldCheck,
  Table,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { evalsApi } from "@/services/api-services";
import { pollInterval, progressPercent, resultsToCsv, selectConfigs } from "@/lib/evals";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";
import { ConfidenceMeter } from "@/components/ui/confidence-meter";

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

/**
 * What a RUN contains, as opposed to what one config switches on: run
 * config is the whole plan ({configs, limit}), not a layer tuple —
 * rendering it through ConfigBadge would say "Baseline" for every run.
 */
function PlanBadge({ config }) {
  const names = config?.configs;
  if (!Array.isArray(names)) return <Badge variant="default" className="text-[10px]">—</Badge>;
  return (
    <Badge variant="default" className="text-[10px]">
      {names.length}{names.length === 1 ? " config" : " configs"}
    </Badge>
  );
}

function AverageMeter({ label, value }) {
  return (
    <div className="p-3 rounded-lg bg-surface-2 border border-border">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      {value !== null ? (
        <ConfidenceMeter value={value} size="sm" showLabel={false} className="w-20" />
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
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
  const total = summary.total ?? 0;
  const passed = summary.passed ?? 0;
  const done = summary.done ?? 0;
  const inFlight = run.status === "pending" || run.status === "running";
  const percent = run.status === "running" ? progressPercent(summary) : null;
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
          <PlanBadge config={run.config} />
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
          <span className="font-mono text-success">{inFlight ? done : passed}</span>
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
        <div className="space-y-1">
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            {percent !== null ? (
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.4 }}
              />
            ) : (
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: "45%" }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {percent !== null ? `${done} / ${total} questions` : "Starting…"}
          </p>
        </div>
      )}

      <div className="flex items-center gap-1 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={() => showDetails(run.id)}>
          <Table className="size-3.5 mr-1" /> Details
        </Button>
        {run.status === "completed" && (
          <Button variant="ghost" size="sm" onClick={() => onRun(run.id, "export")}>
            <Download className="size-3.5 mr-1" /> Export
          </Button>
        )}
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
  const [showDetail, setShowDetail] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState("csv");

  // Poll while any run is pending or running — the worker moves runs
  // forward server-side, so a settled list stops refetching.
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["evals", "runs"],
    queryFn: evalsApi.listRuns,
    refetchInterval: (query) => pollInterval(query.state.data),
  });

  const startRun = useMutation({
    mutationFn: (body) => evalsApi.startRun(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evals", "runs"] });
      success("Evaluation started.");
    },
    onError: error,
  });

  const start = () => {
    const selected = selectConfigs(configs);
    if (selected.length === 0) {
      error("Pick at least one configuration.");
      return;
    }
    startRun.mutate(
      { label, dataset_version: dataset, configs: selected, limit: limit || undefined },
      { onSuccess: () => setRunning(false) },
    );
  };

  const handleExport = (format) => {
    setExportFormat(format);
    setShowExport(true);
  };

  const confirmExport = async () => {
    try {
      const results = await evalsApi.results(detailRun?.id);
      if (!Array.isArray(results) || results.length === 0) {
        throw new Error("This run has no results to export.");
      }
      const body = exportFormat === "csv"
        ? resultsToCsv(results)
        : JSON.stringify(results, null, 2);
      const blob = new Blob([body], {
        type: exportFormat === "csv" ? "text/csv;charset=utf-8" : "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evals-report-${new Date().toISOString().slice(0, 10)}.${exportFormat}`;
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
    const run = runs.find((r) => r.id === runId);
    if (action === "view") {
      setDetailRun(run);
      setShowDetail(true);
    } else if (action === "export") {
      // The export dialog downloads `detailRun`'s results, so target it first.
      setDetailRun(run);
      handleExport("csv");
    }
  };

  // Means across completed runs, skipping runs where the metric could not
  // be measured (null) rather than counting them as zero.
  const completedRuns = runs.filter(r => r.status === "completed");
  const meanOf = (key) => {
    const values = completedRuns
      .map((r) => r.summary?.[key])
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return null;
    return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
  };
  const avgFaithfulness = meanOf("faithfulness");
  const avgRelevancy = meanOf("relevancy");
  const avgPrecision = meanOf("precision");
  const avgRecall = meanOf("recall");

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
              <AverageMeter label="Faithfulness" value={avgFaithfulness} />
              <AverageMeter label="Relevancy" value={avgRelevancy} />
              <AverageMeter label="Precision" value={avgPrecision} />
              <AverageMeter label="Recall" value={avgRecall} />
            </div>
          )}

          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              onRun={(id, action) => handleRunAction(run.id, action)}
              showDetails={(id) => handleRunAction(id, "view")}
            />
          ))}
        </div>
      )}

      {/* Single-run detail sheet */}
      <Dialog
        open={showDetail && !!detailRun}
        onClose={() => setShowDetail(false)}
        title={detailRun ? `Run · ${detailRun.label}` : "Run details"}
        className="max-w-lg"
      >
        {detailRun && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  detailRun.status === "completed"
                    ? "success"
                    : detailRun.status === "failed"
                      ? "danger"
                      : "default"
                }
              >
                {detailRun.status}
              </Badge>
              <PlanBadge config={detailRun.config} />
            </div>
            {detailRun.status === "failed" && detailRun.error && (
              <p className="text-xs text-destructive">{detailRun.error}</p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                ["Created", formatDate(detailRun.created_at)],
                ["Dataset", detailRun.dataset_version || "—"],
                ["Questions", detailRun.summary?.total ?? 0],
                ["Passed", detailRun.summary?.passed ?? 0],
                [
                  "Hallucination rate",
                  detailRun.summary?.hallucination_rate != null
                    ? `${Math.round(detailRun.summary.hallucination_rate * 100)}%`
                    : "—",
                ],
                [
                  "Avg. latency",
                  detailRun.summary?.avg_latency_ms != null
                    ? `${detailRun.summary.avg_latency_ms} ms`
                    : "—",
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-2 border-b border-border pb-1">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-xs">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Dialog>

      {/* Export sheet */}
      <Dialog
        open={showExport}
        onClose={() => setShowExport(false)}
        title="Export results"
        description={detailRun ? `Download ${detailRun.label} as CSV or JSON.` : undefined}
        className="max-w-md"
      >
        <fieldset className="mt-1">
          <legend className="text-[13px] font-medium">Format</legend>
          <div className="mt-3 flex gap-2">
            {["csv", "json"].map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => handleExport(fmt)}
                aria-pressed={exportFormat === fmt}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors",
                  exportFormat === fmt
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground"
                )}
              >
                {fmt}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowExport(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={confirmExport} disabled={!detailRun}>
            <Download className="size-3.5" aria-hidden /> Download
          </Button>
        </div>
      </Dialog>
    </div>
  );
}