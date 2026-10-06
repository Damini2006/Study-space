/**
 * Touch gesture hooks for mobile review: swipe-to-grade with haptics, and
 * pull-to-refresh. Both are written against Pointer Events so a single code
 * path covers touch, pen and mouse, and both respect `prefers-reduced-motion`
 * by skipping the spring animation (the gesture itself still works).
 */
import { useCallback, useEffect, useRef, useState } from "react";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Short haptic pulse via the Vibration API. Silently no-ops where unsupported
 * (iOS Safari), so callers don't need to guard.
 */
export function useHaptics(enabled = true) {
  return useCallback(
    (pattern = 12) => {
      if (!enabled) return;
      try {
        navigator.vibrate?.(pattern);
      } catch {
        /* unsupported */
      }
    },
    [enabled]
  );
}

/**
 * Horizontal swipe detector for a single card.
 *
 * @param {object}   options
 * @param {number}   options.threshold      px before a swipe counts (default 90)
 * @param {number}   options.maxVerticalPx  vertical travel that cancels the gesture
 * @param {(dir: "left"|"right") => void} options.onSwipe
 * @param {() => void} [options.onStart]
 * @param {() => void} [options.onCancel]
 * @returns {{bind: object, dx: number, dy: number, swiping: boolean, progress: number, travel: {current: number}}}
 *
 * `travel.current` is the furthest horizontal distance of the gesture that just
 * ended, reset on the next pointerdown. Callers need it because browsers fire
 * `click` after `pointerup` even when the pointer moved — without this, a swipe
 * that started on a button also triggers that button's onClick.
 */
export function useSwipe({
  threshold = 90,
  maxVerticalPx = 48,
  onSwipe,
  onStart,
  onCancel,
  enabled = true,
} = {}) {
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const start = useRef(null);
  const fired = useRef(false);
  const travel = useRef(0);

  const onPointerDown = useCallback(
    (e) => {
      if (!enabled || fired.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      travel.current = 0;
      setSwiping(true);
      onStart?.();
    },
    [enabled, onStart]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!start.current || start.current.id !== e.pointerId) return;
      const nextDx = e.clientX - start.current.x;
      const nextDy = e.clientY - start.current.y;
      // Lock to horizontal: once the user clearly moves vertically we stop
      // tracking so page scrolling isn't fought over.
      if (Math.abs(nextDy) > Math.abs(nextDx) && Math.abs(nextDy) > maxVerticalPx) {
        start.current = null;
        setSwiping(false);
        onCancel?.();
        return;
      }
      travel.current = Math.max(travel.current, Math.abs(nextDx));
      setDx(nextDx);
      setDy(nextDy);
    },
    [maxVerticalPx, onCancel]
  );

  const onPointerUp = useCallback(() => {
    if (!start.current) {
      setSwiping(false);
      return;
    }
    start.current = null;
    setSwiping(false);
    if (Math.abs(dx) >= threshold) {
      fired.current = true;
      onSwipe?.(dx < 0 ? "left" : "right");
    }
    setDx(0);
    setDy(0);
  }, [dx, threshold, onSwipe]);

  // Reset the fired guard on the next macrotask so the same gesture can't grade
  // two cards when the card list re-renders under the pointer.
  useEffect(() => {
    if (fired.current) {
      const timer = setTimeout(() => {
        fired.current = false;
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  });

  return {
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    dx,
    dy,
    swiping,
    travel,
    progress: Math.min(1, Math.abs(dx) / threshold),
  };
}

/**
 * Is the given element scrolled to the top of its scroll chain?
 *
 * The naive check — `el.scrollTop > 0` — is wrong for an element that can't
 * scroll at all, which is the common case when the page body scrolls instead.
 * There `scrollTop` is permanently 0, so pull-to-refresh would arm even when the
 * user had scrolled halfway down and pulling would fight the bounce.
 */
function isAtTop(el) {
  if (el && el.scrollTop > 0) return false;
  const elScrolls = Boolean(el && el.scrollHeight > el.clientHeight + 1);
  if (!elScrolls && typeof window !== "undefined" && window.scrollY > 0) return false;
  return true;
}

/**
 * Pull-to-refresh on a scroll container. Only arms when the container is
 * already scrolled to the top, so it never competes with normal scrolling.
 *
 * @returns {{bind: object, pullDistance: number, refreshing: boolean, indicator: object}}
 */
export function usePullToRefresh({ onRefresh, threshold = 72, maxPull = 110 } = {}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const scrollEl = useRef(null);

  const bindRef = useCallback(
    (node) => {
      scrollEl.current = node;
    },
    []
  );

  const onTouchStart = useCallback((e) => {
    if (!isAtTop(scrollEl.current) || refreshing) return;
    startY.current = e.touches[0].clientY;
  }, [refreshing]);

  const onTouchMove = useCallback(
    (e) => {
      if (startY.current === null || refreshing) return;
      // Native overscroll on iOS fights the transform, so disable it while the
      // gesture is active.
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }
      if (scrollEl.current && !scrollEl.current.style.overscrollBehaviorY) {
        scrollEl.current.style.overscrollBehaviorY = "contain";
      }
      // Rubber-band: resistance increases with distance so it feels physical.
      setPullDistance(Math.min(maxPull, delta * 0.5));
    },
    [maxPull, refreshing]
  );

  const onTouchEnd = useCallback(async () => {
    if (startY.current === null) return;
    startY.current = null;
    if (scrollEl.current) scrollEl.current.style.overscrollBehaviorY = "";
    if (pullDistance < threshold) {
      setPullDistance(0);
      return;
    }
    setRefreshing(true);
    setPullDistance(maxPull);
    try {
      await onRefresh?.();
    } catch {
      // A failed refresh is not something the gesture can act on, and letting
      // the rejection escape would surface as an unhandled rejection from a
      // touchend handler. The spinner still has to come down either way.
    } finally {
      setRefreshing(false);
      setPullDistance(0);
    }
  }, [maxPull, onRefresh, pullDistance, threshold]);

  const opacity = pullDistance === 0 ? 0 : Math.min(1, pullDistance / threshold);
  const rotation = prefersReducedMotion() ? 0 : (pullDistance / threshold) * 180;

  return {
    ref: bindRef,
    bind: { onTouchStart, onTouchMove, onTouchEnd },
    pullDistance,
    refreshing,
    indicator: {
      opacity,
      transform: `rotate(${rotation}deg)`,
      armed: pullDistance >= threshold,
    },
  };
}