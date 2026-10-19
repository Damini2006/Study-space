import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/charts/charts";

/**
 * Unified stat card used by Dashboard, Analytics, Profile, Finance.
 * - label/value/icon/hint/to are the basic props.
 * - sparkline: array of numbers (uses ChartCard's Sparkline).
 * - delta: number | null | undefined — rendered by caller (DeltaBadge lives in each page for colour independence).
 * - trendLabel: used for sparkline aria-label.
 */
export function StatCard({ label, value, icon: Icon, hint, to, sparkline, delta, trendLabel, className }) {
  const inner = (
    <div className={cn("p-4 flex flex-col gap-2 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden />
        {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline points={sparkline} label={trendLabel || `${label} trend, last 7 days`} />
        ) : null}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {delta !== undefined && delta !== null ? (
          <span data-delta={delta}>{/* rendered by page-specific DeltaBadge */}</span>
        ) : null}
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  );

  return to ? <a href={to} className="no-underline">{inner}</a> : inner;
}