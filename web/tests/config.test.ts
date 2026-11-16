import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises", () => ({
  default: { readFile: vi.fn(), writeFile: vi.fn() },
}));
vi.mock("@/lib/profile", () => ({
  scrapeConfigPath: (p: string) => `/tmp/${p}/scrape_config.json`,
}));

import fs from "fs/promises";
import { readConfig } from "@/lib/config";

describe("readConfig schedule field", () => {
  beforeEach(() => vi.resetAllMocks());

  it("defaults schedule to null when the file is missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    expect((await readConfig("p")).schedule).toBeNull();
  });

  it("defaults schedule to null for a legacy file without the field", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ job: ["dev"] }));
    const cfg = await readConfig("p");
    expect(cfg.schedule).toBeNull();
    expect(cfg.job).toEqual(["dev"]);
  });

  it("keeps a saved schedule", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ schedule: "0 8 * * *" }));
    expect((await readConfig("p")).schedule).toBe("0 8 * * *");
  });
});
