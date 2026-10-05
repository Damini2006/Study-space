import { AlertCircle, BadgeCheck, CircleHelp, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Answer confidence badges — colour is NEVER the only signal: every badge
 * carries an icon and a text label (spec §3.9).
 */
const CONFIG = {
  verified: {
    label: "Verified",
    icon: BadgeCheck,
    variant: "success",
    title: "Every claim was checked against its cited source passage",
  },
  low_confidence: {
    label: "Low confidence",
    icon: ShieldAlert,
    variant: "warning",
    title: "Some statements could not be fully verified against your sources",
  },
  not_found: {
    label: "Not found",
    icon: CircleHelp,
    variant: "info",
    title: "Your sources do not contain an answer to this question",
  },
  pending: {
    label: "Checking…",
    icon: CircleHelp,
    variant: "default",
    title: "Verifying the answer against your sources",
  },
};

export function StatusBadge({ status, className }) {
  const cfg = CONFIG[status] || CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} title={cfg.title} className={cn("uppercase tracking-wide", className)}>
      <Icon className="size-3" aria-hidden />
      {cfg.label}
    </Badge>
  );
}

/** Ingestion status badge (queued / processing / ready / failed). */
const SOURCE_STATES = {
  queued: { label: "Queued", variant: "default", icon: CircleHelp },
  processing: { label: "Processing…", variant: "info", icon: CircleHelp },
  ready: { label: "Ready", variant: "success", icon: BadgeCheck },
  failed: { label: "Failed", variant: "danger", icon: AlertCircle },
};

export function SourceStatusBadge({ status }) {
  const cfg = SOURCE_STATES[status] || SOURCE_STATES.queued;
  const Icon = cfg.icon;
  const isActive = status === "processing";
  return (
    <Badge variant={cfg.variant}>
      <Icon className={cn("size-3", isActive && "animate-pulse")} aria-hidden />
      {cfg.label}
    </Badge>
  );
}

/** Live dot indicator with pulse for active states. */
export function StatusDot({ active = false, className, label }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1.5",
        className
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          active ? "bg-success animate-pulse" : "bg-muted-foreground/50"
        )}
        aria-hidden
      />
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  );
}
