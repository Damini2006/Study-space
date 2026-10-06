import { defineConfig, devices } from "@playwright/test";

/**
 * Runs the built bundle through `vite preview`, not the dev server, so what
 * gets tested is what ships: env values baked at build time, the chunk
 * layout, and the minified bundle rather than the transform pipeline.
 *
 * `testMatch` is deliberately the `.e2e.js` suffix. Vitest collects files
 * ending in `.spec.js` or `.test.js`, so keeping the two suffixes distinct
 * lets both runners live in one repo without either ever picking up the
 * other's files — no exclude list to keep in sync.
 *
 * (Worth saying out loud: a block comment cannot contain the two characters
 * a glob of that shape would use. This comment used to, and it broke parsing
 * at line 9.)
 */
const PORT = 4317;
const URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.js",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The build happens in the `test:e2e` script rather than here, so a
    // build failure surfaces as a build failure instead of "webserver did
    // not start in time".
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
