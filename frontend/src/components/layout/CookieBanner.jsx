import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const KEY = "studyspace.cookieConsent";

/** localStorage throws in private browsing / when full — the banner still works without it. */
function remember(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Storage unavailable: consent simply won't persist for this visit.
  }
  // Tell the page as well as storage: the vitals snapshot is holding its
  // first load for exactly this answer, and it cannot read storage in a
  // browser that refused to write it.
  window.dispatchEvent(new CustomEvent("studyspace:consent", { detail: value }));
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true);
    } catch {
      // Storage unavailable: show the banner rather than silently skipping it.
    }
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
              remember("declined");
              setVisible(false);
            }}
          >
            Decline
          </Button>
          <Button
            size="sm"
            onClick={() => {
              remember("accepted");
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
