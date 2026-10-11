/**
 * Pure maths behind the visualisations — no JSX, so these live apart from the
 * components (which keeps react-refresh happy) and are directly unit-testable.
 *
 * Every function is honest by construction: arcs skip zero slices and cover
 * exactly the whole ring, a trend arrow only appears when the comparison is
 * real, and a zero total never divides by zero.
 */

/* A fixed, theme-aware palette for categorical slices (donut / legends). */
export const SERIES_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--primary-soft)",
  "var(--accent-soft)",
  "var(--citation-text)",
];

/** Sum a list of numbers, guarding the divide-by-zero a zero-total donut hits. */
export function totalOf(values) {
  return values.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
}

/**
 * The user's local calendar day as YYYY-MM-DD. A heatmap cell must be the day
 * as the reader lives it, so this avoids toISOString()'s UTC rollover.
 */
export function toLocalIso(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/**
 * Build an honest, zero-filled series of the last `n` days ending today from a
 * sparse heatmap. The heatmap skips inactive days, so slicing it would silently
 * compress time; this pins each calendar day in place so a gap really is a zero,
 * not a shorter chart.
 * Returns [{ label, value, day }] oldest -> newest (label = weekday initial).
 */
export function lastNDaysSeries(heatmap, valueKey, n = 7) {
  const byDay = new Map();
  for (const d of heatmap || []) {
    byDay.set(String(d.day).slice(0, 10), Number(d[valueKey]) || 0);
  }
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const iso = toLocalIso(date);
    out.push({
      day: iso,
      // getDay() is 0=Sun..6=Sat, matching this S M T W T F S initial array.
      label: ["S", "M", "T", "W", "T", "F", "S"][date.getDay()],
      value: byDay.get(iso) || 0,
    });
  }
  return out;
}

/**
 * Turn raw values into per-slice arc geometry (fractions of the ring). Kept pure
 * so the "slices add up and skip zero-value entries" claim is testable.
 * Returns [{ value, fraction, offset, length }]; offset/length are fractions of
 * the full circumference, starting at 12 o'clock going clockwise.
 */
export function donutArcs(values) {
  const total = totalOf(values);
  if (total <= 0) return [];
  let cursor = 0;
  return values
    .map((value) => ({ value, fraction: value / total }))
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const arc = { ...slice, offset: cursor, length: slice.fraction };
      cursor += slice.fraction;
      return arc;
    });
}

/**
 * Percentage change between two periods, for a real trend arrow. Returns null
 * when there is no meaningful comparison (no baseline, or a zero baseline with
 * activity this period) so callers can show "no comparison" instead of an
 * invented "+100%".
 */
export function trendPct(thisPeriod, lastPeriod) {
  if (!Number.isFinite(thisPeriod) || !Number.isFinite(lastPeriod)) return null;
  if (lastPeriod === 0) return thisPeriod === 0 ? 0 : null;
  return Math.round(((thisPeriod - lastPeriod) / lastPeriod) * 100);
}

/**
 * Lay a sparse { day: "YYYY-MM-DD", ... } list onto a Monday-first grid of whole
 * weeks ending this week, so the heatmap has a stable shape even on days with no
 * activity. Each inner array is one column of seven day-cells (Mon..Sun);
 * `future` marks dates after today so they render as placeholders, not activity.
 */
export function heatmapWeeks(days, valueKey, weeks = 12) {
  const byDay = new Map();
  for (const d of days || []) {
    byDay.set(String(d.day).slice(0, 10), Number(d[valueKey]) || 0);
  }

  const today = new Date();
  // JS: getDay() 0=Sun..6=Sat; shift so Monday=0..Sunday=6.
  const todayIdx = (today.getDay() + 6) % 7;
  const end = new Date(today);
  end.setDate(today.getDate() - todayIdx); // this week's Monday

  const grid = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const col = [];
    for (let dow = 0; dow < 7; dow += 1) {
      const date = new Date(end);
      date.setDate(end.getDate() - w * 7 + dow);
      col.push({
        day: toLocalIso(date),
        value: byDay.get(toLocalIso(date)) || 0,
        future: date > today,
      });
    }
    grid.push(col);
  }
  return grid;
}

/** Pick a legend bucket (0..4) for a value against the set maximum. */
export function heatLevel(value, max) {
  if (!value || value <= 0) return 0;
  if (max <= 0) return 0;
  const ratio = value / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/** The five-step intensity ramp for the heatmap, keyed by heatLevel bucket. */
export const HEAT_FILL = [
  "var(--surface-2)",
  "color-mix(in srgb, var(--primary) 30%, var(--surface-2))",
  "color-mix(in srgb, var(--primary) 55%, var(--surface-2))",
  "color-mix(in srgb, var(--primary) 80%, var(--surface-2))",
  "var(--primary)",
];
