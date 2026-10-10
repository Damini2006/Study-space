/**
 * Summarise what the server reports an import actually created. The counts
 * come from the request that just ran (parsing is synchronous), so this is
 * a report, not an estimate: zero imports is a failure even when files were
 * chosen, and the first server warning (why things were skipped) rides along.
 *
 * It lives outside ImportDialog.jsx because react-refresh warns when one
 * file exports both components and plain functions ("Fast refresh only
 * works when a file only exports components"). The dialog imports it like
 * any other helper — its behaviour, and every line of it, are unchanged.
 */
export function describeImport(summary) {
  const { sources = 0, cards = 0, skipped = 0, warnings = [] } = summary ?? {};
  const parts = [];
  if (sources > 0) parts.push(`${sources} source${sources === 1 ? "" : "s"}`);
  if (cards > 0) parts.push(`${cards} card${cards === 1 ? "" : "s"}`);
  const warning = warnings.length > 0 ? warnings[0] : null;
  if (parts.length === 0) {
    const skippedNote = skipped > 0 ? ` (${skipped} skipped)` : "";
    return { ok: false, message: `Nothing was imported${skippedNote}.`, warning };
  }
  const skippedNote = skipped > 0 ? ` (${skipped} skipped)` : "";
  return { ok: true, message: `Imported ${parts.join(" and ")}${skippedNote}`, warning };
}
