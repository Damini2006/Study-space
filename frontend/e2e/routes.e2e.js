import { expect, test } from "@playwright/test";

/**
 * The public routes, hit the way a search engine or a pasted link hits them:
 * a full page load at the exact URL rather than a client-side navigation from
 * the landing page. One `page.goto` therefore covers two things at once — the
 * server has to answer a path it has no file for with index.html, and the
 * lazy chunk for that route has to arrive and render.
 *
 * Titles and descriptions are asserted against RouteMeta's own copy. They are
 * two separate code paths (`document.title` versus create-or-update on a meta
 * tag), so a pass on one says nothing about the other.
 */
const ROUTES = [
  {
    path: "/",
    title: "StudySpace — source-grounded AI study workspace",
    desc: "Chat with your notes, generate study material, review with spaced repetition.",
  },
  {
    path: "/auth",
    title: "Sign in — StudySpace",
    desc: "Sign in to your StudySpace workspace.",
  },
  {
    path: "/privacy",
    title: "Privacy Policy — StudySpace",
    desc: "How StudySpace handles your data.",
    heading: "Privacy Policy",
  },
  {
    path: "/terms",
    title: "Terms of Service — StudySpace",
    desc: "StudySpace terms of service.",
    heading: "Terms of Service",
  },
  {
    path: "/security",
    title: "Security — StudySpace",
    desc: "Twenty security hardening controls protecting StudySpace: RLS, IDOR and injection testing, secret scanning, rate limiting and controlled attack testing.",
    heading: "Security, item by item",
  },
  {
    path: "/contact",
    title: "Contact — StudySpace",
    desc: "E-mail the StudySpace team in Bengaluru, India. Bug reports, security disclosures and partnership enquiries.",
    heading: "Talk to a human",
  },
  {
    path: "/thanks",
    title: "Welcome — StudySpace",
    desc: "Your workspace is ready.",
    heading: "all set",
  },
];

for (const route of ROUTES) {
  test(`deep link to ${route.path} renders that page`, async ({ page }) => {
    const response = await page.goto(route.path);

    // Preview has no file called /privacy. If nothing answers for it, every
    // shared link 404s before React ever gets a say.
    expect(response.status()).toBe(200);

    // React committed: #root still has nothing in it if the bundle threw.
    await expect(page.locator("#root")).not.toBeEmpty();

    await expect(page).toHaveTitle(route.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      route.desc
    );

    // Present on the code-split routes, where a title alone is not proof —
    // RouteMeta sets it from the path, so it would read correctly even if
    // the chunk had failed to load.
    if (route.heading) {
      await expect(page.locator("body")).toContainText(route.heading);
    }
  });
}

test("an unknown URL still lands in the app and says so", async ({ page }) => {
  const response = await page.goto("/definitely-not-a-page");

  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle("StudySpace");
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" })
  ).toBeVisible();
  // The path is echoed back, so someone pasting a broken link can see which
  // one it was rather than just being told it is wrong.
  await expect(page.locator("code")).toHaveText("/definitely-not-a-page");
});

test("the cookie choice is remembered across a reload", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: "Cookie consent" });

  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Accept" }).click();
  await expect(banner).toBeHidden();
  expect(
    await page.evaluate(() => localStorage.getItem("studyspace.cookieConsent"))
  ).toBe("accepted");

  await page.reload();
  await expect(banner).toBeHidden();

  // The other choice has to stick for the same reason — the banner only
  // ever appears once, so a Decline that did not persist would be
  // untestable from a user's point of view, and unnoticeable too.
  await page.evaluate(() => localStorage.removeItem("studyspace.cookieConsent"));
  await page.reload();
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Decline" }).click();
  await page.reload();
  await expect(banner).toBeHidden();
  expect(
    await page.evaluate(() => localStorage.getItem("studyspace.cookieConsent"))
  ).toBe("declined");
});

test("the footer's Privacy link pulls in a code-split page in place", async ({
  page,
}) => {
  await page.goto("/");

  // Survives a client-side navigation, cleared by a document reload — so
  // this is what proves the route change did not cost the page its state.
  await page.evaluate(() => {
    window.__marker = "intact";
  });

  await page.locator('footer a[href="/privacy"]').click();

  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator("body")).toContainText("Privacy Policy");
  expect(await page.evaluate(() => window.__marker)).toBe("intact");
});
