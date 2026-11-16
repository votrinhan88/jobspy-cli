import { describe, expect, it } from "vitest";
import { STALE_DAYS, formatLastSeen, isClosed, isNewInRun, isStale } from "@/lib/lifecycle";

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

describe("isNewInRun", () => {
  const run = "2026-09-15T12:00:00Z";

  it("is true when the job first appeared in the latest run", () => {
    expect(isNewInRun(run, run)).toBe(true);
    expect(isNewInRun("2026-09-15T12:00:01Z", run)).toBe(true);
  });

  it("is false when the job first appeared before the latest run", () => {
    expect(isNewInRun("2026-09-14T12:00:00Z", run)).toBe(false);
  });

  it("is false without a first-seen time or a run time", () => {
    expect(isNewInRun("", run)).toBe(false);
    expect(isNewInRun(run, null)).toBe(false);
    expect(isNewInRun("not a date", run)).toBe(false);
  });
});
