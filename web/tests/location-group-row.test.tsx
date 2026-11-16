import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocationGroupRow } from "@/app/jobs/_components/location-group-row";

function renderRow(props: Parameters<typeof LocationGroupRow>[0]) {
  return render(
    <table>
      <tbody>
        <LocationGroupRow {...props} />
      </tbody>
    </table>
  );
}

describe("LocationGroupRow", () => {
  it("shows the country name with its job count", () => {
    renderRow({ level: "country", label: "Australia", count: 4, colSpan: 7 });
    const cell = screen.getByRole("rowheader");
    expect(cell).toHaveTextContent("Australia");
    expect(cell).toHaveTextContent("4 jobs");
    expect(cell).toHaveAttribute("colspan", "7");
  });

  it("uses the singular for one job", () => {
    renderRow({ level: "region", label: "Victoria", count: 1, colSpan: 7 });
    expect(screen.getByRole("rowheader")).toHaveTextContent("1 job");
    expect(screen.getByRole("rowheader")).not.toHaveTextContent("1 jobs");
  });

  it("names an empty country and an empty region", () => {
    const { unmount } = renderRow({ level: "country", label: "", count: 2, colSpan: 7 });
    expect(screen.getByRole("rowheader")).toHaveTextContent("Unknown location");
    unmount();
    renderRow({ level: "region", label: "", count: 2, colSpan: 7 });
    expect(screen.getByRole("rowheader")).toHaveTextContent("No region");
  });
});
