import { describe, expect, it } from "vitest";
import * as status from "@/lib/status";

const { STATUSES, statusLabel, isActiveStatus, isArchivedStatus, isSkippedStatus, isTrackedStatus, isRemote } = status;

describe("status module", () => {
  it("lists statuses in pipeline order with sentence-case labels", () => {
    expect(STATUSES).toEqual(["", "shortlisted", "applied", "interview", "offer", "accepted", "rejected", "skipped"]);
    expect(STATUSES.map(statusLabel)).toEqual([
      "Untriaged",
      "Shortlisted",
      "Applied",
      "Interview",
      "Offer",
      "Accepted",
      "Rejected",
      "Skipped",
    ]);
  });

  it("isActiveStatus is true for shortlisted, applied, interview, offer", () => {
    for (const s of ["shortlisted", "applied", "interview", "offer"] as const) {
      expect(isActiveStatus(s)).toBe(true);
    }
  });

  it("isActiveStatus is false for rejected, skipped and the empty status", () => {
    for (const s of ["rejected", "skipped", ""] as const) {
      expect(isActiveStatus(s)).toBe(false);
    }
  });

  it("isArchivedStatus is true for accepted, rejected and skipped only", () => {
    expect(STATUSES.filter(isArchivedStatus)).toEqual(["accepted", "rejected", "skipped"]);
  });

  it("isSkippedStatus is true only for skipped", () => {
    expect(STATUSES.filter(isSkippedStatus)).toEqual(["skipped"]);
  });

  it("isTrackedStatus leaves out new and skipped jobs", () => {
    expect(STATUSES.filter(isTrackedStatus)).toEqual([
      "shortlisted",
      "applied",
      "interview",
      "offer",
      "accepted",
      "rejected",
    ]);
  });

  it("isRemote accepts true, True, yes, 1 and rejects False, no, 0, empty", () => {
    for (const v of ["true", "True", "TRUE", "yes", "Yes", "1", " true "]) expect(isRemote(v)).toBe(true);
    for (const v of ["False", "false", "no", "0", "", undefined]) expect(isRemote(v)).toBe(false);
  });

  it("the module exports no transition table (free flow by design)", () => {
    const names = Object.keys(status);
    expect(names.filter((n) => /transition|next|allowed|graph|flow/i.test(n))).toEqual([]);
    for (const value of Object.values(status)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const inner of Object.values(value)) expect(Array.isArray(inner)).toBe(false);
      }
    }
  });
});
