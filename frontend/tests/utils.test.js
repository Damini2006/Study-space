import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clamp, formatBytes, formatClock, initials, throttle } from "@/lib/utils";

describe("formatBytes", () => {
  it("handles the unit boundaries", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1536 * 1024)).toBe("1.5 MB");
  });

  it("treats a missing value as zero", () => {
    expect(formatBytes()).toBe("0 B");
  });
});

describe("formatClock", () => {
  it("zero-pads minutes and seconds", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(9)).toBe("00:09");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(600)).toBe("10:00");
  });

  it("clamps negatives instead of showing -mm:ss", () => {
    expect(formatClock(-30)).toBe("00:00");
  });

  it("floors fractional seconds", () => {
    expect(formatClock(59.9)).toBe("00:59");
  });
});

describe("clamp", () => {
  it("bounds a value on both sides", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });
});

describe("initials", () => {
  it("takes initials from a full name", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  ada   lovelace ")).toBe("AL");
  });

  it("handles a single word and empty input", () => {
    expect(initials("ada")).toBe("A");
    expect(initials("")).toBe("?");
    expect(initials(undefined)).toBe("?");
  });
});

describe("throttle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs immediately, then suppresses calls inside the window", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("a");
    throttled("b");
    throttled("c");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");

    vi.advanceTimersByTime(100);
    throttled("d");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("d");
  });
});
