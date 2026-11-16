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

describe("readConfig fetch_linkedin_description field", () => {
  beforeEach(() => vi.resetAllMocks());

  it("defaults to true when the file is missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    expect((await readConfig("p")).fetch_linkedin_description).toBe(true);
  });

  it("defaults to true for a legacy file without the field", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ job: ["dev"] }));
    expect((await readConfig("p")).fetch_linkedin_description).toBe(true);
  });

  it("keeps a saved false", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ fetch_linkedin_description: false }));
    expect((await readConfig("p")).fetch_linkedin_description).toBe(false);
  });
});
