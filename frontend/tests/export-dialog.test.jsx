/**
 * Export dialog: what it asks the backend for, and what it tells the user.
 *
 * The dialog used to call `spacesApi.export`, a method that did not exist
 * (every button died with a TypeError), while the only alternative on
 * offer was an unauthenticated link that would 401. It also promised a
 * ".pdf" whose bytes were HTML. These tests pin the honest version: an
 * authenticated Blob download through `spacesApi.export`, a print window
 * opened before the await so popup blockers don't eat it, and filenames
 * and labels that match the bytes that actually arrive.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exportFilename } from "@/lib/export-file";

const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const read = (...parts) => fs.readFileSync(path.join(FRONTEND, ...parts), "utf8");
const DIALOG = read("src", "components", "workspace", "ExportDialog.jsx");
const SERVICES = read("src", "services", "api-services.js");
const CLIENT = read("src", "lib", "api.js");

describe("exportFilename", () => {
  it("names each file after what the bytes really are", () => {
    expect(exportFilename("Bio 101!", "markdown", "2026-10-08")).toBe("Bio_101_-2026-10-08.zip");
    expect(exportFilename("Bio", "anki", "2026-10-08")).toBe("Bio-2026-10-08.apkg");
    expect(exportFilename("Bio", "notion", "2026-10-08")).toBe("Bio-2026-10-08.csv");
    // The print page is an .html file, not a fake .pdf.
    expect(exportFilename("Bio", "pdf", "2026-10-08")).toBe("Bio-2026-10-08.html");
  });

  it("falls back to an honest extension rather than a format's promise", () => {
    expect(exportFilename("Bio", "mystery", "2026-10-08")).toBe("Bio-2026-10-08.bin");
  });
});

describe("the download path", () => {
  it("goes through an authenticated Blob download, not a dead method or bare link", () => {
    expect(SERVICES).toContain("export: (spaceId, fmt, { print } = {}) =>");
    expect(SERVICES).toContain("api.download(");
    expect(SERVICES).not.toContain("exportUrl: (spaceId, fmt)"); // a bare link would 401
    expect(CLIENT).toContain("download: (path) => download(path)");
    expect(CLIENT).toContain("async function download(path)");
    expect(CLIENT).toContain("res.blob()");
  });

  it("carries the bearer token and asks for the print script only when told to", () => {
    const fn = CLIENT.slice(CLIENT.indexOf("async function download"));
    const body = fn.slice(0, fn.indexOf("\nexport "));
    expect(body).toContain("Authorization");
    expect(body).toContain("Bearer");
    // The print script is requested conditionally, never by default.
    expect(SERVICES).toContain('print ? "&print=1" : ""');
  });
});

describe("what the dialog promises", () => {
  it("uses the real service method and opens the print window before awaiting", () => {
    expect(DIALOG).toContain("await spacesApi.export(");
    const opened = DIALOG.indexOf('window.open("about:blank"');
    const awaited = DIALOG.indexOf("await spacesApi.export(");
    expect(opened).toBeGreaterThan(-1);
    expect(awaited).toBeGreaterThan(-1);
    expect(opened).toBeLessThan(awaited); // after an await a popup would be blocked
    expect(DIALOG).toContain("{ print: format === \"pdf\" }");
  });

  it("labels the print flow for what happens instead of promising a .pdf file", () => {
    expect(DIALOG).toContain("Print / Save as PDF");
    expect(DIALOG).toContain('choose "Save as PDF"');
    expect(DIALOG).toContain("Open print page");
    expect(DIALOG).not.toContain("PDF (.pdf)");
    expect(DIALOG).not.toContain("Printable summary");
    expect(DIALOG).not.toContain('pdf: "pdf"'); // filename map tells the truth
  });

  it("tells the truth when the popup is blocked instead of failing silently", () => {
    expect(DIALOG).toContain("downloaded the print page instead");
  });
});
