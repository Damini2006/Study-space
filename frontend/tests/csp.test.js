import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The policy lives in two config files and is derived from a third. Three
 * copies of something that must agree exactly is a drift accident waiting to
 * happen, so index.html is treated as the source of truth and everything
 * else is checked against it.
 *
 * The hashes are computed from the *source* index.html. That is only valid
 * because the build must not rewrite inline script text — see the
 * build-stability test below, which is what keeps this claim true.
 */

const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const ROOT = path.dirname(FRONTEND);

const read = (file) => fs.readFileSync(file, "utf8");
const indexHtml = read(path.join(FRONTEND, "index.html"));
const nginx = read(path.join(FRONTEND, "nginx.conf"));
const vercel = JSON.parse(read(path.join(ROOT, "vercel.json")));

const sha256 = (text) =>
  "'sha256-" +
  crypto.createHash("sha256").update(text, "utf8").digest("base64") +
  "'";

/** Inline <script> bodies that actually execute, so script-src applies. */
function executableInlineScripts(html) {
  const bodies = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] || "";
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
    // Data blocks (JSON-LD) are never executed, so script-src does not
    // reach them and they need no hash.
    if (type && !/^(?:module|text\/javascript|application\/javascript)$/i.test(type)) {
      continue;
    }
    bodies.push(match[2]);
  }
  return bodies;
}

function directive(policy, name) {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(name + " "));
  if (!found) return null;
  return found.slice(name.length).trim().split(/\s+/).filter(Boolean);
}

const vercelPolicies = vercel.headers
  .flatMap((entry) => entry.headers)
  .filter((header) => header.key === "Content-Security-Policy")
  .map((header) => header.value);

const nginxPolicies = [...nginx.matchAll(/Content-Security-Policy\s+"([^"]+)"/g)].map(
  (match) => match[1]
);

const scripts = executableInlineScripts(indexHtml);
const hashes = scripts.map(sha256);

describe("Content-Security-Policy", () => {
  it("finds the inline scripts it is meant to be guarding", () => {
    // Guards the extraction above: if the regex silently stopped matching,
    // every other test here would pass vacuously.
    expect(scripts.length).toBeGreaterThanOrEqual(2);
    expect(indexHtml).toContain('type="application/ld+json"');
  });

  it("allows exactly the scripts index.html ships, in vercel.json", () => {
    expect(vercelPolicies).toHaveLength(1);
    const allowed = directive(vercelPolicies[0], "script-src");

    expect(allowed).toEqual(expect.arrayContaining(hashes));
    // ...and nothing stale: a hash for a script that no longer exists means
    // the policy and the document have parted company.
    const stale = allowed.filter((value) => value.startsWith("'sha256-") && !hashes.includes(value));
    expect(stale).toEqual([]);
  });

  it("carries the same hashes in every nginx copy", () => {
    expect(nginxPolicies.length).toBeGreaterThanOrEqual(1);
    for (const policy of nginxPolicies) {
      const allowed = directive(policy, "script-src");
      expect(allowed).toEqual(expect.arrayContaining(hashes));
    }
  });

  it("does not fall back to unsafe-inline or unsafe-eval", () => {
    // Both policies exist to stop injected markup from running, so quietly
    // adding 'unsafe-inline' to script-src would undo the point.
    for (const policy of [...vercelPolicies, ...nginxPolicies]) {
      const allowed = directive(policy, "script-src");
      expect(allowed).not.toContain("'unsafe-inline'");
      expect(allowed).not.toContain("'unsafe-eval'");
    }
  });

  it("pins the directives that stop markup injection", () => {
    for (const policy of [...vercelPolicies, ...nginxPolicies]) {
      expect(directive(policy, "default-src")).toEqual(["'self'"]);
      expect(directive(policy, "object-src")).toEqual(["'none'"]);
      expect(directive(policy, "base-uri")).toEqual(["'self'"]);
      expect(directive(policy, "frame-ancestors")).toEqual(["'self'"]);
      expect(directive(policy, "form-action")).toEqual(["'self'"]);
    }
  });

  it("still permits the third parties index.html actually loads", () => {
    for (const policy of [...vercelPolicies, ...nginxPolicies]) {
      expect(policy).toContain("https://fonts.googleapis.com");
      expect(policy).toContain("https://fonts.gstatic.com");
      expect(policy).toContain("https://www.googletagmanager.com");
    }
  });
});

describe("inline scripts stay hashable", () => {
  it("keeps environment values out of script text", () => {
    // Vite substitutes %VITE_*% when it builds index.html. If a placeholder
    // were inside a script body, the built page's script would hash
    // differently from the source's, and the policy above would be checking
    // something the browser never sees.
    for (const body of scripts) {
      expect(body).not.toMatch(/%VITE_[A-Z0-9_]+%/);
    }
    // The analytics id is carried by a meta tag for exactly this reason.
    expect(indexHtml).toContain('name="studyspace:analytics-id"');
  });
});

describe("nginx header inheritance", () => {
  it("restates every security header inside the static-asset location", () => {
    // nginx's add_header does not merge into a nested location: declaring
    // Cache-Control there discards everything inherited, which silently
    // shipped js and css without nosniff. Two copies — server and location —
    // is the fix, so two is what the config must contain.
    const headers = [
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Content-Security-Policy",
    ];
    for (const name of headers) {
      const count = [...nginx.matchAll(new RegExp(`add_header ${name}\\b`, "g"))].length;
      expect(count, `${name} should appear once per context`).toBe(2);
    }
  });
});

describe("vercel.json", () => {
  it("sets the security headers the app has no other way to send", () => {
    const sent = new Set(vercel.headers.flatMap((entry) => entry.headers).map((h) => h.key));
    for (const name of [
      "Content-Security-Policy",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]) {
      expect(sent.has(name), `${name} missing`).toBe(true);
    }
  });

  it("does not advertise any capability the app never uses", () => {
    const permissions = vercel.headers
      .flatMap((entry) => entry.headers)
      .find((h) => h.key === "Permissions-Policy").value;
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(permissions).toContain(`${feature}=()`);
    }
  });
});
