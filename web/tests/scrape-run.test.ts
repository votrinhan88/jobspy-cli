// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDataDir, removeDataDir, seedProfile } from "./helpers";
import { readScrapeRun } from "@/lib/scrape-run";

let dataDir: string;

beforeEach(async () => {
  dataDir = await makeDataDir();
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

describe("readScrapeRun", () => {
  it("reads the report for a profile", async () => {
    const report = {
      started_at: "2026-11-04T08:00:00Z",
      finished_at: "2026-11-04T08:01:00Z",
      new_jobs: 3,
      total_jobs: 10,
      sources: [
        {
          site: "linkedin",
          attempts: 1,
          succeeded: 1,
          failed: 0,
          skipped: 0,
          jobs: 5,
          duration_ms: 1200,
          error: null,
        },
      ],
    };
    await seedProfile(dataDir, "alice", {
      "scrape_run.json": JSON.stringify(report),
    });

    await expect(readScrapeRun("alice")).resolves.toEqual(report);
  });

  it("returns null when the report is missing", async () => {
    await seedProfile(dataDir, "alice");

    await expect(readScrapeRun("alice")).resolves.toBeNull();
  });

  it("returns null when the report is not valid JSON", async () => {
    await seedProfile(dataDir, "alice", { "scrape_run.json": "not json" });

    await expect(readScrapeRun("alice")).resolves.toBeNull();
  });

  it("returns null when the source list is missing", async () => {
    await seedProfile(dataDir, "alice", {
      "scrape_run.json": JSON.stringify({ new_jobs: 1, total_jobs: 1 }),
    });

    await expect(readScrapeRun("alice")).resolves.toBeNull();
  });
});
