import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDataDir, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const { GET } = await import("@/app/api/jobs/log/route");

let dataDir: string;
const A = { job_id: "a", from: "", to: "applied", at: "2026-09-01T00:00:00.000Z" };
const B = { job_id: "b", from: "", to: "offer", at: "2026-09-02T00:00:00.000Z" };

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alpha", { "status_log.jsonl": JSON.stringify(A) + "\n" });
  await seedProfile(dataDir, "beta", { "status_log.jsonl": JSON.stringify(B) + "\nnot json\n" });
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

describe("GET /api/jobs/log", () => {
  it("returns the status log of the active profile", async () => {
    setCookies({ active_profile: "beta" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([B]);
  });

  it("returns an empty list when the profile has no log", async () => {
    await fs.rm(path.join(dataDir, "alpha", "status_log.jsonl"));
    setCookies({ active_profile: "alpha" });
    expect(await (await GET()).json()).toEqual([]);
  });

  it("returns 400 when there is no active profile", async () => {
    await fs.rm(path.join(dataDir, "alpha"), { recursive: true });
    await fs.rm(path.join(dataDir, "beta"), { recursive: true });
    setCookies();
    expect((await GET()).status).toBe(400);
  });
});
