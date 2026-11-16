import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FetchDescriptionOption } from "@/app/scrape/_components/fetch-description-option";

describe("FetchDescriptionOption", () => {
  it("shows the checkbox with its state", () => {
    render(<FetchDescriptionOption checked onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Fetch LinkedIn descriptions" })).toBeChecked();
  });

  it("calls onChange with the new value", async () => {
    const onChange = vi.fn();
    render(<FetchDescriptionOption checked onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Fetch LinkedIn descriptions" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("turns the option on", async () => {
    const onChange = vi.fn();
    render(<FetchDescriptionOption checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Fetch LinkedIn descriptions" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("warns that scrapes are slower and says what the option is for", () => {
    render(<FetchDescriptionOption checked onChange={vi.fn()} />);
    expect(screen.getByText(/slower/i)).toBeInTheDocument();
    expect(screen.getByText(/resume/i)).toBeInTheDocument();
  });
});
