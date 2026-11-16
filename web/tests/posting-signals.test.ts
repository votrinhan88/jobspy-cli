import { describe, expect, it } from "vitest";
import { firstSeenDays, isReposted } from "@/lib/posting-signals";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-11-05T12:00:00Z");

describe("firstSeenDays", () => {
  it("counts whole days since the first sighting", () => {
    expect(firstSeenDays("2026-10-06T12:00:00Z", NOW)).toBe(30);
  });

  it("returns null without a valid first sighting", () => {
    expect(firstSeenDays("", NOW)).toBeNull();
    expect(firstSeenDays("not a date", NOW)).toBeNull();
  });

  it("does not go below zero for a time in the future", () => {
    expect(firstSeenDays("2026-11-06T12:00:00Z", NOW)).toBe(0);
  });
});

describe("isReposted", () => {
  it("is true when the board date is later than the first sighting", () => {
    const first = "2026-10-01T00:00:00Z";
    const posted = new Date(Date.parse(first) + 3 * DAY_MS).toISOString().slice(0, 10);
    expect(isReposted(first, posted)).toBe(true);
  });

  it("is false within one day, so a time zone cannot trigger it", () => {
    expect(isReposted("2026-10-01T12:00:00Z", "2026-10-02")).toBe(false);
  });

  it("is false when either date is missing or invalid", () => {
    expect(isReposted("", "2026-10-05")).toBe(false);
    expect(isReposted("2026-10-01T00:00:00Z", "")).toBe(false);
    expect(isReposted("2026-10-01T00:00:00Z", "not a date")).toBe(false);
  });
});
