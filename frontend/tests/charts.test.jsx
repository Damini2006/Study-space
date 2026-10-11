/**
 * Chart maths: the helpers behind the visualisations. These pin the claims
 * that make a chart honest — arcs skip zero-value slices and add up to the
 * whole ring, a trend arrow is only shown when the comparison is real, and
 * a zero total never divides by zero. Each is written to fail if the logic
 * is mutated.
 */
import { describe, expect, it } from "vitest";
import {
  donutArcs,
  heatLevel,
  heatmapWeeks,
  lastNDaysSeries,
  toLocalIso,
  totalOf,
  trendPct,
} from "@/components/charts/chart-maths";

describe("totalOf", () => {
  it("sums finite values", () => {
    expect(totalOf([1, 2, 3.5])).toBe(6.5);
  });

  it("treats non-finite entries as zero instead of poisoning the sum", () => {
    expect(totalOf([2, NaN, undefined, 3, null])).toBe(5);
  });
});

describe("donutArcs", () => {
  it("makes slices that sum to the whole ring, starting at the top", () => {
    const arcs = donutArcs([1, 1, 2]);
    expect(arcs).toHaveLength(3);
    expect(arcs[0].offset).toBe(0);
    // fractions of the whole: 0.25, 0.25, 0.5
    expect(arcs.map((a) => a.fraction)).toEqual([0.25, 0.25, 0.5]);
    // offsets are cumulative so the ring is fully covered with no gap/overlap
    expect(arcs.map((a) => a.offset)).toEqual([0, 0.25, 0.5]);
    const covered = arcs.reduce((s, a) => s + a.length, 0);
    expect(covered).toBeCloseTo(1, 6);
  });

  it("drops zero-value slices so they claim no arc of the ring", () => {
    expect(donutArcs([0, 2, 0, 2])).toHaveLength(2);
    expect(donutArcs([0, 2, 0, 2]).map((a) => a.fraction)).toEqual([0.5, 0.5]);
  });

  it("returns nothing for an all-zero (or empty) total rather than dividing by zero", () => {
    expect(donutArcs([])).toEqual([]);
    expect(donutArcs([0, 0, 0])).toEqual([]);
  });
});

describe("trendPct", () => {
  it("computes real growth and decline against a non-zero baseline", () => {
    expect(trendPct(150, 100)).toBe(50);
    expect(trendPct(50, 100)).toBe(-50);
  });

  it("returns null when there is no honest comparison (zero baseline, but activity now)", () => {
    // "+100%" would be invented; the caller must show "no comparison" instead.
    expect(trendPct(30, 0)).toBeNull();
  });

  it("returns 0 when both periods are genuinely zero", () => {
    expect(trendPct(0, 0)).toBe(0);
  });

  it("returns null for non-finite input", () => {
    expect(trendPct(NaN, 10)).toBeNull();
    expect(trendPct(10, undefined)).toBeNull();
  });
});

describe("heatLevel", () => {
  it("is 0 for a zero value regardless of the maximum", () => {
    expect(heatLevel(0, 100)).toBe(0);
  });

  it("buckets a value into 1..4 against the set maximum", () => {
    expect(heatLevel(10, 100)).toBe(1); // <=25%
    expect(heatLevel(40, 100)).toBe(2); // <=50%
    expect(heatLevel(70, 100)).toBe(3); // <=75%
    expect(heatLevel(100, 100)).toBe(4); // top quartile
  });

  it("stays 0 when the maximum is non-positive", () => {
    expect(heatLevel(5, 0)).toBe(0);
  });
});

describe("lastNDaysSeries", () => {
  it("pins each of the last N calendar days, oldest first, with real length", () => {
    expect(lastNDaysSeries([], "minutes", 7)).toHaveLength(7);
    expect(lastNDaysSeries([], "minutes", 5)).toHaveLength(5);
  });

  it("zero-fills an inactive day rather than compressing the timeline", () => {
    // Only "today" has minutes; every earlier day must still be present as 0.
    const today = toLocalIso(new Date());
    const series = lastNDaysSeries([{ day: today, minutes: 45 }], "minutes", 7);
    expect(series).toHaveLength(7);
    expect(series[6].value).toBe(45); // newest = today
    expect(series.slice(0, 6).every((d) => d.value === 0)).toBe(true);
  });

  it("labels each day with a weekday initial", () => {
    const series = lastNDaysSeries([], "minutes", 7);
    for (const d of series) {
      expect("SMTWTFS".includes(d.label)).toBe(true);
    }
  });
});

describe("heatmapWeeks", () => {
  const days = [
    { day: "2026-10-06", minutes: 30 }, // a Monday
    { day: "2026-10-07", minutes: 10 },
  ];

  it("lays sparse days onto a grid of whole seven-day columns", () => {
    const grid = heatmapWeeks(days, "minutes", 2);
    expect(grid).toHaveLength(2); // two week columns
    expect(grid.every((col) => col.length === 7)).toBe(true); // Mon..Sun each
  });

  it("carries a known day's real value into its cell", () => {
    const grid = heatmapWeeks(days, "minutes", 3);
    const flat = grid.flat();
    const cell = flat.find((c) => c.day === "2026-10-06");
    expect(cell.value).toBe(30);
  });

  it("flags exactly the days after today as future, never a past day", () => {
    const grid = heatmapWeeks(days, "minutes", 3);
    const todayIso = toLocalIso(new Date());
    for (const cell of grid.flat()) {
      // the invariant: future <=> the date is strictly after today
      expect(cell.future).toBe(cell.day > todayIso);
    }
  });
});
