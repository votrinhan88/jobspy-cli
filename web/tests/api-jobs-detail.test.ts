import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { importText } from "@/lib/resumes/library";
import { makeDataDir, params, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const jobsRoute = await import("@/app/api/jobs/route");
const jobRoute = await import("@/app/api/jobs/[jobId]/route");
const matchRoute = await import("@/app/api/jobs/[jobId]/match/route");

const CSV = [
  "job_id,title,company,location,description,job_url,status,status_updated_at",
  'acme-ml-aaaa1111,ML Engineer,Acme,Paris,"Build Python models.\nUse SQL and Docker.",https://x.io/1,shortlisted,2026-09-01T00:00:00.000Z',
  "beta-dev-bbbb2222,Developer,Beta,Rome,,https://x.io/2,,",
].join("\n");

const req = (url = "http://localhost/test") => new Request(url) as NextRequest;

let dataDir: string;

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice", { "jobs.csv": CSV });
  setCookies({ active_profile: "alice" });
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

describe("GET /api/jobs", () => {
  it("leaves the description out of every row and keeps the other fields", async () => {
    const rows = await (await jobsRoute.GET()).json();
    expect(rows).toHaveLength(2);
    for (const row of rows) expect("description" in row).toBe(false);
    expect(rows[0]).toMatchObject({ job_id: "acme-ml-aaaa1111", title: "ML Engineer", status: "shortlisted" });
  });
});

describe("GET /api/jobs/[jobId]", () => {
  it("returns the row with its description", async () => {
    const res = await jobRoute.GET(req(), params({ jobId: "acme-ml-aaaa1111" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("ML Engineer");
    expect(body.description).toBe("Build Python models.\nUse SQL and Docker.");
  });

  it("returns an empty description for an old row without text", async () => {
    const body = await (await jobRoute.GET(req(), params({ jobId: "beta-dev-bbbb2222" }))).json();
    expect(body.description).toBe("");
  });

  it("returns 404 for an unknown job", async () => {
    expect((await jobRoute.GET(req(), params({ jobId: "ghost" }))).status).toBe(404);
  });

  it("returns 400 without an active profile", async () => {
    await removeDataDir(dataDir);
    dataDir = await makeDataDir();
    setCookies();
    expect((await jobRoute.GET(req(), params({ jobId: "acme-ml-aaaa1111" }))).status).toBe(400);
  });
});

describe("GET /api/jobs/[jobId]/match", () => {
  it("ranks the tags for a job that has a description", async () => {
    await importText("alice", "backend", "Python SQL Docker models");
    await importText("alice", "frontend", "React CSS");
    const res = await matchRoute.GET(req(), params({ jobId: "acme-ml-aaaa1111" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasDescription).toBe(true);
    expect(body.ranking.map((r: { tag: string }) => r.tag)).toEqual(["backend", "frontend"]);
    expect(body.ranking[0].score).toBeGreaterThan(body.ranking[1].score);
    expect(body.ranking[0].matched).toEqual(expect.arrayContaining(["python", "sql", "docker"]));
    expect(body.ranking[1].missing).toEqual(expect.arrayContaining(["python"]));
  });

  it("returns an empty ranking for a job without a description", async () => {
    await importText("alice", "backend", "Python engineer");
    const body = await (await matchRoute.GET(req(), params({ jobId: "beta-dev-bbbb2222" }))).json();
    expect(body).toEqual({ hasDescription: false, ranking: [] });
  });

  it("returns an empty ranking when there are no tags", async () => {
    const body = await (await matchRoute.GET(req(), params({ jobId: "acme-ml-aaaa1111" }))).json();
    expect(body).toEqual({ hasDescription: true, ranking: [] });
  });

  it("returns 404 for an unknown job", async () => {
    expect((await matchRoute.GET(req(), params({ jobId: "ghost" }))).status).toBe(404);
  });
});
