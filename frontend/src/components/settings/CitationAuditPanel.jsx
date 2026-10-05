/**
 * Citation audit — batch-verifies every citation attached to answers in a space
 * and reports which ones no longer hold up: a chunk that has since been
 * deleted, a source edited after the answer was written, or a citation whose
 * retrieval score was too weak to support the sentence.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ragApi } from "@/services/api-services";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Loader2, ScanSearch } from "lucide-react";

const STATUS_META = {
  verified: { label: "Verified", tone: "success", icon: CheckCircle2 },
  missing_chunk: { label: "Chunk missing", tone: "destructive", icon: AlertTriangle },
  stale: { label: "Source changed since", tone: "warning", icon: AlertTriangle },
  low_score: { label: "Weak match", tone: "warning", icon: AlertTriangle },
  broken: { label: "Broken link", tone: "destructive", icon: AlertTriangle },
};

function toneClass(tone) {
  if (tone === "success") return "text-success";
  if (tone === "destructive") return "text-destructive";
  if (tone === "warning") return "text-warning";
  return "text-muted-foreground";
}

function StatTile({ label, value, tone }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold", tone && toneClass(tone))}>{value}</p>
    </div>
  );
}

export default function CitationAuditPanel({ spaceId }) {
  const { error } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");

  const audit = useMutation({
    mutationFn: () => ragApi.auditCitations(spaceId, {}),
    onError: error,
  });

  const report = audit.data;

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

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">Citation audit</h3>
            <p className="text-sm text-muted-foreground">
              Re-checks every citation in this space against the chunks that still exist.
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
          <div className="grid gap-2 pt-1 sm:grid-cols-3">
            <StatTile label="Citations checked" value={report.total_citations} />
            <StatTile label="Verified" value={report.verified} tone="success" />
            <StatTile label="Need attention" value={report.issues} tone={report.issues ? "warning" : null} />
          </div>
        ) : null}
      </Card>

      {report ? (
        <Card className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-medium">
              {items.length} of {report.items.length} shown
            </h4>
            <div className="flex flex-wrap gap-1">
              {["all", ...new Set(report.items.map((i) => i.status))].map((status) => {
                const meta = STATUS_META[status];
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
                    {status === "all" ? "All" : (meta?.label ?? status)}
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
                <div key={`${item.message_id}-${item.chunk_id}-${item.label}`} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("size-3.5", toneClass(meta.tone))} />
                      <span className="text-sm font-medium">
                        [{item.label}] {item.source_title}
                      </span>
                    </div>
                    <Badge>{meta.label}</Badge>
                  </div>
                  {item.quote ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.quote}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Score {Number(item.score).toFixed(2)} — {item.details}
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