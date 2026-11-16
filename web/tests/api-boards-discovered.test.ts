import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import type { NextRequest } from "next/server";
import { makeDataDir, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const route = await import("@/app/api/boards/discovered/route");

let dataDir: string;

const csv = [
  "job_id,title,company,location,is_remote,date_posted,job_url,job_url_direct,status,status_updated_at",
  "a,AI Engineer,Xero,Sydney,False,2026-08-01,https://x.test/1,https://jobs.ashbyhq.com/xero/1,,",
  "b,ML Engineer,Q-CTRL,Sydney,False,2026-08-01,https://x.test/2,https://jobs.lever.co/q-ctrl/2,,",
  "c,Dev,Acme,Sydney,False,2026-08-01,https://x.test/3,https://jobs.lever.co/acme/3,,",
].join("\n") + "\n";

const post = (body: unknown) =>
  route.POST(
    new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }) as NextRequest
  );

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice", {
    "jobs.csv": csv,
    "scrape_config.json": JSON.stringify({ job: ["x"], companies: ["lever:acme:Acme"] }),
  });
  setCookies({ active_profile: "alice" });
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

describe("/api/boards/discovered", () => {
  it("lists boards found in saved jobs, leaving out the ones already in the config", async () => {
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).boards).toEqual([
      { entry: "ashby:xero", name: "Xero", jobs: 1 },
      { entry: "lever:q-ctrl", name: "Q-CTRL", jobs: 1 },
    ]);
  });

  it("hides a dismissed board and keeps the choice in the profile folder", async () => {
    const res = await post({ dismiss: "lever:q-ctrl" });
    expect(res.status).toBe(200);
    expect((await (await route.GET()).json()).boards.map((b: { entry: string }) => b.entry)).toEqual([
      "ashby:xero",
    ]);
    const saved = JSON.parse(await fs.readFile(path.join(dataDir, "alice", "dismissed_boards.json"), "utf-8"));
    expect(saved).toEqual(["lever:q-ctrl"]);
  });

  it("stores a dismissed board once", async () => {
    await post({ dismiss: "ashby:xero" });
    await post({ dismiss: "ashby:xero" });
    const saved = JSON.parse(await fs.readFile(path.join(dataDir, "alice", "dismissed_boards.json"), "utf-8"));
    expect(saved).toEqual(["ashby:xero"]);
  });

  it("rejects a dismiss value that is not a board entry", async () => {
    expect((await post({ dismiss: "lever:../x" })).status).toBe(400);
    expect((await post({ dismiss: 5 })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
  });

  it("returns an empty list when the profile has no jobs file", async () => {
    await fs.rm(path.join(dataDir, "alice", "jobs.csv"));
    expect((await (await route.GET()).json()).boards).toEqual([]);
  });

  it("returns 400 without a profile", async () => {
    await removeDataDir(dataDir);
    dataDir = await makeDataDir();
    expect((await route.GET()).status).toBe(400);
    expect((await post({ dismiss: "lever:acme" })).status).toBe(400);
  });
});
