/**
 * TrendBars must draw bars a reader can actually see.
 *
 * The bar's height was a percentage of its column, but that column sits in a
 * flex row with `align-items: flex-end` — which does not stretch, so the
 * column had an auto height. A percentage of an auto height never resolves
 * (it falls back to the content height of an empty div, i.e. zero), so every
 * bar collapsed onto its 3px `minHeight`: the tallest day and a zero day drew
 * identically, and the chart conveyed nothing visually. It affected the
 * Dashboard's "Focus this week" card as well as Profile's.
 *
 * Heights are now absolute pixels derived from the `height` prop, so the bar
 * resolves without needing a layout pass. That is also what makes this
 * testable: jsdom has no layout, so a percentage could never be checked
 * here — which is exactly why the bug survived.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendBars } from "@/components/charts/charts";

const WEEK = [
  { label: "T", value: 20 },
  { label: "W", value: 0 },
  { label: "T", value: 25 },
  { label: "F", value: 0 },
  { label: "S", value: 15 },
  { label: "S", value: 10 },
  { label: "M", value: 80 },
];

const heights = (nodes) => nodes.map((n) => n.style.height);

describe("TrendBars", () => {
  it("sizes every bar in pixels so it resolves without a layout pass", () => {
    render(<TrendBars data={WEEK} height={120} format={(v) => `${v}m`} />);
    const bars = screen.getAllByRole("img");
    const drawn = heights(bars);

    // A percentage here silently collapses to minHeight; px cannot.
    expect(drawn.every((h) => h.endsWith("px"))).toBe(true);
    expect(drawn).toEqual(["30px", "0px", "38px", "0px", "23px", "15px", "120px"]);
  });

  it("draws the busiest day tallest and a zero day flat", () => {
    render(<TrendBars data={WEEK} height={120} format={(v) => `${v}m`} />);
    const px = heights(screen.getAllByRole("img")).map((h) => parseFloat(h));

    expect(Math.max(...px)).toBe(120); // the 80m day fills the chart
    expect(px[1]).toBe(0); // W had no session
    expect(px[3]).toBe(0); // F had no session
    // 20m against an 80m maximum is a quarter of the chart
    expect(px[0]).toBe(30);
    // Two days of different minutes must not draw at the same height —
    // that is the symptom of the collapse.
    expect(px[0]).not.toBe(px[6]);
    expect(px[4]).not.toBe(px[5]);
  });

  it("keeps a sliver of colour for a day with minutes below the rounding", () => {
    render(<TrendBars data={[{ label: "M", value: 80 }, { label: "T", value: 1 }]} height={120} />);
    const px = heights(screen.getAllByRole("img")).map((h) => parseFloat(h));
    expect(px[1]).toBe(3); // visible, never a bare 0-height ghost
  });

  it("reports each day to screen readers with its real value", () => {
    render(<TrendBars data={WEEK} height={120} format={(v) => `${v}m`} />);
    expect(screen.getByLabelText("M: 80m")).toBeInTheDocument();
    expect(screen.getByLabelText("W: 0m")).toBeInTheDocument();
  });
});
