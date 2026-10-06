import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHaptics, usePullToRefresh, useSwipe } from "@/hooks/useGestures";

/**
 * jsdom implements no PointerEvent, so the handlers are driven with plain events
 * carrying the handful of fields the hooks actually read.
 */
function pointerEvent(x, y, { pointerType = "touch", button = 0, id = 1 } = {}) {
  const event = new Event("pointer", { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: y },
    pointerId: { value: id },
    pointerType: { value: pointerType },
    button: { value: button },
  });
  return event;
}

function touchEvent(type, clientY) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientY }],
  });
  return event;
}

describe("useHaptics", () => {
  it("vibrates with the given pattern", () => {
    const vibrate = vi.fn();
    navigator.vibrate = vibrate;
    const { result } = renderHook(() => useHaptics(true));
    act(() => result.current(25));
    expect(vibrate).toHaveBeenCalledWith(25);
  });

  it("stays silent when disabled, so reduced-motion users get no vibration", () => {
    const vibrate = vi.fn();
    navigator.vibrate = vibrate;
    const { result } = renderHook(() => useHaptics(false));
    act(() => result.current());
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("swallows a throwing Vibration API instead of breaking the gesture", () => {
    navigator.vibrate = vi.fn(() => {
      throw new Error("blocked by user settings");
    });
    const { result } = renderHook(() => useHaptics(true));
    expect(() => act(() => result.current())).not.toThrow();
  });
});

describe("useSwipe", () => {
  function setup(options = {}) {
    const onSwipe = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => useSwipe({ onSwipe, onCancel, ...options }));
    return { onSwipe, onCancel, result };
  }

  it("commits a left swipe past the threshold", () => {
    const { onSwipe, result } = setup({ threshold: 80 });
    act(() => result.current.bind.onPointerDown(pointerEvent(200, 100)));
    act(() => result.current.bind.onPointerMove(pointerEvent(100, 105)));
    act(() => result.current.bind.onPointerUp(pointerEvent(100, 105)));
    expect(onSwipe).toHaveBeenCalledWith("left");
  });

  it("commits a right swipe", () => {
    const { onSwipe, result } = setup({ threshold: 80 });
    act(() => result.current.bind.onPointerDown(pointerEvent(100, 100)));
    act(() => result.current.bind.onPointerMove(pointerEvent(190, 100)));
    act(() => result.current.bind.onPointerUp(pointerEvent(190, 100)));
    expect(onSwipe).toHaveBeenCalledWith("right");
  });

  it("ignores a drag shorter than the threshold", () => {
    const { onSwipe, result } = setup({ threshold: 80 });
    act(() => result.current.bind.onPointerDown(pointerEvent(200, 100)));
    act(() => result.current.bind.onPointerMove(pointerEvent(170, 100)));
    act(() => result.current.bind.onPointerUp(pointerEvent(170, 100)));
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("abandons the gesture once travel is clearly vertical", () => {
    // Otherwise the hook fights the page scroll for every downward drag.
    const { onSwipe, onCancel, result } = setup({ threshold: 80, maxVerticalPx: 40 });
    act(() => result.current.bind.onPointerDown(pointerEvent(200, 100)));
    act(() => result.current.bind.onPointerMove(pointerEvent(190, 200)));
    act(() => result.current.bind.onPointerUp(pointerEvent(190, 200)));
    expect(onCancel).toHaveBeenCalled();
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("reports progress so the UI can preview the outcome before release", () => {
    const { result } = setup({ threshold: 100 });
    act(() => result.current.bind.onPointerDown(pointerEvent(200, 0)));
    act(() => result.current.bind.onPointerMove(pointerEvent(150, 0)));
    expect(result.current.progress).toBeCloseTo(0.5);
    expect(result.current.dx).toBe(-50);
  });

  it("records how far the pointer travelled, so callers can suppress click", () => {
    // Browsers fire `click` after `pointerup` even when the pointer moved, so a
    // swipe that begins on a button would also run that button's onClick.
    const { result } = setup({ threshold: 80 });
    act(() => result.current.bind.onPointerDown(pointerEvent(200, 0)));
    act(() => result.current.bind.onPointerMove(pointerEvent(100, 0)));
    act(() => result.current.bind.onPointerUp(pointerEvent(100, 0)));
    expect(result.current.travel.current).toBe(100);
  });

  it("does nothing when disabled", () => {
    const { onSwipe, result } = setup({ threshold: 80, enabled: false });
    act(() => result.current.bind.onPointerDown(pointerEvent(200, 0)));
    act(() => result.current.bind.onPointerMove(pointerEvent(50, 0)));
    act(() => result.current.bind.onPointerUp(pointerEvent(50, 0)));
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("ignores a non-primary mouse button", () => {
    const { onSwipe, result } = setup({ threshold: 80 });
    act(() =>
      result.current.bind.onPointerDown(
        pointerEvent(200, 0, { pointerType: "mouse", button: 2 })
      )
    );
    act(() => result.current.bind.onPointerMove(pointerEvent(50, 0)));
    act(() => result.current.bind.onPointerUp(pointerEvent(50, 0)));
    expect(onSwipe).not.toHaveBeenCalled();
  });
});

describe("usePullToRefresh", () => {
  function setup(onRefresh = vi.fn().mockResolvedValue(undefined)) {
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, threshold: 72 }));
    const node = document.createElement("div");
    act(() => result.current.ref(node));
    return { onRefresh, result, node };
  }

  it("does not arm while the window is scrolled down", () => {
    // The element can't scroll itself, so `scrollTop` stays 0 forever — checking
    // only that would arm the gesture halfway down the page and fight the bounce.
    window.scrollY = 400;
    const { result } = setup();
    act(() => result.current.bind.onTouchStart(touchEvent("touchstart", 100)));
    act(() => result.current.bind.onTouchMove(touchEvent("touchmove", 300)));
    expect(result.current.pullDistance).toBe(0);
    window.scrollY = 0;
  });

  it("does not arm when the element itself is scrolled down", () => {
    const { result, node } = setup();
    Object.defineProperty(node, "scrollTop", { value: 120, configurable: true });
    act(() => result.current.bind.onTouchStart(touchEvent("touchstart", 100)));
    act(() => result.current.bind.onTouchMove(touchEvent("touchmove", 300)));
    expect(result.current.pullDistance).toBe(0);
  });

  it("rubber-bands the pull instead of following the finger exactly", () => {
    const { result } = setup();
    act(() => result.current.bind.onTouchStart(touchEvent("touchstart", 100)));
    act(() => result.current.bind.onTouchMove(touchEvent("touchmove", 300)));
    // 200px of finger travel becomes 100px of pull, capped at maxPull.
    expect(result.current.pullDistance).toBe(100);
  });

  it("ignores an upward drag", () => {
    const { result } = setup();
    act(() => result.current.bind.onTouchStart(touchEvent("touchstart", 300)));
    act(() => result.current.bind.onTouchMove(touchEvent("touchmove", 100)));
    expect(result.current.pullDistance).toBe(0);
  });

  it("runs onRefresh once the pull passes the threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = setup(onRefresh);
    act(() => result.current.bind.onTouchStart(touchEvent("touchstart", 100)));
    act(() => result.current.bind.onTouchMove(touchEvent("touchmove", 300)));
    expect(result.current.indicator.armed).toBe(true);
    await act(async () => {
      await result.current.bind.onTouchEnd();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });

  it("springs back without refreshing when the pull is too short", async () => {
    const onRefresh = vi.fn();
    const { result } = setup(onRefresh);
    act(() => result.current.bind.onTouchStart(touchEvent("touchstart", 100)));
    act(() => result.current.bind.onTouchMove(touchEvent("touchmove", 150)));
    await act(async () => {
      await result.current.bind.onTouchEnd();
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.pullDistance).toBe(0);
  });

  it("clears the refreshing flag even when the refresh rejects", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = setup(onRefresh);
    act(() => result.current.bind.onTouchStart(touchEvent("touchstart", 100)));
    act(() => result.current.bind.onTouchMove(touchEvent("touchmove", 300)));
    await act(async () => {
      await expect(result.current.bind.onTouchEnd()).resolves.toBeUndefined();
    });
    expect(result.current.refreshing).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });
});
