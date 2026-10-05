/**
 * Install / notification controls for the PWA. Deliberately surfaces the
 * permission state rather than nagging: install prompts need a user gesture on
 * both Chrome and iOS, and denied notifications can't be re-asked silently.
 */
import { useEffect, useState } from "react";
import { useIsStandalone, useServiceWorker } from "@/hooks/usePwa";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Bell, Download, Loader2, RefreshCw } from "lucide-react";

const VAPID_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_VAPID_PUBLIC_KEY) || "";

export default function PwaSettings() {
  const standalone = useIsStandalone();
  const { registered, updateReady, applyUpdate } = useServiceWorker();
  const { success, error, toast } = useToast();
  const [installEvent, setInstallEvent] = useState(null);
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [subscribing, setSubscribing] = useState(false);

  // `beforeinstallprompt` fires once per session, so capture it at mount.
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      toast("This browser doesn't support notifications.");
      return;
    }
    if (!VAPID_KEY) {
      error({
        title: "Not configured",
        description: "Set VITE_VAPID_PUBLIC_KEY to enable push reminders.",
      });
      return;
    }
    setSubscribing(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        toast("Notification permission denied.");
        return;
      }
      const reg = await navigator.serviceWorker?.ready;
      if (!reg) throw new Error("Service worker not ready");
      // Uint8Array conversion for the VAPID key — the API wants raw bytes.
      const vapid = Uint8Array.from(
        atob(VAPID_KEY.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0)
      );
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapid });
      success("Review reminders enabled.");
    } catch (err) {
      error({ title: "Could not enable reminders", description: err.message });
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Install &amp; offline</h3>
        <p className="text-sm text-muted-foreground">
          Install StudySpace for a full-screen app, offline access to what you've already opened,
          and review reminders at the right interval.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <div>
            <Label>App status</Label>
            <p className="text-xs text-muted-foreground">
              {standalone
                ? "Running as an installed app."
                : registered
                  ? "Running in a browser tab."
                  : "Offline caching inactive outside production builds."}
            </p>
          </div>
          {standalone ? <Badge variant="info">Installed</Badge> : <Badge>Browser</Badge>}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <div className="min-w-0">
            <Label>Install to home screen</Label>
            <p className="text-xs text-muted-foreground">
              {standalone
                ? "Already installed."
                : installEvent
                  ? "Ready to install."
                  : "On iOS, use Share → Add to Home Screen."}
            </p>
          </div>
          <Button
            size="sm"
            disabled={!installEvent || standalone}
            onClick={async () => {
              if (!installEvent) return;
              installEvent.prompt();
              const choice = await installEvent.userChoice;
              if (choice?.outcome === "accepted") success("StudySpace installed.");
              setInstallEvent(null);
            }}
          >
            <Download className="size-4" />
            <span className="ml-1">Install</span>
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <div className="min-w-0">
            <Label className="flex items-center gap-1.5">
              <Bell className="size-3.5" /> Review reminders
            </Label>
            <p className="text-xs text-muted-foreground">
              {subscribing
                ? "Enabling…"
                : permission === "granted"
                  ? "You'll get a nudge when a card comes due."
                  : permission === "denied"
                    ? "Blocked in your browser settings."
                    : "Get notified when a card becomes due."}
            </p>
          </div>
          <Switch
            checked={permission === "granted"}
            onChange={(on) => (on ? enableNotifications() : null)}
            label="Review reminders"
          />
        </div>

        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
            updateReady && "border-primary/40 bg-primary/5"
          )}
        >
          <div className="min-w-0">
            <Label>App version</Label>
            <p className="text-xs text-muted-foreground">
              {updateReady ? "A newer version is ready to load." : "You're on the latest version."}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={applyUpdate} disabled={!updateReady}>
            {updateReady ? <RefreshCw className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
            <span className="ml-1">{updateReady ? "Reload" : "Up to date"}</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}