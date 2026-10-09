/**
 * api-services.js exists so "endpoints and shapes live in exactly one
 * place" — its own header says every part of the app talks to the
 * backend through these wrappers. Four call sites bypassed it with raw
 * `api.*` endpoint strings that duplicated wrappers already defined
 * there:
 *
 * - useAuth fetched /me and posted /demo/session by hand, while
 *   meApi.get and demoApi.session sat unused beside them;
 * - useTheme patched the profile's theme by hand (meApi.update);
 * - CommandPalette listed /spaces by hand (spacesApi.list).
 *
 * Each swap is the identical call the wrapper makes — same method, same
 * path, same body — so what these tests pin is the wiring: the raw
 * endpoint strings must not come back and split the definition again.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const read = (...parts) => fs.readFileSync(path.join(FRONTEND, ...parts), "utf8");
const norm = (s) => s.replace(/\s+/g, " ");

const USE_AUTH = norm(read("src", "hooks", "useAuth.jsx"));
const USE_THEME = norm(read("src", "hooks", "useTheme.jsx"));
const PALETTE = norm(read("src", "components", "layout", "CommandPalette.jsx"));

describe("the auth flow talks to the backend through api-services", () => {
  it("loads the profile and starts demo sessions via the wrappers", () => {
    expect(USE_AUTH).toContain("meApi.get()");
    expect(USE_AUTH).toContain("demoApi.session(reset)");
    // Raw endpoint strings would put "/me" and "/demo/session" back in
    // two places — here and inside the wrappers.
    expect(USE_AUTH).not.toContain('api.get("/me")');
    expect(USE_AUTH).not.toContain('api.post("/demo/session"');
  });
});

describe("theme saves go through the profile wrapper", () => {
  it("persists via meApi.update instead of hand-rolled /me patches", () => {
    expect(USE_THEME).toContain("meApi.update({ theme: next })");
    expect(USE_THEME).not.toContain('api.patch("/me"');
  });
});

describe("the command palette's space list uses the spaces wrapper", () => {
  it("queries spacesApi.list instead of a raw /spaces call", () => {
    expect(PALETTE).toContain("spacesApi.list()");
    expect(PALETTE).not.toContain('api.get("/spaces")');
  });
});
