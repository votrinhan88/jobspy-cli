import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetJobspyCache } from "@/lib/jobspy-version";

const route = await import("@/app/api/jobspy-version/route");

let dir: string;
const fetchMock = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  resetJobspyCache();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "jobspy-lock-"));
  await fs.writeFile(path.join(dir, "uv.lock"), '[[package]]\nname = "python-jobspy"\nversion = "1.4.1"\n');
  vi.stubEnv("JOBSPY_LOCK_FILE", path.join(dir, "uv.lock"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("GET /api/jobspy-version", () => {
  it("returns the locked version, the latest version and the outdated flag", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ info: { version: "1.6.0" } }) });
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ installed: "1.4.1", latest: "1.6.0", outdated: true });
  });

  it("stays quiet with 200 when the lock file is missing", async () => {
    vi.stubEnv("JOBSPY_LOCK_FILE", path.join(dir, "missing.lock"));
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ info: { version: "1.6.0" } }) });
    expect(await (await route.GET()).json()).toEqual({ installed: null, latest: "1.6.0", outdated: false });
  });

  it("stays quiet with 200 when PyPI cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await (await route.GET()).json()).toEqual({ installed: "1.4.1", latest: null, outdated: false });
  });
});
