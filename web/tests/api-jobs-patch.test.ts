import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { jsonRequest, makeDataDir, params, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const { PATCH } = await import("@/app/api/jobs/[jobId]/route");
const { readJobs, writeJobs } = await import("@/lib/csv");
const { readStatusLog } = await import("@/lib/status-log");
const { STATUSES } = await import("@/lib/status");

let dataDir: string;
let csvFile: string;

const ROWS = [
  {
    job_id: "a-1",
    title: "Data Scientist",
    company: "Acme, Inc.",
    location: "Hanoi, Vietnam",
    description: 'multi\nline "text"',
    is_remote: "False",
    status: "",
    status_updated_at: "",
  },
  {
    job_id: "b-2",
    title: "ML Engineer",
    company: "Beta",
    location: "Sydney",
    description: "",
    is_remote: "True",
    status: "applied",
    status_updated_at: "2026-09-01T10:00:00.000Z",
  },
  {
    job_id: "c-3",
    title: "AI Engineer",
    company: "Gamma",
    location: "Perth",
    description: "",
    is_remote: "False",
    status: "rejected",
    status_updated_at: "2026-09-02T10:00:00.000Z",
  },
];

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "demo");
  csvFile = path.join(dataDir, "demo", "jobs.csv");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await writeJobs(csvFile, ROWS as any);
  setCookies({ active_profile: "demo" });
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

function patch(jobId: string, body: unknown) {
  return PATCH(jsonRequest("PATCH", body) as NextRequest, params({ jobId }));
}

describe("PATCH /api/jobs/[jobId]", () => {
  it("accepts every ordered pair of statuses, including from and to the empty status (8 by 8)", async () => {
    let pairs = 0;
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect((await patch("a-1", { status: from })).status).toBe(200);
        const res = await patch("a-1", { status: to });
        expect(res.status).toBe(200);
        expect((await res.json()).status).toBe(to);
        pairs++;
      }
    }
    expect(pairs).toBe(STATUSES.length * STATUSES.length);
  }, 30000);

  it("sets the status to empty and updates the timestamp", async () => {
    const before = Date.now();
    const res = await patch("b-2", { status: "" });
    expect(res.status).toBe(200);
    const row = (await readJobs(csvFile)).find((j) => j.job_id === "b-2")!;
    expect(row.status).toBe("");
    expect(Date.parse(row.status_updated_at)).toBeGreaterThanOrEqual(before - 1000);
  });

  it("stores a valid status_updated_at from the request (undo)", async () => {
    const res = await patch("c-3", { status: "applied", status_updated_at: "2026-08-15T09:30:00.000Z" });
    expect(res.status).toBe(200);
    const row = (await readJobs(csvFile)).find((j) => j.job_id === "c-3")!;
    expect(row).toMatchObject({ status: "applied", status_updated_at: "2026-08-15T09:30:00.000Z" });
  });

  it("accepts an empty status_updated_at so undo can restore a new job", async () => {
    await patch("a-1", { status: "shortlisted" });
    const res = await patch("a-1", { status: "", status_updated_at: "" });
    expect(res.status).toBe(200);
    const row = (await readJobs(csvFile)).find((j) => j.job_id === "a-1")!;
    expect(row).toMatchObject({ status: "", status_updated_at: "" });
  });

  it("returns 422 for an invalid status_updated_at", async () => {
    for (const bad of ["yesterday", "2026-13-45T00:00:00Z", "2026-09-01", 12345, null]) {
      const res = await patch("b-2", { status: "offer", status_updated_at: bad });
      expect(res.status).toBe(422);
    }
    expect((await readJobs(csvFile)).find((j) => j.job_id === "b-2")!.status).toBe("applied");
  });

  it("returns 422 for an unknown status", async () => {
    for (const bad of ["hired", "Applied", undefined, null, 3]) {
      expect((await patch("a-1", { status: bad })).status).toBe(422);
    }
  });

  it("returns 404 for an unknown job", async () => {
    expect((await patch("zzz", { status: "applied" })).status).toBe(404);
    expect(await readStatusLog("demo")).toEqual([]);
  });

  it("returns 400 when there is no active profile", async () => {
    await fs.rm(path.join(dataDir, "demo"), { recursive: true, force: true });
    setCookies();
    expect((await patch("a-1", { status: "applied" })).status).toBe(400);
  });

  it("keeps other columns and the row order", async () => {
    await patch("b-2", { status: "interview" });
    const rows = await readJobs(csvFile);
    expect(rows.map((j) => j.job_id)).toEqual(["a-1", "b-2", "c-3"]);
    expect(rows[0]).toEqual(ROWS[0]);
    expect(rows[2]).toEqual(ROWS[2]);
    const { status, status_updated_at, ...rest } = rows[1];
    const { status: _s, status_updated_at: _t, ...expectedRest } = ROWS[1];
    expect(status).toBe("interview");
    expect(status_updated_at).not.toBe(ROWS[1].status_updated_at);
    expect(rest).toEqual(expectedRest);
    void _s;
    void _t;
  });

  it("appends one status log line per change with job_id, from, to and at", async () => {
    const res = await patch("b-2", { status: "interview" });
    const stored = (await res.json()).status_updated_at;
    expect(await readStatusLog("demo")).toEqual([
      { job_id: "b-2", from: "applied", to: "interview", at: stored },
    ]);
  });

  it("an undo writes no line and rewrites the job's history to end at the restored stage", async () => {
    await patch("b-2", { status: "interview" });
    await patch("b-2", { status: "applied", status_updated_at: "2026-09-01T10:00:00.000Z" });
    expect(await readStatusLog("demo")).toEqual([
      { job_id: "b-2", from: "", to: "applied", at: "2026-09-01T10:00:00.000Z" },
    ]);
  });
});
