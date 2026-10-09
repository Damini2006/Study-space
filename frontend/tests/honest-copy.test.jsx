/**
 * The words that describe the app have to match what the code does.
 *
 * Every assertion here fixes a claim that was checkable against the
 * source and came back false: the Sources empty state offered a link
 * flow with no control behind it; Study labelled a duplicate of the
 * Reviews count "Due state"; Studio headed its list "Previous versions"
 * while hiding every flashcards/quiz regeneration from it; Landing
 * promised cloze deletions, pre-save editing, retention targets, an
 * activity log, a 3-space cap and three cohort features that do not
 * exist — with a "Request access" button that opened the sign-in page;
 * and Settings said all animations die under reduced motion while
 * framer-motion ignored the OS setting entirely (App now wraps the tree
 * in MotionConfig reducedMotion="user").
 *
 * Copy pins run against whitespace-normalised source so a line-wrap can
 * never fake a missing phrase; the Studio claims are also proven by
 * rendering the panel, because a heading only counts if the list under
 * it actually shows the items.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { studioApi } from "@/services/api-services";
import StudioPanel from "@/components/workspace/StudioPanel";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("@/services/api-services", () => ({
  studioApi: {
    listOutputs: vi.fn(),
    generate: vi.fn(),
    deleteOutput: vi.fn(),
    updateOutput: vi.fn(),
  },
}));

const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const read = (...parts) => fs.readFileSync(path.join(FRONTEND, ...parts), "utf8");
const norm = (s) => s.replace(/\s+/g, " ");

const SOURCES = norm(read("src", "components", "workspace", "SourcesPanel.jsx"));
const STUDY = norm(read("src", "pages", "Study.jsx"));
const STUDIO = norm(read("src", "components", "workspace", "StudioPanel.jsx"));
const LANDING = norm(read("src", "pages", "Landing.jsx"));
const SETTINGS = norm(read("src", "pages", "Settings.jsx"));
const APP = norm(read("src", "App.jsx"));

const FIND = { timeout: 5000 };

describe("the Sources empty state", () => {
  it("offers only what the panel can do: upload a file or paste text", () => {
    expect(SOURCES).toContain(
      "Upload a file, or paste text so the assistant has something to work with."
    );
    // There is no link-ingestion control anywhere in the panel — the two
    // header buttons are Paste text and Upload a file, nothing else.
    expect(SOURCES).not.toContain("add a link");
  });
});

describe("the Study review stats", () => {
  it("does not paint the Reviews count a second time as a 'Due state'", () => {
    expect(STUDY).not.toContain('label="Due state"');
    // What that tile showed — cards in the review state — is still
    // presented, exactly once, under the label that describes it.
    expect(STUDY).toContain('label="Reviews"');
    expect(norm(STUDY).match(/value=\{reviewCount\}/g)).toHaveLength(1);
  });
});

describe("the Studio list under an open output", () => {
  it("calls itself what it is, for every output type", () => {
    expect(STUDIO).toContain(">Other generations<");
    expect(STUDIO).not.toContain("Previous versions");
    expect(STUDIO).toContain("Nothing else generated yet.");
    // No type is carved out of the list: a second flashcards or quiz
    // run is a previous generation like any other.
    expect(STUDIO).not.toContain('openOutput.type !== "flashcards"');
    // The type chip uses a real utility class (it said varphi once).
    expect(STUDIO).not.toContain("text-muted-varphi");
    expect(STUDIO).toContain("text-muted-foreground");
  });
});

describe("opening a flashcards output", () => {
  const FLASHCARDS = {
    id: "o2",
    type: "flashcards",
    title: "Cell structure cards",
    created_at: "2026-01-05T10:00:00Z",
    topic: "Biology",
    content: { cards: [{ front: "Front", back: "Back" }] },
  };
  const SUMMARY = {
    id: "o1",
    type: "summary",
    title: "Old summary notes",
    created_at: "2026-01-01T10:00:00Z",
    content: { markdown: "# notes" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPanel(outputs) {
    studioApi.listOutputs.mockResolvedValue(outputs);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <StudioPanel spaceId="s1" />
        </ToastProvider>
      </QueryClientProvider>
    );
  }

  it("lists the earlier generation instead of claiming none exists", async () => {
    const user = userEvent.setup();
    renderPanel([SUMMARY, FLASHCARDS]);

    const row = await screen.findByRole(
      "button",
      { name: /Cell structure cards/ },
      FIND
    );
    await user.click(row);

    expect(
      await screen.findByRole("heading", { name: "Other generations" }, FIND)
    ).toBeInTheDocument();
    expect(screen.getByText("Old summary notes")).toBeInTheDocument();
    expect(screen.getByText("Summary")).toBeInTheDocument();
  });

  it("says so plainly when this is the only generation", async () => {
    const user = userEvent.setup();
    renderPanel([FLASHCARDS]);

    const row = await screen.findByRole(
      "button",
      { name: /Cell structure cards/ },
      FIND
    );
    await user.click(row);

    expect(
      await screen.findByRole("heading", { name: "Other generations" }, FIND)
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing else generated yet.")).toBeInTheDocument();
  });
});

describe("the Landing capability copy", () => {
  it("lists generation types that exist and says when editing happens", () => {
    expect(LANDING).not.toContain("cloze deletions");
    expect(LANDING).toContain(
      "Flashcards, practice quizzes, summaries and study guides."
    );
    // Generation persists the output immediately, so nothing is editable
    // "before you save"; summaries and guides can be edited afterwards.
    expect(LANDING).toContain('meta: "Summaries and guides edit in place"');
    expect(LANDING).not.toContain("Editable before you save");
  });

  it("claims only scheduling that the scheduler actually tracks", () => {
    expect(LANDING).toContain("per-card difficulty");
    // card_state stores difficulty, but no retention target exists to
    // configure or to quote back — measured recall is a stat, not a target.
    expect(LANDING).not.toContain("retention targets");
  });

  it("sends readers to surfaces that exist: session history, dashboard streaks", () => {
    expect(LANDING).not.toContain("activity log");
    expect(LANDING).toContain("session history");
    expect(LANDING).toContain("streak on the dashboard");
  });
});

describe("the Landing pricing cards", () => {
  it("quotes no space cap the backend does not enforce", () => {
    expect(LANDING).not.toContain('"3 spaces"');
    expect(LANDING).toContain('"Unlimited spaces"');
  });

  it("promises only cohort features that ship", () => {
    expect(LANDING).not.toContain("Shared reading lists");
    expect(LANDING).not.toContain("Group analytics");
    expect(LANDING).not.toContain("Priority retrieval");
    expect(LANDING).toContain('"Everything in Student"');
    expect(LANDING).toContain('"Shareable space links"');
  });

  it("aims Request access at a page that can receive one", () => {
    // /contact is a working form (with a mail fallback); /auth is
    // sign-in and can only receive an account, not a request.
    expect(LANDING).toContain('<Link to="/contact" className="block">');
    expect(LANDING).not.toContain('<Link to="/auth" className="block">');
  });
});

describe("the reduced-motion promise", () => {
  it("wraps the app tree in MotionConfig so framer-motion honours the OS setting", () => {
    expect(APP).toContain('<MotionConfig reducedMotion="user">');
  });

  it("says what actually remains under reduced motion", () => {
    expect(SETTINGS).toContain(
      "movement animations switch off and CSS transitions are cut to nothing"
    );
    expect(SETTINGS).toContain("Only gentle opacity fades remain");
    expect(SETTINGS).not.toContain("All animations are disabled");
  });
});
