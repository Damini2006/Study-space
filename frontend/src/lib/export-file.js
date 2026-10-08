/**
 * The file an export download gets. The pdf format downloads the print
 * page (an .html file), because that is what the bytes really are — the
 * browser's Save-as-PDF makes the actual PDF.
 */
export function exportFilename(spaceTitle, fmt, date = new Date().toISOString().slice(0, 10)) {
  const ext = { markdown: "zip", anki: "apkg", notion: "csv", pdf: "html" }[fmt] ?? "bin";
  return `${spaceTitle.replace(/[^a-z0-9]/gi, "_")}-${date}.${ext}`;
}

/**
 * The markdown a studio output downloads as: its own markdown for
 * summaries and guides, a readable rendering for flashcards and quizzes,
 * and "" when there is nothing to say (the caller reports that honestly
 * instead of downloading an empty file).
 */
export function outputToMarkdown(output) {
  const content = output?.content;
  if (typeof content?.markdown === "string") return content.markdown;
  if (Array.isArray(content?.cards)) {
    return content.cards
      .map((c, i) => `## Card ${i + 1}\n\n**Q:** ${c.front}\n\n**A:** ${c.back}`)
      .join("\n\n");
  }
  if (Array.isArray(content?.questions)) {
    return content.questions
      .map((q, i) => {
        const options = (q.options || [])
          .map((opt, oi) => `- ${String.fromCharCode(65 + oi)}. ${opt}`)
          .join("\n");
        const idx = q.answer_index;
        const answer = Number.isInteger(idx)
          ? `**Answer:** ${String.fromCharCode(65 + idx)}. ${q.options?.[idx] ?? ""}`
          : "";
        return [`## Question ${i + 1}`, q.question, options, answer, q.explanation]
          .filter(Boolean)
          .join("\n\n");
      })
      .join("\n\n");
  }
  if (typeof content === "string") return content;
  return "";
}
