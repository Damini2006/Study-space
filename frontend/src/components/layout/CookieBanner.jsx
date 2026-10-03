import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const KEY = "studyspace.cookieConsent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true);
    } catch {}
  }, []);
  if (!visible) return null;
  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-4 py-3 backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          We use cookies to keep your session signed in and remember your theme. No ad tracking.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              try { localStorage.setItem(KEY, "declined"); } catch {}
              setVisible(false);
            }}
          >
            Decline
          </Button>
          <Button
            size="sm"
            onClick={() => {
              try { localStorage.setItem(KEY, "accepted"); } catch {}
              setVisible(false);
            }}
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
