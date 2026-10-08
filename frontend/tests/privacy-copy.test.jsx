/**
 * The public promises: Landing FAQ and the privacy policy must describe
 * what the app actually does.
 *
 * The FAQ used to promise "Export everything from Settings as JSON and
 * Markdown, then delete the account. Deletion removes rows, embeddings
 * and stored files within the retention window described in the privacy
 * policy" — three falsehoods in one sentence (no export UI existed, no
 * account deletion existed, and the privacy policy described no
 * retention window at all). These pin the honest copy: JSON export from
 * Settings, per-space exports from the workspace, deletion that removes
 * rows and stored documents with exact counts, and a plainly stated
 * limit — the sign-in email remains.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const read = (...parts) => fs.readFileSync(path.join(FRONTEND, ...parts), "utf8");
// Copy assertions run against whitespace-normalised text so a source
// line-wrap can never fake a missing phrase.
const norm = (s) => s.replace(/\s+/g, " ");
const LANDING = norm(read("src", "pages", "Landing.jsx"));
const PRIVACY = norm(read("src", "pages", "Privacy.jsx"));

describe("the Landing FAQ data-exit answer", () => {
  it("describes the exports that exist: account JSON and per-space formats", () => {
    expect(LANDING).toContain("Export from Settings as JSON");
    expect(LANDING).toContain("export a single space as Markdown, CSV, an Anki deck or a print-ready page");
    // The old claim bundled "as JSON and Markdown" from Settings.
    expect(LANDING).not.toContain("as JSON and Markdown");
  });

  it("describes deletion as what it is: rows, files, and exact counts", () => {
    expect(LANDING).toContain("removes every study row");
    expect(LANDING).toContain("every stored document");
    expect(LANDING).toContain("reports the exact counts");
    // No promise this code cannot keep:
    expect(LANDING).not.toContain("delete the account");
    expect(LANDING).not.toContain("retention window");
  });

  it("states the sign-in limit instead of implying a full account erase", () => {
    expect(LANDING).toContain("Your sign-in email stays");
    expect(LANDING).toContain("admin keys needed to erase it");
  });

  it("stops pointing at a size limit Settings never showed", () => {
    expect(LANDING).toContain("up to the upload size limit enforced before anything is stored");
    expect(LANDING).not.toContain("shown in Settings");
  });
});

describe("the privacy policy", () => {
  it("has a Your controls section that matches the Data tab", () => {
    expect(PRIVACY).toContain('id: "your-controls"');
    expect(PRIVACY).toContain("Settings → Data exports every row");
    expect(PRIVACY).toContain("single JSON file");
  });

  it("says deletion is immediate — with the failure case told honestly", () => {
    expect(PRIVACY).toContain("there is no retention window");
    expect(PRIVACY).toContain("how many failed instead of quietly keeping them");
  });

  it("explains why the sign-in email is not erased", () => {
    expect(PRIVACY).toContain("held by the authentication service");
    expect(PRIVACY).toContain("never holds the admin credentials");
  });
});
