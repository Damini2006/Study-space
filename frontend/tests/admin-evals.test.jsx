/**
 * Admin/Evals: the helper contracts behind the page (what gets enqueued,
 * how often the list refetches, how progress is computed, what an export
 * contains), plus source checks on the wiring helpers cannot see — the
 * poll interval attached to the query, and the dead branches that must
 * not come back.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  pollInterval,
  progressPercent,
  resultsToCsv,
  selectConfigs,
} from "@/lib/evals";

// vitest's import.meta.url is not a file:// URL under the jsdom
// transform, so locate the page the way csp.test.js locates the config.
const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const PAGE = fs.readFileSync(
  path.join(FRONTEND, "src", "pages", "AdminEvals.jsx"),
  "utf8"
);

describe("pollInterval", () => {
  it("keeps polling while any run is pending or running", () => {
    expect(pollInterval([{ status: "pending" }])).toBe(3000);
    expect(pollInterval([{ status: "running" }, { status: "completed" }])).toBe(3000);
  });

  it("stops once every run has settled", () => {
    expect(pollInterval([{ status: "completed" }])).toBe(false);
    expect(pollInterval([{ status: "failed" }, { status: "completed" }])).toBe(false);
    expect(pollInterval([])).toBe(false);
    expect(pollInterval(undefined)).toBe(false);
  });
});

describe("progressPercent", () => {
  it("is the done share of the plan, clamped to 0-100", () => {
    expect(progressPercent({ done: 100, total: 400 })).toBe(25);
    expect(progressPercent({ done: 0, total: 4 })).toBe(0);
    expect(progressPercent({ done: 500, total: 400 })).toBe(100);
    expect(progressPercent({ done: -5, total: 400 })).toBe(0);
  });

  it("is null when there is no total to measure against", () => {
    expect(progressPercent({})).toBeNull();
    expect(progressPercent({ done: 3 })).toBeNull();
    expect(progressPercent(undefined)).toBeNull();
    expect(progressPercent({ done: 5, total: 0 })).toBeNull();
  });
});

describe("selectConfigs", () => {
  const baseline = {
    name: "baseline",
    relevance_gate: false,
    citation_validation: false,
    claim_verification: false,
    enabled: true,
  };
  const gate = {
    name: "+relevance-gate",
    relevance_gate: true,
    citation_validation: false,
    claim_verification: false,
    enabled: false,
  };

  it("drops configs the admin unticked", () => {
    expect(selectConfigs([baseline, gate]).map((c) => c.name)).toEqual(["baseline"]);
  });

  it("strips the UI-only enabled flag so only backend fields are sent", () => {
    for (const config of selectConfigs([baseline])) {
      expect(config).not.toHaveProperty("enabled");
    }
  });

  it("keeps a config whose enabled flag was never set", () => {
    expect(selectConfigs([{ name: "baseline", relevance_gate: false }])).toEqual([
      { name: "baseline", relevance_gate: false, citation_validation: false, claim_verification: false },
    ]);
  });
});

describe("resultsToCsv", () => {
  const rows = [
    {
      config: "baseline",
      question_id: "q001",
      kind: "answerable",
      status: "verified",
      question: "What is ATP?",
      answer: "Energy currency [1].",
      reference: "gold answer",
      metrics: { faithfulness: 1, hallucination: false, latency_ms: 420 },
    },
    {
      config: "+claim-verification",
      question_id: "q002",
      kind: "unanswerable",
      status: "not_found",
      question: "Missing topic?",
      answer: "Could not find this in your sources.",
      reference: "expectation of absence",
      metrics: { correct_not_found: true, latency_ms: 90 },
    },
  ];

  it("emits identity columns then every metric key any row carries", () => {
    const [header, first] = resultsToCsv(rows).split("\n");
    expect(header).toBe(
      "config,question_id,kind,status,question,answer,reference," +
        "faithfulness,hallucination,latency_ms,correct_not_found"
    );
    expect(first).toBe(
      "baseline,q001,answerable,verified,What is ATP?,Energy currency [1].,gold answer,1,false,420,"
    );
  });

  it("leaves cells a row does not have empty instead of shifting columns", () => {
    const lines = resultsToCsv(rows).split("\n");
    expect(lines).toHaveLength(3);
    // row 2: no faithfulness/hallucination before its latency, no
    // correct_not_found on row 1 after it
    expect(lines[2]).toContain(
      "+claim-verification,q002,unanswerable,not_found,Missing topic?,Could not find this in your sources.,expectation of absence,,,90,true"
    );
  });

  it("quotes cells with commas, quotes or newlines (RFC 4180)", () => {
    const csv = resultsToCsv([
      {
        config: "baseline",
        question_id: "q001",
        kind: "answerable",
        status: "verified",
        question: "Q, with comma",
        answer: 'line one\n"quoted" text',
        reference: "r",
        metrics: {},
      },
    ]);
    expect(csv).toContain('"Q, with comma"');
    expect(csv).toContain('"line one\n""quoted"" text"');
  });
});

describe("page wiring", () => {
  it("attaches the poll interval to the runs query", () => {
    expect(PAGE).toContain("refetchInterval: (query) => pollInterval(query.state.data)");
  });

  it("exports through the authenticated api client, not a bare fetch", () => {
    expect(PAGE).toContain("await evalsApi.results(");
    expect(PAGE).not.toContain("fetch(evalsApi");
  });

  it("keeps dead statuses, buttons and formats out", () => {
    expect(PAGE).not.toContain("awaiting_approval");
    expect(PAGE).not.toContain('"pdf"');
    expect(PAGE).not.toContain("<Play");
    expect(PAGE).not.toContain("Approve");
  });
});
