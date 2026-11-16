import { describe, expect, it } from "vitest";
import { STALE_DAYS, formatLastSeen, isClosed, isNew, isStale, latestCrawlAt } from "@/lib/lifecycle";

const now = Date.parse("2026-09-15T12:00:00Z");
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

describe("isStale", () => {
  it("treats an empty or invalid timestamp as not stale", () => {
    expect(isStale("", now)).toBe(false);
    expect(isStale("not a date", now)).toBe(false);
  });

  it("uses 14 days as the default", () => {
    expect(STALE_DAYS).toBe(14);
  });

  it("is false at the boundary and true after it", () => {
    expect(isStale(daysAgo(14), now)).toBe(false);
    expect(isStale(daysAgo(15), now)).toBe(true);
  });

  it("accepts a custom number of days", () => {
    expect(isStale(daysAgo(3), now, 2)).toBe(true);
    expect(isStale(daysAgo(1), now, 2)).toBe(false);
  });
});

describe("isClosed", () => {
  it("is true only for a non-empty close time", () => {
    expect(isClosed("2026-09-01T00:00:00Z")).toBe(true);
    expect(isClosed("   ")).toBe(false);
    expect(isClosed("")).toBe(false);
  });
});

describe("formatLastSeen", () => {
  it("shows the date part of the timestamp", () => {
    expect(formatLastSeen("2026-09-01T10:30:00Z")).toBe("2026-09-01");
  });

  it("shows a dash when there is no timestamp", () => {
    expect(formatLastSeen("")).toBe("—");
    expect(formatLastSeen("   ")).toBe("—");
  });
});

describe("latestCrawlAt", () => {
  it("is the newest last seen time", () => {
    const jobs = [
      { last_seen_at: "2026-09-10T00:00:00Z" },
      { last_seen_at: "2026-09-15T01:00:00Z" },
      { last_seen_at: "" },
      { last_seen_at: "not a date" },
    ];
    expect(latestCrawlAt(jobs)).toBe(Date.parse("2026-09-15T01:00:00Z"));
  });

  it("is null when no job has a last seen time", () => {
    expect(latestCrawlAt([])).toBeNull();
    expect(latestCrawlAt([{ last_seen_at: "" }])).toBeNull();
  });
});

describe("isNew", () => {
  const crawl = Date.parse("2026-09-15T01:00:00Z");

  it("is true when the job was first seen in the latest crawl", () => {
    expect(isNew("2026-09-15T01:00:00Z", crawl)).toBe(true);
  });

  it("matches a timestamp with microseconds from the engine", () => {
    expect(isNew("2026-09-15T01:00:00.266491Z", Date.parse("2026-09-15T01:00:00.266491Z"))).toBe(true);
  });

  it("is false when the job was first seen in an earlier crawl", () => {
    expect(isNew("2026-09-14T01:00:00Z", crawl)).toBe(false);
  });

  it("is false for a missing or invalid first seen time", () => {
    expect(isNew("", crawl)).toBe(false);
    expect(isNew("not a date", crawl)).toBe(false);
  });

  it("is false when there is no crawl", () => {
    expect(isNew("2026-09-15T01:00:00Z", null)).toBe(false);
  });
});
