import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

/**
 * Sends the exact headers production sends, read out of vercel.json rather
 * than copied from it, so `vite preview` and the tests that drive it cannot
 * drift from what actually ships.
 *
 * Preview only. The dev server is deliberately left alone: a policy mistake
 * should cost a failing test run, not an afternoon of guessing why the app
 * won't load.
 */
function productionHeaders() {
  const headers = {};
  try {
    const vercel = JSON.parse(
      readFileSync(new URL("../vercel.json", import.meta.url), "utf8")
    );
    for (const entry of vercel.headers ?? []) {
      for (const header of entry.headers ?? []) headers[header.key] = header.value;
    }
  } catch {
    // `npm run preview` must keep working even if vercel.json is absent or
    // malformed — csp.test.js is what fails loudly about that.
    return { name: "production-headers", configurePreviewServer() {} };
  }

  return {
    name: "production-headers",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), productionHeaders()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    // Keep the vendor libraries in their own long-cached chunks so a UI change
    // doesn't force users to re-download React/the router/query stack.
    //
    // Vite 8 bundles with Rolldown, which rejects the object form of
    // manualChunks that Rollup accepted (its schema wants a function) —
    // advancedChunks is the declarative replacement, same five groups,
    // matched against resolved paths rather than package names.
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
            },
            {
              name: "query",
              test: /node_modules[\\/]@tanstack[\\/](react-query|query-core)[\\/]/,
            },
            { name: "motion", test: /node_modules[\\/]framer-motion[\\/]/ },
            { name: "icons", test: /node_modules[\\/]lucide-react[\\/]/ },
            { name: "supabase", test: /node_modules[\\/]@supabase[\\/]supabase-js[\\/]/ },
          ],
        },
      },
    },
    // No chunkSizeWarningLimit on purpose. It used to sit at 600 — just
    // under the 631 kB entry chunk of the day — so the warning printed on
    // every build until everyone learned to read past it, which is worse
    // than no warning. That chunk is 94 kB now (the editor and the rest of
    // /app moved behind lazy routes), nothing ships above 395 kB, and the
    // number that actually matters — what a first visit downloads — is
    // enforced by e2e/performance.e2e.js, which fails instead of printing
    // a line. Vite's default limit stands.
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    css: false,
    // Vitest's 5s default is wall-clock, but the typing tests are not:
    // planner-form types ~60 characters through userEvent (one act round
    // trip per keystroke) and the suite creates a fresh jsdom per file in
    // parallel, so on a loaded machine that test crossed 5s and failed
    // while passing in isolation. 15s caps the same assertions at a
    // number a contended runner can actually hit — it changes no
    // expectation, only how long a slow machine is allowed to take.
    testTimeout: 15000,
  },
});
