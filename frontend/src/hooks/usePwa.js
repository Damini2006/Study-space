/**
 * PWA / offline hooks: service worker lifecycle, network status, and the
 * review-queue flush that keeps FSRS grades intact across connectivity drops.
 */
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { flushQueue, queueSize, registerBackgroundSync } from "@/lib/offline-queue";
import { studyApi } from "@/services/api-services";

/** True when the app is running as an installed PWA. */
export function useIsStandalone() {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const update = () =>
      setStandalone(window.navigator.standalone === true || mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return standalone;
}

/**
 * Registers the service worker and reports install state.
 * `updateReady` flips true when a new worker is waiting — the UI can then offer
 * a "reload for latest" affordance instead of silently swapping underneath.
 */
export function useServiceWorker() {
  const [supported] = useState(() => typeof navigator !== "undefined" && "serviceWorker" in navigator);
  const [registered, setRegistered] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!supported || !import.meta.env.PROD) return undefined;

    let cancelled = false;
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((reg) => {
        if (cancelled) return;
        setRegistered(true);
        if (reg.waiting) setUpdateReady(true);
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          next?.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {
        /* registration failed — the app still works, just without offline */
      });

    const onControllerChange = () => setUpdateReady(false);
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
  }, [supported]);

  const applyUpdate = useCallback(() => {
    navigator.serviceWorker?.getRegistration().then((reg) => {
      reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    });
  }, []);

  return { supported, registered, updateReady, applyUpdate };
}

/** Online/offline flag, plus a short grace period to avoid UI thrash on blips. */
export function useOnlineStatus(graceMs = 1500) {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [offlineSince, setOfflineSince] = useState(null);

  useEffect(() => {
    let timer = null;
    const goOnline = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      setOnline(true);
      setOfflineSince(null);
    };
    const goOffline = () => {
      setOnline(false);
      setOfflineSince(Date.now());
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Report "still offline" only after the grace period so a 200ms blip on a
  // flaky connection doesn't flash a banner at the user.
  const [showBanner, setShowBanner] = useState(false);
  useEffect(() => {
    if (offlineSince === null) {
      setShowBanner(false);
      return undefined;
    }
    const timer = setTimeout(() => setShowBanner(true), graceMs);
    return () => clearTimeout(timer);
  }, [offlineSince, graceMs]);

  return { online, showBanner, offlineSince };
}

/**
 * Drains the offline review queue whenever we're back online or the tab regains
 * focus. Returns the live pending count so the UI can show "3 grades saved".
 */
export function useReviewQueueSync() {
  const { online } = useOnlineStatus();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    setPending(await queueSize());
  }, []);

  const flush = useCallback(async () => {
    const { flushed, remaining } = await flushQueue((entry) => studyApi.review(entry));
    setPending(remaining);
    if (flushed > 0) {
      queryClient.invalidateQueries({ queryKey: ["study", "due"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    }
    return { flushed, remaining };
  }, [queryClient]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (online) flush();
  }, [online, flush]);

  useEffect(() => {
    const onFocus = () => {
      if (navigator.onLine) flush();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [flush]);

  return { pending, flush, refresh, registerBackgroundSync };
}