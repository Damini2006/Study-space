/**
 * The service module's header promises these wrappers are the one place
 * endpoints live — but nothing enforced it, and 18 methods accumulated
 * that no part of the app could call: a second copy of every ragApi
 * setting, detail fetchers for studio/planner/evals no screen opens,
 * card and habit operations with no control behind them, a demo reset
 * the palette runs through startDemo instead, and plain duplicates of
 * raw calls that used to sit beside them.
 *
 * This test parses the module the way the sweep that removed them did
 * and fails when any exported method has no `service.method` reference
 * under src/: dead wrappers cannot creep back, and a future method has
 * to be wired the day it lands.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const SERVICES_PATH = path.join(FRONTEND, "src", "services", "api-services.js");
const SERVICES = fs.readFileSync(SERVICES_PATH, "utf8").replace(/\r\n/g, "\n");

// Each `export const <service> = { ... }` object with its top-level keys —
// exactly two spaces of indentation, so method bodies never count.
function exportsOf(source) {
  const out = {};
  for (const m of source.matchAll(/export const (\w+) = \{/g)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (depth > 0 && i < source.length) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
      i += 1;
    }
    out[m[1]] = [...source.slice(start, i - 1).matchAll(/^\s{2}(\w+)\s*[:(]/gm)].map(
      (x) => x[1]
    );
  }
  return out;
}

// Everything under src/ except the service module itself: a method with
// no `service.method` reference out there has no caller in the app.
function callersSource() {
  const parts = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx)$/.test(entry.name) && full !== SERVICES_PATH)
        parts.push(fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n"));
    }
  };
  walk(path.join(FRONTEND, "src"));
  return parts.join("\n");
}

// A call may be chain-wrapped across lines (`spacesApi` on one line,
// `.getPublicInfo(...)` on the next), so collapse the whitespace around
// every dot first — formatting must never hide a caller from this sweep.
const CALLERS = callersSource().replace(/\s*\.\s*/g, ".");

describe("api-services exports", () => {
  const serviceMethods = exportsOf(SERVICES);

  it("keeps spacesApi down to the wrappers src actually calls", () => {
    // Guards the parser itself: if reading the module ever silently
    // broke, the wiring sweep below would pass by finding nothing.
    expect(Object.keys(serviceMethods)).toHaveLength(18);
    expect(serviceMethods.spacesApi).toEqual([
      "list",
      "get",
      "create",
      "createShare",
      "listShares",
      "revokeShare",
      "publish",
      "getPublicInfo",
      "unpublish",
      "getPublicSpace",
      "getSharedSpace",
      "export",
      "importBundle",
    ]);
  });

  it("defines no method that nothing in src/ calls", () => {
    const unwired = [];
    for (const [service, methods] of Object.entries(serviceMethods)) {
      for (const method of methods) {
        if (!new RegExp(`\\b${service}\\.${method}\\b`).test(CALLERS)) {
          unwired.push(`${service}.${method}`);
        }
      }
    }
    expect(unwired).toEqual([]);
  });
});
