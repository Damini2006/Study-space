/**
 * Pure helpers for the Admin/Evals page.
 *
 * Kept out of the component so the contracts that matter — what gets
 * enqueued, how often the list refetches, how progress is computed and
 * what an export contains — are testable without rendering or hitting
 * the API.
 */

/**
 * The configs a run should actually execute: drop the ones the admin
 * unticked, and the UI-only `enabled` flag with them — the backend's
 * EvalConfig has no such field, and a disabled config left in the list
 * would run anyway.
 */
export function selectConfigs(configs) {
  return configs
    .filter((c) => c.enabled !== false)
    .map((c) => ({
      name: c.name,
      relevance_gate: Boolean(c.relevance_gate),
      citation_validation: Boolean(c.citation_validation),
      claim_verification: Boolean(c.claim_verification),
    }));
}

/**
 * Refetch interval (ms) for the runs list, or false to stop: while any
 * run is pending or running the worker is moving it forward server-side,
 * so the list keeps polling; settled lists settle with it.
 */
export function pollInterval(runs) {
  const list = Array.isArray(runs) ? runs : [];
  const active = list.some((r) => r.status === "pending" || r.status === "running");
  return active ? 3000 : false;
}

/**
 * Percent done of an in-flight run ({done, total} progress summary),
 * clamped to 0-100 — or null when the summary carries no total yet,
 * which tells the caller to render the indeterminate bar instead.
 */
export function progressPercent(summary) {
  const total = Number(summary?.total ?? 0);
  const done = Number(summary?.done ?? 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

const CSV_BASE_COLUMNS = ["config", "question_id", "kind", "status", "question", "answer", "reference"];

/**
 * CSV over result rows: the fixed identity columns first, then every
 * metric key any row carries (rows have different metric sets — failed
 * ones carry `error`, unanswerable ones only `correct_not_found`). A
 * field containing a comma, quote or newline is quoted with doubled
 * quotes, per RFC 4180, so a multi-sentence answer cannot shear the
 * spreadsheet into extra rows.
 */
export function resultsToCsv(results) {
  const metricKeys = [
    ...new Set(results.flatMap((r) => Object.keys(r.metrics || {}))),
  ];
  const columns = [...CSV_BASE_COLUMNS, ...metricKeys];
  const cell = (row, key) =>
    key in (row.metrics || {}) ? row.metrics[key] : row[key];
  const escape = (value) => {
    const text = value == null ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    columns.join(","),
    ...results.map((row) => columns.map((key) => escape(cell(row, key))).join(",")),
  ].join("\n");
}
