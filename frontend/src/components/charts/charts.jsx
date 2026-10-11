import { cn } from "@/lib/utils";
import {
  HEAT_FILL,
  SERIES_COLORS,
  donutArcs,
  heatLevel,
  heatmapWeeks,
} from "@/components/charts/chart-maths";

/**
 * Real data visualisation primitives. Every chart here is fed only data the
 * API actually returned — there are no placeholder series, no smoothing that
 * invents points, and no fake "trend" arrows. Each one renders an honest
 * empty state (via ChartCard) instead of an empty frame when it has nothing
 * to draw.
 *
 * They are plain SVG driven by CSS custom properties, so a chart follows the
 * active theme exactly like the rest of the app, and a screen-reader gets a
 * hidden data table rather than a bare "image" label.
 *
 * The pure maths lives in ./chart-maths (import from there directly); this
 * file holds only components, so fast-refresh keeps working.
 */

/** Visually-hidden data table so a chart is readable without sight. */
function A11yTable({ caption, rows, columns }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            {row.cells.map((cell, i) => (
              <td key={i}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A titled card that owns a chart's empty state honestly: when there is no
 * data it says so in words rather than drawing an empty frame.
 */
export function ChartCard({ title, description, action, isEmpty, emptyMessage, children, className }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]", className)}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-none tracking-tight">{title}</h3>
          {description ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {isEmpty ? (
        <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          {emptyMessage || "No data yet."}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * Horizontal labelled bars — the right shape for ranked categories whose
 * labels (subject names, tags) need room to breathe.
 */
export function BarList({ items, format = (v) => v, caption, color = "var(--primary)", className }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className={cn("space-y-2.5", className)}>
      <A11yTable
        caption={caption || "Values"}
        columns={["Label", "Value"]}
        rows={items.map((i) => ({ key: i.label, cells: [i.label, String(format(i.value))] }))}
      />
      {items.map((item) => (
        <div key={item.label} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{format(item.value)}</span>
          </div>
          <div
            role="img"
            aria-label={`${item.label}: ${format(item.value)}`}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: color }}
            />
          </div>
          {item.hint ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{item.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Vertical bars for a time series (a week of focus minutes). Real values
 * only; a zero day is a flat baseline, never a smoothed curve.
 */
export function TrendBars({ data, height = 96, format = (v) => v, caption, className }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={className}>
      <A11yTable
        caption={caption || "By day"}
        columns={["Day", "Value"]}
        rows={data.map((d) => ({ key: d.label, cells: [d.label, String(format(d.value))] }))}
      />
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d) => {
          const pct = d.value > 0 ? Math.max(3, (d.value / max) * 100) : 0;
          return (
            <div key={d.label} className="group flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                {format(d.value)}
              </span>
              <div
                role="img"
                aria-label={`${d.label}: ${format(d.value)}`}
                title={`${d.label}: ${format(d.value)}`}
                className="w-full rounded-t-md bg-primary/85 transition-all duration-500 ease-out group-hover:bg-primary"
                style={{ height: `${pct}%`, minHeight: d.value > 0 ? 3 : 1, background: d.value > 0 ? undefined : "var(--surface-2)" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[10px] text-muted-foreground">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Donut with a centred total; slices come from real shares. */
export function DonutChart({ slices, size = 148, thickness = 22, centerLabel, centerValue, format = (v) => v, className }) {
  const arcs = donutArcs(slices.map((s) => s.value));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={centerLabel ? `${centerLabel}: ${format(centerValue)}` : "Distribution"}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={thickness}
          />
          {arcs.map((arc, i) => (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={thickness}
              strokeDasharray={`${arc.length * circumference} ${circumference}`}
              strokeDashoffset={-arc.offset * circumference}
              transform={`rotate(-90 ${center} ${center})`}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerLabel ? (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{centerLabel}</span>
          ) : null}
          <span className="text-lg font-bold tabular-nums">{format(centerValue)}</span>
        </div>
      </div>
      <A11yTable
        caption={centerLabel || "Distribution"}
        columns={["Category", "Value"]}
        rows={slices.map((s) => ({ key: s.label, cells: [s.label, String(format(s.value))] }))}
      />
    </div>
  );
}

/** Colour swatch legend that pairs with a donut or any SERIES_COLORS chart. */
export function SeriesLegend({ slices, format = (v) => v, className }) {
  return (
    <ul className={cn("space-y-1.5", className)}>
      {slices.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2 text-xs">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{s.label}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{format(s.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Tiny inline sparkline for a stat card; a flat line for all-zero data. */
export function Sparkline({ points, width = 72, height = 24, className, label }) {
  if (!points || points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => [i * step, height - ((p - min) / span) * (height - 2) - 1]);
  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${d} L${width} ${height} L0 ${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      role="img"
      aria-label={label || "Trend"}
    >
      <path d={area} fill="var(--primary)" opacity="0.12" />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * GitHub-style contribution heatmap over whole weeks. Renders only days the
 * dataset actually covers; future days are dimmed placeholders.
 */
export function ActivityHeatmap({ days, valueKey = "minutes", weeks = 12, format = (v) => v, caption, className }) {
  const grid = heatmapWeeks(days, valueKey, weeks);
  const max = Math.max(1, ...grid.flat().map((c) => c.value));
  const allCells = grid.flat();
  const rows = allCells
    .filter((c) => c.value > 0)
    .map((c) => ({ key: c.day, cells: [c.day, String(format(c.value))] }));
  return (
    <div className={className}>
      {rows.length > 0 ? (
        <A11yTable caption={caption || "Activity by day"} columns={["Day", "Value"]} rows={rows} />
      ) : null}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {grid.map((col, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {col.map((cell) => (
              <span
                key={cell.day}
                title={`${cell.day}${cell.value > 0 ? `: ${format(cell.value)}` : ""}`}
                className="size-2.5 rounded-[3px]"
                style={{
                  background: cell.future
                    ? "transparent"
                    : HEAT_FILL[heatLevel(cell.value, max)],
                  border: cell.future ? "1px dashed var(--border)" : undefined,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChartCard;
