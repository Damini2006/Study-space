import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CommandPalette from "@/components/layout/CommandPalette";
import { NAV_ITEMS } from "@/components/layout/use-command-palette";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: null, startDemo: vi.fn(), isDemo: false }),
}));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

async function openPalette() {
  render(<CommandPalette open onClose={() => {}} />);
  const input = await screen.findByRole("combobox");
  input.focus();
  return input;
}

describe("CommandPalette", () => {
  it("connects the field to its listbox as a combobox", async () => {
    const input = await openPalette();
    const listbox = screen.getByRole("listbox", { name: "Results" });

    expect(input).toHaveAttribute("aria-controls", listbox.getAttribute("id"));
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    // Focus stays in the field, so the active row has to be named by id.
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[0].getAttribute("id")
    );
  });

  it("moves the cursor with the arrow keys without running anything", async () => {
    const input = await openPalette();

    const before = input.getAttribute("aria-activedescendant");
    await userEvent.keyboard("{ArrowDown}");

    // ArrowDown used to call `run` on a fixed second row, so pressing it to
    // browse the list executed a command instead.
    expect(input.getAttribute("aria-activedescendant")).not.toBe(before);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });

  it("wraps from the first row back to the last", async () => {
    const input = await openPalette();
    const options = screen.getAllByRole("option");

    await userEvent.keyboard("{ArrowUp}");

    expect(input.getAttribute("aria-activedescendant")).toBe(
      options[options.length - 1].getAttribute("id")
    );
  });

  it("runs the row the cursor is on when Enter is pressed", async () => {
    const input = await openPalette();

    const activeId = input.getAttribute("aria-activedescendant");
    const text = document.getElementById(activeId).textContent;
    const expected = NAV_ITEMS.find((item) => text.includes(item.label));

    await userEvent.keyboard("{Enter}");

    expect(mocks.navigate).toHaveBeenCalledWith(expected.to);
  });

  it("keeps options free of nested controls", async () => {
    await openPalette();
    const options = screen.getAllByRole("option");

    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      // An option containing a button gave it a second focus stop inside a
      // pattern whose focus is meant to stay in the field.
      expect(option.querySelector("button")).toBeNull();
      expect(option.querySelector("a")).toBeNull();
    }
  });

  it("says so plainly when nothing matches", async () => {
    render(<CommandPalette open onClose={() => {}} />);
    const input = await screen.findByRole("combobox");

    await userEvent.type(input, "zzzzzzzzzz");

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("presentation")).toHaveTextContent("No matches");
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });
});
