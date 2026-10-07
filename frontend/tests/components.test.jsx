import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorBoundary from "@/components/ErrorBoundary";
import { reportClientError } from "@/lib/clientErrors";
import { Button, buttonVariants } from "@/components/ui/button";

// The boundary escalates through this reporter; the real one fetches, and
// these tests are about the escalation, not the transport.
vi.mock("@/lib/clientErrors", () => ({ reportClientError: vi.fn() }));
import { ConfidenceMeter } from "@/components/ui/confidence-meter";
import { StatusBadge, StatusDot } from "@/components/ui/status-badges";
import { Card, CardSkeleton, CardTitle } from "@/components/ui/card";

describe("Button", () => {
  it("renders as a real button with type=button by default", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveAttribute("type", "button");
  });

  it("marks itself busy while loading and blocks clicks", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Saving" });
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toBeDisabled();

    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps an explicit disabled state", () => {
    render(<Button disabled>Nope</Button>);
    expect(screen.getByRole("button", { name: "Nope" })).toBeDisabled();
  });
});

describe("buttonVariants", () => {
  it("builds distinct classes per variant and size", () => {
    expect(buttonVariants({ variant: "destructive" })).toContain("bg-destructive");
    expect(buttonVariants({ variant: "ghost" })).toContain("hover:bg-surface-2");
    expect(buttonVariants({ size: "lg" })).toContain("h-11");
    expect(buttonVariants()).toContain("bg-primary");
  });
});

describe("ConfidenceMeter", () => {
  it("exposes progressbar semantics with a human-readable value", () => {
    render(<ConfidenceMeter value={0.85} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "85");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "85% - High confidence");
  });

  it("picks the label tier that matches the value", () => {
    render(<ConfidenceMeter value={0.72} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "72% - Medium confidence"
    );
  });

  it("drops to the Low tier below 0.6", () => {
    render(<ConfidenceMeter value={0.5} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "50% - Low confidence"
    );
  });

  it("clamps to the lowest tier for tiny values", () => {
    render(<ConfidenceMeter value={0.05} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "5% - Very Low confidence"
    );
  });
});

describe("StatusBadge", () => {
  // Colour is never the only signal: every badge carries an icon + text label.
  it.each([
    ["verified", "Verified"],
    ["low_confidence", "Low confidence"],
    ["not_found", "Not found"],
    ["pending", "Checking…"],
  ])("renders %s with a visible text label", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("falls back to a known state for an unknown status", () => {
    render(<StatusBadge status="who-knows" />);
    expect(screen.getByText("Checking…")).toBeInTheDocument();
  });
});

describe("StatusDot", () => {
  it("is announced as a status region only when labelled", () => {
    const { rerender } = render(<StatusDot active />);
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<StatusDot active label="Streaming" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Streaming");
    expect(screen.getByText("Streaming")).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("renders children under a heading", () => {
    render(
      <Card>
        <CardTitle>Focus this week</CardTitle>
      </Card>
    );
    expect(screen.getByRole("heading", { name: "Focus this week" })).toBeInTheDocument();
  });
});

describe("CardSkeleton", () => {
  it("announces itself as loading and repeats once per requested line", () => {
    const { container } = render(<CardSkeleton lines={4} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading content");
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    // 1 header bar + N text lines
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(5);
  });
});

describe("ErrorBoundary", () => {
  it("escalates a render crash instead of swallowing it", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom() {
      throw new Error("render exploded");
    }

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    // The user still gets the themed fallback...
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // ...the console still gets the stack for the dev overlay...
    expect(consoleSpy).toHaveBeenCalled();
    // ...and the backend gets a report: React caught this crash, so the
    // window's error handler never fires and this is its only door.
    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "render exploded",
        source: "boundary",
        stack: expect.stringContaining("render exploded"),
      })
    );
    consoleSpy.mockRestore();
  });
});
