import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dialog, Select } from "@/components/ui/dialog";

const OPTIONS = [
  { value: "1", label: "1 day" },
  { value: "7", label: "1 week" },
  { value: "30", label: "1 month" },
];

describe("Select", () => {
  it("renders one real <option> per entry, each showing its label", () => {
    const { container } = render(
      <Select value="7" onValueChange={() => {}} options={OPTIONS} />
    );

    const options = [...container.querySelectorAll("option")];
    expect(options.map((o) => o.value)).toEqual(["1", "7", "30"]);
    expect(options.map((o) => o.textContent)).toEqual(["1 day", "1 week", "1 month"]);
    expect(container.querySelector("select")).toHaveValue("7");
  });

  it("renders no option list outside the control", () => {
    // The composite this replaced put every choice in a standalone listbox
    // that was always on screen and unreachable from the trigger.
    const { container } = render(
      <Select value="7" onValueChange={() => {}} options={OPTIONS} />
    );

    expect(container.querySelectorAll("select")).toHaveLength(1);
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(container.querySelectorAll('[role="listbox"]')).toHaveLength(0);
    expect(container.querySelectorAll("div")).toHaveLength(0);
  });

  it("offers the placeholder only while the value matches nothing", () => {
    const { rerender, container } = render(
      <Select value="" onValueChange={() => {}} options={OPTIONS} placeholder="Never" />
    );
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(container).toHaveTextContent("Never");

    rerender(
      <Select value="30" onValueChange={() => {}} options={OPTIONS} placeholder="Never" />
    );
    expect(screen.getByRole("combobox")).toHaveValue("30");
    expect(container).toHaveTextContent("1 month");
    expect(container).not.toHaveTextContent("Never");
  });

  it('treats "" as a real value rather than as "nothing selected"', () => {
    // The RAG model selectors use "" to mean "Deployment default".
    const { container } = render(
      <Select
        value=""
        onValueChange={() => {}}
        options={[
          { value: "", label: "Deployment default" },
          { value: "gpt-4o", label: "GPT-4o" },
        ]}
        placeholder="Deployment default"
      />
    );

    const options = [...container.querySelectorAll("option")];
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Deployment default");
    expect(options[1]).toHaveTextContent("GPT-4o");
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("reports the chosen value back as a string", async () => {
    const onValueChange = vi.fn();
    render(<Select value="1" onValueChange={onValueChange} options={OPTIONS} />);

    await userEvent.selectOptions(screen.getByRole("combobox"), "30");

    expect(onValueChange).toHaveBeenCalledWith("30");
  });

  it("resolves through a label's htmlFor/id pair", () => {
    render(
      <>
        <label htmlFor="expiry">Expires in</label>
        <Select id="expiry" value="7" onValueChange={() => {}} options={OPTIONS} />
      </>
    );

    expect(screen.getByLabelText("Expires in")).toBe(screen.getByRole("combobox"));
  });

  it("keeps platform semantics instead of approximating them", () => {
    const { container } = render(
      <Select value="7" onValueChange={() => {}} options={OPTIONS} />
    );

    // Native, so keyboard operation and assistive-tech support come from the
    // platform rather than from code that can drift out of sync with it.
    expect(container.querySelector("select")).not.toBeNull();
    expect(screen.getByRole("combobox")).toBe(container.querySelector("select"));
  });
});

function DialogTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Modal">
        <input aria-label="Search" />
        <button type="button">Inside</button>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("takes its name from the title and its description from the copy", () => {
    render(
      <Dialog
        open
        onClose={() => {}}
        title="Share this space"
        description="Invite people by link."
      >
        <p>body</p>
      </Dialog>
    );

    expect(
      screen.getByRole("dialog", { name: "Share this space" })
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "Invite people by link."
    );
  });

  it("focuses the dialog itself so the title is read before its contents", async () => {
    render(
      <Dialog open onClose={() => {}} title="Modal">
        <button type="button">Inside</button>
      </Dialog>
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    // Landing on the close button announced only "Close dialog", with no
    // hint of what the dialog was for.
    expect(screen.getByRole("button", { name: "Close dialog" })).not.toHaveFocus();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Modal">
        <button type="button">Inside</button>
      </Dialog>
    );

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wraps Tab forward past controls that cannot hold focus", () => {
    render(
      <Dialog open onClose={() => {}} title="Modal">
        <button type="button">Kept</button>
        <button type="button" disabled>
          Disabled last
        </button>
      </Dialog>
    );

    screen.getByRole("button", { name: "Kept" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });

    // A disabled trailing control cannot be focused, so if it is counted as
    // the last one the wrap never triggers and Tab leaves the dialog.
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
  });

  it("wraps Shift+Tab backward from the first control", () => {
    render(
      <Dialog open onClose={() => {}} title="Modal">
        <button type="button">Kept</button>
      </Dialog>
    );

    screen.getByRole("button", { name: "Close dialog" }).focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(screen.getByRole("button", { name: "Kept" })).toHaveFocus();
  });

  it("returns focus to whatever opened it once it closes", async () => {
    render(<DialogTrigger />);

    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("leaves focus alone when a parent re-renders with a new onClose", async () => {
    // Every call site passes `onClose` inline, so it is a fresh function on
    // each render. Depending on it made the open effect re-run whenever any
    // parent state changed, yanking focus out of the field being typed in.
    function Parent({ label }) {
      const [open] = useState(true);
      return (
        <Dialog open={open} onClose={() => {}} title={label}>
          <input aria-label="Search" />
        </Dialog>
      );
    }

    const { rerender } = render(<Parent label="First" />);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());

    const field = screen.getByLabelText("Search");
    field.focus();
    rerender(<Parent label="Second" />);

    // The effect schedules its focus request on the next frame, so wait one:
    // a rebuild would land the focus back on the dialog here.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(field).toHaveFocus();
  });

  it("locks page scrolling only while it is open", () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => {}} title="Modal">
        <p>body</p>
      </Dialog>
    );
    expect(document.body.style.overflow).toBe("");

    rerender(
      <Dialog open onClose={() => {}} title="Modal">
        <p>body</p>
      </Dialog>
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Dialog open={false} onClose={() => {}} title="Modal">
        <p>body</p>
      </Dialog>
    );
    expect(document.body.style.overflow).toBe("");
  });
});
