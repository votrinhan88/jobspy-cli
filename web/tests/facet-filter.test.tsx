import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FacetFilter } from "@/app/jobs/_components/facet-filter";

function renderFilter(options: string[], selected: string[] = []) {
  const onChange = vi.fn();
  render(
    <FacetFilter
      label="Priority"
      options={options}
      selected={selected}
      valueLabel={(value) => value}
      onChange={onChange}
    />
  );
  return onChange;
}

describe("FacetFilter", () => {
  it("shows plain checkboxes for five options or fewer", async () => {
    renderFilter(["one", "two", "three"]);

    await userEvent.click(screen.getByRole("button", { name: /Priority/ }));

    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("shows All and Clear for more than five options", async () => {
    const options = ["one", "two", "three", "four", "five", "six"];
    const onChange = renderFilter(options);

    await userEvent.click(screen.getByRole("button", { name: /Priority/ }));
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith(options);
  });

  it("clears all options", async () => {
    const options = ["one", "two", "three", "four", "five", "six"];
    const onChange = renderFilter(options, options);

    await userEvent.click(screen.getByRole("button", { name: /Priority/ }));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("toggles one checkbox", async () => {
    const onChange = renderFilter(["remote", "onsite"], ["remote"]);

    await userEvent.click(screen.getByRole("button", { name: /Priority/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "onsite" }));

    expect(onChange).toHaveBeenCalledWith(["remote", "onsite"]);
  });
});
