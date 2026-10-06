import { expect, test } from "@playwright/test";

/**
 * Track 7 shipped a Content-Security-Policy that was verified by hand, once,
 * against a throwaway server. These tests make that verification permanent:
 * `vite preview` now replays vercel.json's headers, so every end-to-end run
 * is also a run of the policy that actually ships.
 *
 * The listener is installed via addInitScript so it is in place before the
 * document's own scripts run — a violation during boot is exactly the case
 * worth catching, and it would otherwise be missed by anything attached
 * after goto().
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener(
      "securitypolicyviolation",
      (event) => {
        window.__cspViolations.push(
          `${event.violatedDirective} blocked ${event.blockedURI}`
        );
      },
      true
    );
  });
});

test("preview sends the headers production sends", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response.headers();

  // Asserted rather than assumed. Without this, the violation test below
  // would pass just as happily against a server that sends no policy at all.
  const csp = headers["content-security-policy"];
  expect(csp, "no Content-Security-Policy on the document").toBeTruthy();
  expect(csp).toContain("script-src");
  expect(csp).toContain("'sha256-");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
});

test("its own policy blocks nothing the app needs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  // Images and fonts settle after first paint, so give them a chance to be
  // blocked before looking.
  await page.waitForLoadState("networkidle");
  expect(
    await page.evaluate(() => window.__cspViolations),
    "the policy blocked something on the landing page"
  ).toEqual([]);

  // A lazily-loaded chunk. script-src failing on a dynamic import would not
  // show up while checking only the landing page's own scripts.
  await page.goto("/privacy");
  await expect(page.locator("body")).toContainText("What we collect");
  expect(
    await page.evaluate(() => window.__cspViolations),
    "the policy blocked the /privacy chunk or one of its assets"
  ).toEqual([]);
});
