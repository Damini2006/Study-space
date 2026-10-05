import { cn } from "@/lib/utils";

const STEPS = [
  { threshold: 0.8, label: "High", color: "bg-success" },
  { threshold: 0.6, label: "Medium", color: "bg-warning" },
  { threshold: 0.4, label: "Low", color: "bg-destructive" },
  { threshold: 0, label: "Very Low", color: "bg-muted" },
];

export function ConfidenceMeter({ value, size = "md", showLabel = true, className }) {
  const step = STEPS.find((s) => value >= s.threshold) || STEPS[STEPS.length - 1];
  const percentage = Math.round(value * 100);

  const sizeClasses = {
    sm: "h-1.5",
    md: "h-2",
    lg: "h-3",
  };

  const labelSizes = {
    sm: "text-[10px]",
    md: "text-xs",
    lg: "text-sm",
  };

  return (
    <div className={cn("w-full flex flex-col gap-1", className)}>
      <div
        className={cn("relative rounded-full overflow-hidden bg-surface-2", sizeClasses[size])}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${percentage}% - ${step.label} confidence`}
        aria-label="Confidence level"
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500", step.color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className={cn("font-mono font-medium", labelSizes[size])}>{percentage}%</span>
          <span className={cn("text-muted-foreground", labelSizes[size])}>{step.label} confidence</span>
        </div>
      )}
    </div>
  );
}

export function LayerStatusBadge({ 
  name, 
  enabled, 
  running = false, 
  className 
}) {
  const configs = {
    relevance_gate: { label: "Relevance Gate", icon: "🛡️" },
    citation_validation: { label: "Citation Check", icon: "📎" },
    claim_verification: { label: "Claim Verify", icon: "✓" },
    graceful_not_found: { label: "Not Found", icon: "💡" },
  };

  const config = configs[name] || { label: name, icon: "⚙️" };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
        enabled
          ? running
            ? "bg-primary/10 text-primary border border-primary/30"
            : "bg-success/10 text-success border border-success/30"
          : "bg-muted text-muted-foreground border border-border",
        className
      )}
      title={running ? `${config.label} is running…` : enabled ? `${config.label} active` : `${config.label} disabled`}
    >
      <span aria-hidden>{config.icon}</span>
      <span>{config.label}</span>
      {running && <span className="size-1.5 rounded-full bg-primary animate-pulse" />}
    </span>
  );
}

export function CitationQualityScore({ citations = [], className }) {
  if (citations.length === 0) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        No citations
      </span>
    );
  }

  const verified = citations.filter((c) => c.verified).length;
  const total = citations.length;
  const score = verified / total;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ConfidenceMeter value={score} size="sm" showLabel={false} className="w-24" />
      <span className="text-xs text-muted-foreground">
        {verified}/{total} verified
      </span>
    </div>
  );
}

export function ClaimVerificationHighlight({ 
  claim, 
  onViewEvidence,
  className 
}) {
  const isSupported = claim.supported === true;
  const score = claim.judge_score ?? 0.5;

  return (
    <div
      className={cn(
        "relative p-2 rounded-lg border transition-colors",
        isSupported
          ? "bg-success/5 border-success/30"
          : "bg-destructive/5 border-destructive/30",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm">{claim.text}</p>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <ConfidenceMeter value={score} size="sm" showLabel={false} className="w-20" />
            <span className={cn("font-medium", isSupported ? "text-success" : "text-destructive")}>
              {isSupported ? "Supported" : "Not supported"}
            </span>
          </div>
        </div>
        {onViewEvidence && claim.chunk_id && (
          <button
            type="button"
            onClick={() => onViewEvidence(claim.chunk_id)}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            View source
          </button>
        )}
      </div>
    </div>
  );
}

export function NotFoundSuggestions({ suggestions = [], className }) {
  return (
    <div className={cn("space-y-2 p-3 rounded-lg bg-info/5 border border-info/30", className)}>
      <p className="text-sm font-medium text-info">Try one of these:</p>
      <ul className="space-y-1" role="list">
        {suggestions.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-1.5 rounded-full bg-info" aria-hidden />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}