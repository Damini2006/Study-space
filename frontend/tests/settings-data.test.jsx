/**
 * Settings → Data: the export and deletion the Landing FAQ promises.
 *
 * The FAQ said "Export everything from Settings as JSON ... then delete
 * the account. Deletion removes rows, embeddings and stored files" while
 * Settings had no data section at all, meApi.exportUrl was a dead bare
 * link that would 401, and nothing ever called meApi.delete. These pin
 * the honest version: an authenticated Blob download named after the
 * JSON bytes it really is, a typed-confirmed deletion that shows the
 * server's own count sentence, and copy that says the sign-in email
 * stays (this app holds no admin key to erase it).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { accountExportFilename } from "@/lib/export-file";

const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const read = (...parts) => fs.readFileSync(path.join(FRONTEND, ...parts), "utf8");
const SETTINGS = read("src", "pages", "Settings.jsx");
const SERVICES = read("src", "services", "api-services.js");
const LIB = read("src", "lib", "export-file.js");
const DIALOG = read("src", "components", "workspace", "ExportDialog.jsx");

describe("accountExportFilename", () => {
  it("names the file after what the bytes really are: JSON", () => {
    expect(accountExportFilename("2026-10-08")).toBe("studyspace-export-2026-10-08.json");
  });
});

describe("the account export path", () => {
  it("goes through the authenticated Blob download, with no bare link left behind", () => {
    expect(SERVICES).toContain('export: () => api.download("/me/export")');
    expect(SERVICES).not.toContain("exportUrl"); // a bare <a href> would 401
  });

  it("downloads the blob under the honest filename", () => {
    expect(SETTINGS).toContain("meApi.export()");
    expect(SETTINGS).toContain("downloadBlob(blob, accountExportFilename())");
    expect(SETTINGS).toContain('import { accountExportFilename, downloadBlob } from "@/lib/export-file"');
  });

  it("keeps the one downloadBlob implementation in lib/export-file", () => {
    expect(LIB).toContain("export function downloadBlob");
    expect(DIALOG).toContain("import { downloadBlob, exportFilename } from");
    expect(DIALOG).not.toContain("function downloadBlob"); // no second copy
  });
});

describe("the account deletion flow", () => {
  it("calls the real endpoint, repeats the server's sentence, then signs out", () => {
    const fn = SETTINGS.slice(SETTINGS.indexOf("const deleteData = useMutation"));
    const body = fn.slice(0, fn.indexOf("});") + 3);
    expect(body).toContain("meApi.delete()");
    expect(body).toContain("data?.detail");
    expect(body).toContain("signOut()");
  });

  it("requires the word DELETE before the button can fire", () => {
    expect(SETTINGS).toContain('disabled={deleteConfirmText !== "DELETE" || deleteData.isPending}');
    expect(SETTINGS).toContain("value={deleteConfirmText}");
    expect(SETTINGS).toContain("Type DELETE to confirm");
  });

  it("is unavailable in the demo workspace instead of corrupting the shared demo", () => {
    const fn = SETTINGS.slice(SETTINGS.indexOf('<TabsContent value="data"'));
    const body = fn.slice(0, fn.indexOf("</TabsContent>"));
    expect(body).toContain("isDemo ?");
    expect(body).toContain("Not available in the demo workspace.");
  });

  it("says exactly what is deleted — and that the sign-in email remains", () => {
    expect(SETTINGS).toContain("Delete your data");
    expect(SETTINGS).toContain("every stored document");
    expect(SETTINGS).toContain("exact counts");
    expect(SETTINGS).toContain("Your sign-in email remains");
    // No promise this code cannot keep:
    expect(SETTINGS).not.toContain("Delete your account");
    expect(SETTINGS).not.toContain("erase your account");
    expect(SETTINGS).not.toContain("retention window");
  });

  it("lives on the Settings page as its own tab", () => {
    expect(SETTINGS).toContain('<TabsTrigger value="data">Data</TabsTrigger>');
  });
});
