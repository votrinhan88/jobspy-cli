import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SankeyChart } from "@/components/sankey-chart";
import { buildSankey } from "@/lib/sankey";

const graph = buildSankey([
  { job_id: "a", from: "", to: "shortlisted" },
  { job_id: "b", from: "", to: "shortlisted" },
  { job_id: "a", from: "shortlisted", to: "applied" },
]);

describe("SankeyChart", () => {
  it("draws one node per stage and one link per move", () => {
    const { container } = render(<SankeyChart graph={graph} />);
    expect(screen.getByRole("img", { name: /application flow/i })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-sankey-node]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-sankey-link]")).toHaveLength(2);
  });

  it("labels the moves with their counts", () => {
    render(<SankeyChart graph={graph} />);
    expect(screen.getByText("Scrape to Shortlisted: 2")).toBeInTheDocument();
    expect(screen.getByText("Shortlisted to Applied: 1")).toBeInTheDocument();
  });

  it("colors each flow by the stage it reaches", () => {
    const { container } = render(<SankeyChart graph={graph} />);
    expect(container.querySelectorAll(".sankey-link--shortlisted")).toHaveLength(1);
    expect(container.querySelectorAll(".sankey-link--applied")).toHaveLength(1);
    expect(container.querySelectorAll(".sankey-node--shortlisted")).toHaveLength(1);
  });

  it("prints the count on every flow", () => {
    const { container } = render(<SankeyChart graph={graph} />);
    const counts = [...container.querySelectorAll("[data-sankey-count]")].map((el) => el.textContent);
    expect(counts).toEqual(["2", "1"]);
  });

  it("shows an empty state when nothing moved", () => {
    render(<SankeyChart graph={buildSankey([])} />);
    expect(screen.getByText(/no status changes recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
