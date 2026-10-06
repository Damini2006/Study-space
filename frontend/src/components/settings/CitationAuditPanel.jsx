/**
 * Citation audit — re-checks every citation in a space and separates the ones
 * that still hold from the ones that can't be verified any more.
 *
 * The four failure modes aren't equally serious and the UI treats them
 * differently, because the reader's next action differs:
 *   broken       → the source is gone; nothing to check, re-answer the question
 *   missing_chunk→ the passage is gone; the rest of the source may still help
 *   stale        → the source changed after the answer; re-read before trusting
 *   low_score    → it was weak evidence all along; treat the claim as unproven
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ragApi } from "@/services/api-services";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, FileWarning, Loader2, ScanSearch } from "lucide-react";

const STATUS_META = {
  verified: {
    label: "Verified",
    tone: "success",
    icon: CheckCircle2,
    action: null,
  },
  missing_chunk: {
    label: "Passage deleted",
    tone: "destructive",
    icon: FileWarning,
    action: "The cited passage is gone, but the rest of the source may still support the answer.",
  },
  broken: {
    label: "Source deleted",
    tone: "destructive",
    icon: AlertTriangle,
    action: "This can no longer be checked. Ask the question again to re-ground it.",
  },
  stale: {
    label: "Source changed",
    tone: "warning",
    icon: AlertTriangle,
    action: "The source was edited after this answer, so the passage may not say this anymore.",
  },
  low_score: {
    label: "Weak match",
    tone: "warning",
    icon: AlertTriangle,
    action: "The passage was a poor match for the question even when the answer was written.",
  },
};

function toneClass(tone) {
  if (tone === "success") return "text-success";
  if (tone === "destructive") return "text-destructive";
  if (tone === "warning") return "text-warning";
  return "text-muted-foreground";
}

function StatTile({ label, value, tone, sub }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold", tone && toneClass(tone))}>{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export default function CitationAuditPanel({ spaceId }) {
  const { error } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");

  const audit = useMutation({
    mutationFn: () => ragApi.auditCitations(spaceId),
    onError: error,
  });

  const report = audit.data;

  // Statuses actually present in the report, worst-first, so the filter chips
  // never offer a bucket that has no rows in it.
  const presentStatuses = useMemo(() => {
    if (!report) return [];
    const order = ["broken", "missing_chunk", "stale", "low_score", "verified"];
    const seen = new Set(report.items.map((i) => i.status));
    return order.filter((s) => seen.has(s));
  }, [report]);

  const items = useMemo(() => {
    const all = report?.items ?? [];
    return statusFilter === "all" ? all : all.filter((i) => i.status === statusFilter);
  }, [report, statusFilter]);

  if (!spaceId) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Open a space to audit its citations.</p>
      </Card>
    );
  }

  const pctVerified =
    report && report.total_citations > 0
      ? Math.round((report.verified / report.total_citations) * 100)
      : null;

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">Citation audit</h3>
            <p className="text-sm text-muted-foreground">
              Re-checks every citation in this space against the passages that still exist.
            </p>
          </div>
          <Button onClick={() => audit.mutate()} disabled={audit.isPending}>
            {audit.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ScanSearch className="size-4" />
            )}
            <span className="ml-1">{report ? "Re-run audit" : "Run audit"}</span>
          </Button>
        </div>

        {report ? (
          <>
            <div className="grid gap-2 pt-1 sm:grid-cols-3">
              <StatTile label="Citations checked" value={report.total_citations} />
              <StatTile
                label="Verified"
                value={report.verified}
                tone="success"
                sub={pctVerified !== null ? `${pctVerified}%` : null}
              />
              <StatTile
                label="Need attention"
                value={report.issues}
                tone={report.issues ? "warning" : null}
              />
            </div>
            {report.truncated ? (
              <p className="text-xs text-warning">
                Showing the most recent 2,000 citations. Older ones weren't checked.
              </p>
            ) : null}
          </>
        ) : null}
      </Card>

      {report ? (
        <Card className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-medium">
              {items.length} of {report.items.length} shown
            </h4>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  statusFilter === "all"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              {presentStatuses.map((status) => {
                const meta = STATUS_META[status] ?? { label: status };
                const count = report.items.filter((i) => i.status === status).length;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      statusFilter === status
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {meta.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {report.total_citations === 0
                ? "No citations yet — ask a question or generate a study output first."
                : "No citations match this filter."}
            </p>
          ) : null}

          <div className="space-y-2">
            {items.map((item) => {
              const meta = STATUS_META[item.status] ?? STATUS_META.verified;
              const Icon = meta.icon;
              return (
                <div
                  key={`${item.citation_id}-${item.label}`}
                  className="rounded-md border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className={cn("size-3.5 shrink-0", toneClass(meta.tone))} />
                      <span className="truncate text-sm font-medium">
                        [{item.label}] {item.source_title}
                      </span>
                    </div>
                    <Badge>{meta.label}</Badge>
                  </div>
                  {item.quote ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {item.quote}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.status === "verified"
                      ? "Still intact since this answer was written."
                      : meta.action}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
