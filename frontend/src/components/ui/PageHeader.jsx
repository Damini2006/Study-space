import { cn } from "@/lib/utils";

/**
 * Consistent page header used by every /app/* page.
 * - title/subtitle are the only required strings.
 * - action is a single node (Link/Button/Fragment with buttons).
 * - badge is optional (e.g. "Demo workspace").
 * - className extends the root flex container.
 */
export function PageHeader({ title, subtitle, action, badge, className }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {badge ? (
          <span className="rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-semibold uppercase text-info">
            {badge}
          </span>
        ) : null}
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}