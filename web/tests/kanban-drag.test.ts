import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { jsonRequest, makeDataDir, params, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const { PATCH } = await import("@/app/api/jobs/[jobId]/route");
const { readJobs, writeJobs } = await import("@/lib/csv");
const { readStatusLog } = await import("@/lib/status-log");
const { buildSankey, PIPELINE_STAGES } = await import("@/lib/sankey");
const { STATUSES } = await import("@/lib/status");

const JOB_IDS = ["j1", "j2", "j3", "j4", "j5", "j6"];
const RANK: Record<string, number> = {
  "": 0,
  shortlisted: 1,
  applied: 2,
  interview: 3,
  offer: 4,
  accepted: 5,
  rejected: 5,
  skipped: 5,
};

let dataDir: string;
let csvFile: string;

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "demo");
  csvFile = path.join(dataDir, "demo", "jobs.csv");
  await writeJobs(
    csvFile,
    JOB_IDS.map((job_id) => ({
      job_id,
      title: `Role ${job_id}`,
      company: "Acme",
      location: "Hanoi, Vietnam",
      description: "",
      is_remote: "False",
      status: "",
      status_updated_at: "",
    })) as unknown as Parameters<typeof writeJobs>[1]
  );
  setCookies({ active_profile: "demo" });
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

// Mulberry32: a fixed seed keeps the drag sequence the same on every run.
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drop(jobId: string, to: string) {

  return PATCH(jsonRequest("PATCH", { status: to }) as NextRequest, params({ jobId }));
}

async function checkInvariants(step: string) {
  const log = await readStatusLog("demo");
  const jobs = await readJobs(csvFile);

  for (const job of jobs) {
    const steps = log.filter((e) => e.job_id === job.job_id);
    const last = steps.at(-1)?.to ?? "";
    expect(last, `${step}: log and board disagree for ${job.job_id}`).toBe(job.status);
    for (let i = 0; i < steps.length; i++) {
      expect(RANK[steps[i].to], `${step}: backward step saved for ${job.job_id}`).toBeGreaterThanOrEqual(
        RANK[steps[i].from]
      );
      if (i > 0) {
        expect(steps[i].from, `${step}: broken chain for ${job.job_id}`).toBe(steps[i - 1].to);
      }
    }
  }

  const graph = buildSankey(log.map((e) => ({ job_id: e.job_id, from: e.from, to: e.to })));
  for (const stage of PIPELINE_STAGES.filter((s) => s !== "")) {
    const node = graph.nodes.find((n) => n.id === stage);
    if (!node) continue;
    const inflow = graph.links.filter((l) => l.target === stage).reduce((s, l) => s + l.value, 0);
    const outflow = graph.links.filter((l) => l.source === stage).reduce((s, l) => s + l.value, 0);
    expect(inflow, `${step}: ${stage} in ${inflow}, out ${outflow}, pending ${node.pending}`).toBe(
      outflow + node.pending
    );
  }
}

describe("free drag and drop on the board", () => {
  it("keeps the saved log, the board and the flows in agreement across random drops", async () => {
    const random = prng(20260905);
    for (let i = 0; i < 400; i++) {
      const jobId = JOB_IDS[Math.floor(random() * JOB_IDS.length)];
      const to = STATUSES[Math.floor(random() * STATUSES.length)];
      const res = await drop(jobId, to);
      expect(res.status).toBe(200);
      await checkInvariants(`drop ${i} ${jobId} -> "${to}"`);
    }
  }, 120000);
});
