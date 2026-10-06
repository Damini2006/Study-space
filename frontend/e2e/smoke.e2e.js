import { expect, test } from "@playwright/test";

/**
 * The floor everything else stands on: the production bundle boots in a real
 * browser, React mounts, and nothing throws while doing it.
 *
 * `pageerror` is the assertion worth having — an uncaught exception is what a
 * broken build actually looks like from a user's side, and it is invisible to
 * the unit suite because jsdom never runs the bundle.
 */
test("the landing page boots without throwing", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto("/");

  // RouteMeta sets this from the route table, so it only matches if the app
  // rendered rather than leaving Vite's placeholder title in place.
  await expect(page).toHaveTitle(
    "StudySpace — source-grounded AI study workspace"
  );

  // The header nav is only in the document once React has committed.
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  // A fresh context has no consent choice stored, so the banner should show.
  await expect(page.locator('[aria-label="Cookie consent"]')).toBeVisible();

  expect(errors, "no uncaught exceptions on the landing page").toEqual([]);
});

test("the sign-in link routes client-side instead of reloading", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto("/");

  // A value on `window` survives a client-side route change and is lost to a
  // document reload — so this is what actually proves the claim in the name.
  await page.evaluate(() => {
    window.__marker = "intact";
  });

  // The desktop header link; the same href also exists in the collapsed
  // mobile menu, hence :visible.
  await page.locator('header a[href="/auth"]:visible').click();

  await expect(page).toHaveURL(/\/auth$/);
  await expect(page).toHaveTitle("Sign in — StudySpace");
  expect(await page.evaluate(() => window.__marker)).toBe("intact");

  expect(errors).toEqual([]);
});
