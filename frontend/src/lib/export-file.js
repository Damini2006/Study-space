/**
 * The file an export download gets. The pdf format downloads the print
 * page (an .html file), because that is what the bytes really are — the
 * browser's Save-as-PDF makes the actual PDF.
 */
export function exportFilename(spaceTitle, fmt, date = new Date().toISOString().slice(0, 10)) {
  const ext = { markdown: "zip", anki: "apkg", notion: "csv", pdf: "html" }[fmt] ?? "bin";
  return `${spaceTitle.replace(/[^a-z0-9]/gi, "_")}-${date}.${ext}`;
}
