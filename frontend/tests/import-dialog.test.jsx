/**
 * Import dialog: what it tells the backend, and what it tells the user.
 *
 * The dialog used to invent progress (a percentage ticking up inside the
 * request), promise background processing, toast a count of the files the
 * user picked, and call a service method that did not exist. These tests
 * pin the honest version: one synchronous request through `importBundle`,
 * and a message built from the summary the server actually returned.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeImport } from "@/components/workspace/ImportDialog";

const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const DIALOG = fs.readFileSync(
  path.join(FRONTEND, "src", "components", "workspace", "ImportDialog.jsx"),
  "utf8"
);

describe("describeImport", () => {
  it("reports what the server counted, pluralising each unit", () => {
    expect(describeImport({ sources: 12, cards: 40, skipped: 3, warnings: [] })).toEqual({
      ok: true,
      message: "Imported 12 sources and 40 cards (3 skipped)",
      warning: null,
    });
    expect(describeImport({ sources: 1, cards: 1, skipped: 0, warnings: [] })).toEqual({
      ok: true,
      message: "Imported 1 source and 1 card",
      warning: null,
    });
  });

  it("counts only the side that happened (cards-only imports)", () => {
    const outcome = describeImport({ sources: 0, cards: 30, skipped: 0, warnings: [] });
    expect(outcome).toEqual({ ok: true, message: "Imported 30 cards", warning: null });
  });

  it("calls an all-skipped import a failure, with the skip count", () => {
    const outcome = describeImport({
      sources: 0,
      cards: 0,
      skipped: 5,
      warnings: ["'a.md' is larger than 2 MB and was skipped."],
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe("Nothing was imported (5 skipped).");
    expect(outcome.warning).toBe("'a.md' is larger than 2 MB and was skipped.");
  });

  it("carries the first server warning for a partial import", () => {
    const outcome = describeImport({
      sources: 2,
      cards: 0,
      skipped: 1,
      warnings: ["first problem", "second problem"],
    });
    expect(outcome.warning).toBe("first problem");
  });

  it("stays honest when there is no summary to read", () => {
    expect(describeImport(undefined).ok).toBe(false);
    expect(describeImport(null).message).toBe("Nothing was imported.");
  });
});

describe("dialog wiring", () => {
  it("posts through the real importBundle service method", () => {
    expect(DIALOG).toContain("spacesApi.importBundle(");
    expect(DIALOG).not.toContain("spacesApi.import(");
    // fmt travels in the query string; the body carries files only.
    expect(DIALOG).not.toContain('formData.append("format"');
  });

  it("has no invented progress left", () => {
    expect(DIALOG).not.toContain("Simulate progress");
    expect(DIALOG).not.toContain("setInterval");
    expect(DIALOG).not.toContain("${progress}");
    expect(DIALOG).not.toContain("progress%");
  });

  it("promises nothing about the background, and toasts the server's counts", () => {
    expect(DIALOG).not.toContain("background");
    expect(DIALOG).not.toContain("run in the");
    expect(DIALOG).toContain("describeImport(summary)");
    expect(DIALOG).not.toContain("Imported ${files.length}");
    expect(DIALOG).not.toContain("setTimeout(() => onClose()");
  });
});
