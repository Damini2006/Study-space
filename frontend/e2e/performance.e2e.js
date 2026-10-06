import { expect, test } from "@playwright/test";

/**
 * Budgets for a cold visit to the landing page.
 *
 * Two kinds of number here, and they are tested differently on purpose.
 *
 * The byte budgets are exact: the build is deterministic, a fresh context
 * has an empty cache, and same-origin resources report their real transfer
 * size — so they reproduce to the byte on every run and every machine.
 * That reproducibility is what makes them worth failing on: if a page that
 * costs 370 kB today starts costing 430 kB, a dependency went eager and
 * the test says so before a user pays for it.
 *
 * The paint budget is a ceiling several times above what the page needs,
 * meant to catch a catastrophe — a render-blocking request to somewhere
 * slow, a regression that doubles parse work — not a few milliseconds of
 * drift. It also has a third-party round trip in front of it: first paint
 * waits on the Google Fonts stylesheet, so tightening this number would
 * buy a test that fails when Google has a bad minute.
 *
 * First Contentful Paint rather than LCP: measured here, the LCP entry is
 * never emitted at all in this headless Chromium — neither on the
 * performance timeline nor to a buffered PerformanceObserver, three runs
 * out of three — while FP and FCP land within 50 ms of each other run to
 * run. FCP is also the metric a render-blocking stylesheet actually
 * delays, which is the regression this test exists to notice.
 *
 * What is counted: same-origin `.js` and `.css` fetched while loading `/`.
 * Cross-origin font and analytics requests report a transfer size of 0
 * (no Timing-Allow-Origin), so they fall out by construction rather than
 * by a filter that would quietly stop meaning anything.
 */
const BUDGETS = {
  // Measured baselines, tightened as code leaves the first load:
  //   370.0 kB across six files before any splitting;
  //   246.2 kB once Notes — and with it tiptap and the whole ProseMirror
  //   tree, 395 kB of the entry chunk — became a lazy route.
  // Headroom is for incidental growth, not for going eager: a new import
  // of any weight still trips this.
  jsBytes: 260 * 1024,
  // One stylesheet: the bundled index CSS, 15.9 kB as served.
  cssBytes: 20 * 1024,
  // Ceiling, not a target — see above.
  fcpMs: 4_000,
};

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

async function measureFirstLoad(page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const { fcpMs, resources } = await page.evaluate(() => ({
    // Paint entries share one entryType, so FCP is found by name rather
    // than by getEntriesByType("first-contentful-paint"), which returns
    // nothing because no such entry type exists.
    fcpMs:
      performance
        .getEntriesByType("paint")
        .find((entry) => entry.name === "first-contentful-paint")?.startTime ??
      0,
    resources: performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.startsWith(window.location.origin))
      .map((entry) => ({
        name: new URL(entry.name).pathname,
        bytes: entry.transferSize,
      })),
  }));

  const sum = (ext) =>
    resources
      .filter((entry) => entry.name.endsWith(ext))
      .reduce((total, entry) => total + entry.bytes, 0);

  return {
    fcpMs,
    jsBytes: sum(".js"),
    cssBytes: sum(".css"),
    jsRequests: resources.filter((entry) => entry.name.endsWith(".js")).length,
  };
}

test("the landing page's first load stays inside its budgets", async ({
  page,
}) => {
  const { fcpMs, jsBytes, cssBytes, jsRequests } = await measureFirstLoad(page);

  console.log(
    `[perf] / first load: js=${kib(jsBytes)} in ${jsRequests} files, ` +
      `css=${kib(cssBytes)}, fcp=${Math.round(fcpMs)}ms`
  );

  expect(
    jsBytes,
    "first-load JavaScript grew past budget. Something new is being pulled " +
      "in eagerly — look for a page in src/App.jsx that should be lazy(), or " +
      "a dependency the landing page does not use."
  ).toBeLessThanOrEqual(BUDGETS.jsBytes);

  expect(
    cssBytes,
    "render-blocking CSS grew past budget."
  ).toBeLessThanOrEqual(BUDGETS.cssBytes);

  expect(fcpMs, "nothing painted at all").toBeGreaterThan(0);
  expect(
    fcpMs,
    "FCP passed its ceiling — a render-blocking request or a regression in " +
      "parse work, not a few milliseconds of drift."
  ).toBeLessThanOrEqual(BUDGETS.fcpMs);
});
