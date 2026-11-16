// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getActiveProfile, readConfig, writeConfig, registerSchedule, isValidSchedule } = vi.hoisted(
  () => ({
    getActiveProfile: vi.fn(),
    readConfig: vi.fn(),
    writeConfig: vi.fn(),
    registerSchedule: vi.fn(),
    isValidSchedule: vi.fn(),
  })
);

vi.mock("@/lib/profile", () => ({ getActiveProfile }));
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, readConfig, writeConfig };
});
vi.mock("@/lib/scheduler", () => ({ registerSchedule, isValidSchedule }));

import { PUT } from "@/app/api/scrape/config/route";
import type { NextRequest } from "next/server";

function put(body: unknown): NextRequest {
  return new Request("http://localhost/api/scrape/config", {
    method: "PUT",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  getActiveProfile.mockResolvedValue("alice");
  isValidSchedule.mockReturnValue(true);
});

describe("PUT /api/scrape/config schedule handling", () => {
  it("saves the config and registers the schedule", async () => {
    const res = await PUT(put({ job: ["dev"], schedule: "0 8 * * *" }));
    expect(res.status).toBe(200);
    expect(writeConfig).toHaveBeenCalledTimes(1);
    expect(registerSchedule).toHaveBeenCalledWith("alice", "0 8 * * *");
  });

  it("unregisters the schedule when it is null", async () => {
    await PUT(put({ job: ["dev"], schedule: null }));
    expect(registerSchedule).toHaveBeenCalledWith("alice", null);
  });

  it("treats a missing schedule field as null", async () => {
    await PUT(put({ job: ["dev"] }));
    expect(registerSchedule).toHaveBeenCalledWith("alice", null);
  });

  it("rejects an invalid expression with 400 and saves nothing", async () => {
    isValidSchedule.mockReturnValue(false);
    const res = await PUT(put({ job: ["dev"], schedule: "garbage" }));
    expect(res.status).toBe(400);
    expect(writeConfig).not.toHaveBeenCalled();
    expect(registerSchedule).not.toHaveBeenCalled();
  });

  it("rejects a schedule when the keyword list is empty", async () => {
    const res = await PUT(put({ job: [], schedule: "0 8 * * *" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/keyword/i);
    expect(writeConfig).not.toHaveBeenCalled();
    expect(registerSchedule).not.toHaveBeenCalled();
  });

  it("allows an empty keyword list when the schedule is off", async () => {
    const res = await PUT(put({ job: [], schedule: null }));
    expect(res.status).toBe(200);
    expect(writeConfig).toHaveBeenCalledTimes(1);
  });

  it("returns 400 without an active profile", async () => {
    getActiveProfile.mockResolvedValue(null);
    const res = await PUT(put({ schedule: null }));
    expect(res.status).toBe(400);
    expect(registerSchedule).not.toHaveBeenCalled();
  });
});

describe("PUT /api/scrape/config validation", () => {
  it("rejects a bad field and saves nothing", async () => {
    const res = await PUT(put({ job: ["dev"], results_wanted: "many", schedule: null }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/results_wanted/);
    expect(writeConfig).not.toHaveBeenCalled();
  });

  it("saves the cleaned config", async () => {
    const res = await PUT(put({ job: ["dev"], site_name: ["linkedin", "google", "glassdoor"], schedule: null }));
    expect(res.status).toBe(200);
    expect(writeConfig).toHaveBeenCalledWith(
      "alice",
      expect.objectContaining({ site_name: ["linkedin"] })
    );
  });
});
