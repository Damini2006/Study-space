/**
 * Prompt-template text utilities.
 *
 * Kept out of the panel component so the file only exports components (which is
 * what makes React Fast Refresh work in dev) and so the parsing logic is
 * directly unit-testable without rendering anything.
 */

/**
 * Pull `{{ var }}` and `{%- if var %}` names out of a Jinja2 template body.
 * Order of first appearance is preserved so the UI shows variables in the order
 * a reader would meet them.
 */
export function extractVariables(template) {
  const found = new Set();
  const re = /\{\{-?\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match;
  while ((match = re.exec(template)) !== null) found.add(match[1]);
  return [...found];
}

/** True when a variable appears only inside a guard, so it may be optional. */
export function isConditionalVariable(template, name) {
  return new RegExp(`\\{%-?\\s*if\\s+${name}\\b`).test(template);
}