import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { readAnalysis } from "@/lib/analysis-store";
import { importText, listResumes } from "@/lib/resumes/library";
import { hashText } from "@/lib/hash";
import { makeDataDir, params, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const route = await import("@/app/api/jobs/[jobId]/analysis/route");

const CSV = [
  "job_id,title,company,location,description,job_url,status,status_updated_at",
  "acme-ml-aaaa1111,ML Engineer,Acme,Paris,Build Python models.,https://x.io/1,,",
  "beta-dev-bbbb2222,Developer,Beta,Rome,,https://x.io/2,,",
].join("\n");

const analysis = {
  score: 64,
  summary: "Decent fit.",
  strengths: ["Python"],
  requirements: [{ requirement: "Python", evidence: "Python", verdict: "strong", reasoning: "Named." }],
  gaps: [{ gap: "No Docker", fix: "Add a Docker line." }],
  rewrites: [],
};

const RESUME_TEXT = "Jane Doe. Python and SQL engineer.";

const fetchMock = vi.fn();
let dataDir: string;

const get = (jobId: string, tag?: string) =>
  route.GET(
    new Request(`http://localhost/test${tag === undefined ? "" : `?tag=${encodeURIComponent(tag)}`}`) as NextRequest,
    params({ jobId })
  );

const post = (jobId: string, body: unknown) =>
  route.POST(
    new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as NextRequest,
    params({ jobId })
  );

function apiReply(text: string) {
  return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }] }) };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-secret-999");
  vi.stubEnv("ANTHROPIC_MODEL", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(apiReply(JSON.stringify(analysis)));
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice", { "jobs.csv": CSV });
  await importText("alice", "backend", RESUME_TEXT);
  setCookies({ active_profile: "alice" });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await removeDataDir(dataDir);
});

describe("GET /api/jobs/[jobId]/analysis", () => {
  it("reports availability, the size to send, and no saved result", async () => {
    const body = await (await get("acme-ml-aaaa1111", "backend")).json();
    expect(body.available).toBe(true);
    expect(body.saved).toBeNull();
    expect(body.stale).toBe(false);
    expect(body.sendChars).toBeGreaterThan(RESUME_TEXT.length);
  });

  it("reports the feature as unavailable without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await (await get("acme-ml-aaaa1111", "backend")).json()).available).toBe(false);
  });

  it("returns the saved result", async () => {
    await post("acme-ml-aaaa1111", { tag: "backend" });
    const body = await (await get("acme-ml-aaaa1111", "backend")).json();
    expect(body.saved.analysis).toEqual(analysis);
    expect(body.saved.tag).toBe("backend");
    expect(body.stale).toBe(false);
  });

  it("marks a saved result as stale when the resume text changes", async () => {
    await post("acme-ml-aaaa1111", { tag: "backend" });
    await importText("alice", "backend", "A different resume about Rust.");
    const body = await (await get("acme-ml-aaaa1111", "backend")).json();
    expect(body.saved).not.toBeNull();
    expect(body.stale).toBe(true);
  });

  it("marks a saved result as stale when the job description changes", async () => {
    await post("acme-ml-aaaa1111", { tag: "backend" });
    const csv = CSV.replace("Build Python models.", "Build Rust services.");
    await fs.writeFile(path.join(dataDir, "alice", "jobs.csv"), csv);
    expect((await (await get("acme-ml-aaaa1111", "backend")).json()).stale).toBe(true);
  });

  it("keeps a saved result fresh when the same resume text is imported again", async () => {
    await post("acme-ml-aaaa1111", { tag: "backend" });
    await importText("alice", "backend", RESUME_TEXT);
    expect((await (await get("acme-ml-aaaa1111", "backend")).json()).stale).toBe(false);
  });

  it("returns 400 without a tag and 404 for an unknown tag or job", async () => {
    expect((await get("acme-ml-aaaa1111")).status).toBe(400);
    expect((await get("acme-ml-aaaa1111", "ghost")).status).toBe(404);
    expect((await get("ghost", "backend")).status).toBe(404);
  });

  it("returns 400 for a tag that is not valid", async () => {
    expect((await get("acme-ml-aaaa1111", "../x")).status).toBe(400);
  });
});

describe("POST /api/jobs/[jobId]/analysis", () => {
  it("runs the analysis, saves it and returns it", async () => {
    const res = await post("acme-ml-aaaa1111", { tag: "backend" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis).toEqual(analysis);
    expect(body.tag).toBe("backend");
    expect(body.model).toBe("claude-haiku-5-5");
    expect(typeof body.created_at).toBe("string");
    const [meta] = await listResumes("alice");
    expect(body.resume_version).toBe(meta.version);
    expect(body.resume_hash).toBe(meta.textHash);
    expect(body.job_hash).toBe(hashText("Build Python models."));
    expect((await readAnalysis("alice", "acme-ml-aaaa1111", "backend"))?.analysis).toEqual(analysis);
  });

  it("sends the job text and the whole resume to the API", async () => {
    await post("acme-ml-aaaa1111", { tag: "backend" });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages[0].content).toContain("Build Python models.");
    expect(sent.messages[0].content).toContain(RESUME_TEXT);
  });

  it("uses ANTHROPIC_MODEL when set", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-5-5");
    const body = await (await post("acme-ml-aaaa1111", { tag: "backend" })).json();
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("claude-sonnet-5-5");
  });

  it("replaces an older result on a re-run", async () => {
    await post("acme-ml-aaaa1111", { tag: "backend" });
    fetchMock.mockResolvedValue(apiReply(JSON.stringify({ ...analysis, score: 11 })));
    await post("acme-ml-aaaa1111", { tag: "backend" });
    expect((await readAnalysis("alice", "acme-ml-aaaa1111", "backend"))?.analysis.score).toBe(11);
  });

  it("returns 503 and makes no call without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await post("acme-ml-aaaa1111", { tag: "backend" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/ANTHROPIC_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 422 for a job without a description", async () => {
    const res = await post("beta-dev-bbbb2222", { tag: "backend" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/description/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown job or tag and 400 for a missing tag", async () => {
    expect((await post("ghost", { tag: "backend" })).status).toBe(404);
    expect((await post("acme-ml-aaaa1111", { tag: "ghost" })).status).toBe(404);
    expect((await post("acme-ml-aaaa1111", {})).status).toBe(400);
    expect((await post("acme-ml-aaaa1111", { tag: "../x" })).status).toBe(400);
  });

  it("returns 502 with the API error and saves nothing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: "invalid x-api-key" } }) });
    const res = await post("acme-ml-aaaa1111", { tag: "backend" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("invalid x-api-key");
    expect(await readAnalysis("alice", "acme-ml-aaaa1111", "backend")).toBeNull();
  });

  it("never returns the API key", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) });
    const text = await (await post("acme-ml-aaaa1111", { tag: "backend" })).text();
    expect(text).not.toContain("sk-test-secret-999");
  });
});
