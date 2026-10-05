import { describe, expect, it } from "vitest";
import { extractVariables, isConditionalVariable } from "@/lib/prompt-templates";

describe("extractVariables", () => {
  it("returns an empty list for a template with no placeholders", () => {
    expect(extractVariables("Answer the question.")).toEqual([]);
  });

  it("finds a plain substitution variable", () => {
    expect(extractVariables("Hello {{ name }}")).toEqual(["name"]);
  });

  it("handles whitespace control markers", () => {
    expect(extractVariables("A {{- topic -}} B")).toEqual(["topic"]);
  });

  it("finds variables used only inside an if-block", () => {
    expect(extractVariables("{% if topic %}About {{ topic }}{% endif %}")).toEqual(["topic"]);
  });

  it("preserves first-appearance order and de-duplicates", () => {
    expect(extractVariables("{{ b }} then {{ a }} then {{ b }}")).toEqual(["b", "a"]);
  });

  it("ignores Jinja constructs that are not variables", () => {
    // `for` and `endif` are keywords, not substitution targets.
    expect(extractVariables("{% for x in y %}{{ x }}{% endfor %}")).toEqual(["x"]);
  });

  it("does not treat numbers as a variable start", () => {
    expect(extractVariables("{{ 1 + 2 }}")).toEqual([]);
  });
});

describe("isConditionalVariable", () => {
  it("detects a variable guarded by an if-block", () => {
    expect(isConditionalVariable("{% if topic %}x{% endif %}", "topic")).toBe(true);
    expect(isConditionalVariable("{%- if topic -%}x{%- endif -%}", "topic")).toBe(true);
  });

  it("returns false when the variable is unconditional", () => {
    expect(isConditionalVariable("{{ topic }}", "topic")).toBe(false);
  });

  it("does not match a variable that merely shares a prefix", () => {
    expect(isConditionalVariable("{% if topic_long %}{% endif %}", "topic")).toBe(false);
  });
});