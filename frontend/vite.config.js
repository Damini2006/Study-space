import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
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
  plugins: [react(), productionHeaders()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    // Keep the vendor libraries in their own long-cached chunks so a UI change
    // doesn't force users to re-download React/the router/query stack.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          motion: ["framer-motion"],
          icons: ["lucide-react"],
          supabase: ["@supabase/supabase-js"],
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
  },
});
