import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/jobs" }));

import { Nav } from "@/components/nav";

describe("Nav", () => {
  it("puts Resume between Jobs and Applications and Profile last", () => {
    render(<Nav activeProfile="alice" />);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      "/scrape",
      "/jobs",
      "/resume",
      "/applications",
      "/archived",
      "/statistics",
      "/profile",
    ]);
  });
});
