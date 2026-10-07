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
 * Paint is reported, not budgeted — a decision, not an omission. First
 * Contentful Paint did get a ceiling once. The same build, no line of code
 * changed in between, then measured 604 ms idle, 1988 ms under the full
 * suite, and 2784 / 2732 / 5560 ms across three runs while the machine was
 * busy — once crossing that ceiling for no reason a user would recognise.
 * A ceiling a loaded machine clears by itself fails for the wrong reason
 * often enough to be worse than no ceiling. So what is asserted about
 * paint is binary: the page paints content at all. The value is still
 * printed every run as a number to read. Everything else here is load-
 * proof — bytes, file counts, hosts, faces — because those describe the
 * build, and the build does not care how busy the machine is.
 *
 * First Contentful Paint rather than LCP, for the same reason: measured
 * here, the LCP entry is never emitted at all in this headless Chromium —
 * neither on the performance timeline nor to a buffered PerformanceObserver,
 * three runs out of three — while FP and FCP land within 50 ms of each
 * other run to run. FCP is also the metric a render-blocking stylesheet
 * actually delays, so it stays the one worth printing; the regressions
 * themselves are caught by counts and budgets, which cannot go flaky.
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
  // One stylesheet: the bundled index CSS, 16.3 kB as served since the
  // @font-face rules moved into it.
  cssBytes: 20 * 1024,
};

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

async function measureFirstLoad(page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // networkidle is a claim about the future — quiet for 500 ms — while
  // first paint belongs to the renderer, and the two land on whichever
  // side of each other they please: one run ended load at 248 ms and
  // painted at 764 ms, and on a busy machine the read caught the page
  // before it had painted at all (fcp=0 with the entire DOM in place,
  // cookie dialog included). Waiting for the entry to exist costs
  // nothing when paint came first — the common case — and the entry's
  // startTime is the moment paint happened regardless of when we look,
  // so this changes when the number is read and never the number.
  // Interval polling rather than the default rAF: a page that never
  // paints must still be able to fail this, not hang the poll on the
  // frame that never comes.
  let painted = true;
  try {
    await page.waitForFunction(
      () =>
        performance
          .getEntriesByType("paint")
          .some((entry) => entry.name === "first-contentful-paint"),
      undefined,
      { timeout: 10_000, polling: 250 }
    );
  } catch {
    painted = false;
  }

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
    painted,
    fcpMs,
    jsBytes: sum(".js"),
    cssBytes: sum(".css"),
    jsRequests: resources.filter((entry) => entry.name.endsWith(".js")).length,
  };
}

test("the landing page's first load stays inside its budgets", async ({
  page,
}) => {
  const { painted, fcpMs, jsBytes, cssBytes, jsRequests } =
    await measureFirstLoad(page);

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

  // Binary, and only binary: the page paints. Whether it took 600 ms or
  // 5000 ms is the machine's business — see the header — but "never" is
  // a fact about the page, and the wait above is what makes it readable
  // instead of a race against networkidle.
  expect(
    painted,
    "no first contentful paint within 10 s — a page that never renders, " +
      "not a page that renders slowly."
  ).toBe(true);
});

/**
 * Self-hosting the fonts was never about saving bytes — the same woff2
 * files downloaded either way — it was about who stands in front of
 * first paint. The Google Fonts stylesheet was render-blocking: no glyph
 * could be painted until a round trip to another company's servers had
 * finished. Four assertions together stop that quietly coming back:
 *
 *   1. exactly one stylesheet in the document, and it is ours — an
 *      external sheet blocks paint by construction, and a second sheet
 *      of any origin is a second thing first paint now waits for;
 *   2. nothing reaching the two hosts the fonts used to come from;
 *   3. both families declared with the weight range they were fetched
 *      for and actually loaded. This one fails if fonts.css did not
 *      build, if a woff2 404'd, or if a range got written as a single
 *      weight — worth checking on its own, because document.fonts.check
 *      alone passes vacuously for a family that does not exist: text
 *      falls back, and there is nothing left to load;
 *   4. every loaded face still carries font-display: swap, the reason
 *      text was never invisible while a font arrived.
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
        display: face.display,
        status: face.status,
      })),
    };
  });

  expect(
    report.stylesheets.filter((href) => !href.startsWith(report.origin)),
    "the render-blocking stylesheet must not come from a third party"
  ).toEqual([]);
  expect(
    report.stylesheets,
    "first paint should wait on exactly one stylesheet — ours. A second " +
      "one means something new went render-blocking; if that is a " +
      "deliberate async-loading pattern, say so here."
  ).toHaveLength(1);

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

  // After the two above, so a face that failed to load cannot make this
  // one pass over an empty list.
  expect(
    report.faces
      .filter((face) => face.status === "loaded")
      .every((face) => face.display === "swap"),
    `font-display: swap lets text paint before a font arrives — saw ${JSON.stringify(
      report.faces
    )}`
  ).toBe(true);
});
