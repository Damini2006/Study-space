import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Select } from "@/components/ui/dialog";

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
