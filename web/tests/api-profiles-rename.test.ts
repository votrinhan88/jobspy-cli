import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  cookieSetCalls,
  getCookie,
  jsonRequest,
  makeDataDir,
  params,
  removeDataDir,
  seedProfile,
  setCookies,
} from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const { PATCH } = await import("@/app/api/profiles/[name]/route");

const FILES: Record<string, string> = {
  "jobs.csv": "job_id,title\na-1,Engineer\n",
  "cv.md": "# CV\n",
  "scrape_config.json": '{"job":["AI Engineer"]}',
  "scrape_history.json": "[]",
  "scrape.log": "log line\n",
  "status_log.jsonl": '{"job_id":"a-1","from":"","to":"applied","at":"2026-09-01T00:00:00.000Z"}\n',
};

let dataDir: string;

beforeEach(async () => {
  dataDir = await makeDataDir();
  setCookies();
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

function rename(oldName: string, newName: unknown) {
  return PATCH(jsonRequest("PATCH", { name: newName }) as NextRequest, params({ name: oldName }));
}

async function readAll(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const f of await fs.readdir(dir)) out[f] = await fs.readFile(path.join(dir, f), "utf-8");
  return out;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe("PATCH /api/profiles/[name]", () => {
  it("renames the folder and keeps every file (jobs.csv, cv, config, history, log, status log)", async () => {
    await seedProfile(dataDir, "old", FILES);
    const res = await rename("old", "new");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("new");
    expect(await exists(path.join(dataDir, "old"))).toBe(false);
    expect(await readAll(path.join(dataDir, "new"))).toEqual(FILES);
  });

  it("moves the active cookie to the new name when the renamed profile was active", async () => {
    await seedProfile(dataDir, "old", FILES);
    setCookies({ active_profile: "old" });
    const res = await rename("old", "new");
    expect(res.status).toBe(200);
    expect((await res.json()).active).toBe("new");
    expect(getCookie("active_profile")).toBe("new");
    expect(cookieSetCalls.at(-1)?.options).toEqual({ httpOnly: true, path: "/", sameSite: "lax" });
  });

  it("leaves the cookie alone when another profile is active", async () => {
    await seedProfile(dataDir, "old", FILES);
    await seedProfile(dataDir, "other");
    setCookies({ active_profile: "other" });
    const res = await rename("old", "new");
    expect(res.status).toBe(200);
    expect((await res.json()).active).toBe("other");
    expect(getCookie("active_profile")).toBe("other");
    expect(cookieSetCalls).toHaveLength(0);
  });

  it("returns 404 for an unknown profile", async () => {
    const res = await rename("ghost", "new");
    expect(res.status).toBe(404);
  });

  it("returns 409 when the new name exists, and leaves both folders unchanged", async () => {
    await seedProfile(dataDir, "old", FILES);
    await seedProfile(dataDir, "taken", { "jobs.csv": "job_id\nb-2\n" });
    const res = await rename("old", "taken");
    expect(res.status).toBe(409);
    expect(await readAll(path.join(dataDir, "old"))).toEqual(FILES);
    expect(await readAll(path.join(dataDir, "taken"))).toEqual({ "jobs.csv": "job_id\nb-2\n" });
  });

  it("returns 422 for an invalid new name", async () => {
    await seedProfile(dataDir, "old", FILES);
    for (const bad of ["", "a/b", "..", "a b", "x".repeat(65), 42]) {
      const res = await rename("old", bad);
      expect(res.status).toBe(422);
    }
    expect(await readAll(path.join(dataDir, "old"))).toEqual(FILES);
  });

  it("returns 422 for an invalid old name such as ..", async () => {
    await seedProfile(dataDir, "old", FILES);
    const res = await rename("..", "new");
    expect(res.status).toBe(422);
    expect(await exists(path.join(dataDir, "new"))).toBe(false);
  });

  it("returns 200 and changes nothing when the new name equals the old name", async () => {
    await seedProfile(dataDir, "old", FILES);
    setCookies({ active_profile: "old" });
    const res = await rename("old", "old");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "old", active: "old" });
    expect(await readAll(path.join(dataDir, "old"))).toEqual(FILES);
    expect(cookieSetCalls).toHaveLength(0);
  });
});
