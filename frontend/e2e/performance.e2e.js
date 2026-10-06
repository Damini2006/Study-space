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
 * drift. Every host on the critical path has been our own since the
 * fonts were self-hosted (the second test below is what keeps it that
 * way), so what moves this number is the machine's own load: the same
 * build measured 820 ms on its own and 1988 ms under the full suite.
 *
 * First Contentful Paint rather than LCP: measured here, the LCP entry is
 * never emitted at all in this headless Chromium — neither on the
 * performance timeline nor to a buffered PerformanceObserver, three runs
 * out of three — while FP and FCP land within 50 ms of each other run to
 * run. FCP is also the metric a render-blocking stylesheet actually
 * delays, which is the regression this test exists to notice.
 *
 * What is counted: same-origin `.js` and `.css` fetched while loading `/`.
 * A cross-origin request would report a transfer size of 0 (no
 * Timing-Allow-Origin) and drop out by construction rather than by a
 * filter that would quietly stop meaning anything — and today the only
 * cross-origin candidate would be analytics, which e2e builds leave off.
 */
const BUDGETS = {
  // Measured baselines, tightened as code leaves the first load:
  //   370.0 kB across six files before any splitting;
  //   246.2 kB once Notes — and with it tiptap and the whole ProseMirror
  //   tree, 395 kB of the entry chunk — became a lazy route;
  //   205.9 kB once the rest of /app followed it out (the entry chunk is
  //   94 kB now, down from 631 kB, and is Landing plus shared glue).
  // Headroom is for incidental growth, not for going eager: a new import
  // of any weight still trips this.
  jsBytes: 220 * 1024,
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

/**
 * Self-hosting the fonts was never about saving bytes — the same woff2
 * files downloaded either way — it was about who stands in front of
 * first paint. The Google Fonts stylesheet was render-blocking: no glyph
 * could be painted until a round trip to another company's servers had
 * finished. Three assertions together stop that quietly coming back:
 *
 *   1. no cross-origin stylesheet in the document at all — that is the
 *      render-blocking claim, since an external sheet blocks paint by
 *      definition;
 *   2. nothing reaching the two hosts the fonts used to come from;
 *   3. both families declared with the weight range they were fetched
 *      for and actually loaded. This one fails if fonts.css did not
 *      build, if a woff2 404'd, or if a range got written as a single
 *      weight — worth checking on its own, because document.fonts.check
 *      alone passes vacuously for a family that does not exist: text
 *      falls back, and there is nothing left to load.
 */
test("first paint has no third party in front of it, and the fonts are ours", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const report = await page.evaluate(async () => {
    await document.fonts.ready;
    // JetBrains Mono is not guaranteed to appear above the fold, so ask
    // for it explicitly rather than assuming the landing page did.
    await document.fonts.load('400 16px "JetBrains Mono"');
    return {
      origin: window.location.origin,
      stylesheets: Array.from(document.styleSheets, (sheet) => sheet.href).filter(
        Boolean
      ),
      fontHosts: performance
        .getEntriesByType("resource")
        .map((entry) => new URL(entry.name).hostname)
        .filter(
          (host) =>
            host === "fonts.googleapis.com" || host === "fonts.gstatic.com"
        ),
      faces: Array.from(document.fonts, (face) => ({
        family: face.family.replace(/["']/g, ""),
        weight: face.weight,
        status: face.status,
      })),
    };
  });

  expect(
    report.stylesheets.filter((href) => !href.startsWith(report.origin)),
    "the render-blocking stylesheet must not come from a third party"
  ).toEqual([]);

  expect(
    report.fontHosts,
    "fonts are self-hosted now — nothing should reach googleapis/gstatic"
  ).toEqual([]);

  const loaded = (family, weight) =>
    report.faces.some(
      (face) =>
        face.family === family && face.weight === weight && face.status === "loaded"
    );

  expect(
    loaded("Inter", "400 700"),
    `Inter must be declared by our own CSS and loaded — saw ${JSON.stringify(
      report.faces
    )}`
  ).toBe(true);
  expect(
    loaded("JetBrains Mono", "400 500"),
    `JetBrains Mono must be declared by our own CSS and loaded — saw ${JSON.stringify(
      report.faces
    )}`
  ).toBe(true);
});
