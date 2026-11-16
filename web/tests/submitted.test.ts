import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { readSubmitted, writeSubmitted } from "@/lib/submitted";
import { importText, listResumes } from "@/lib/resumes/library";
import { makeDataDir, params, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const route = await import("@/app/api/jobs/[jobId]/submitted/route");

const CSV = [
  "job_id,title,company,location,description,job_url,status,status_updated_at",
  "acme-ml-aaaa1111,ML Engineer,Acme,Paris,Build Python models.,https://x.io/1,,",
  "beta-dev-bbbb2222,Developer,Beta,Rome,,https://x.io/2,,",
].join("\n");

let dataDir: string;

const get = (jobId: string) => route.GET(new Request("http://localhost/test") as NextRequest, params({ jobId }));
const put = (jobId: string, body: unknown) =>
  route.PUT(
    new Request("http://localhost/test", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as NextRequest,
    params({ jobId })
  );

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice", { "jobs.csv": CSV });
  await importText("alice", "backend", "Python engineer");
  setCookies({ active_profile: "alice" });
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

describe("submitted store", () => {
  const entry = { tag: "backend", version: 2, textHash: "abc" };

  it("returns null when nothing is saved", async () => {
    expect(await readSubmitted("alice", "job-1")).toBeNull();
  });

  it("saves one entry for each job in data/{profile}/submitted.json", async () => {
    await writeSubmitted("alice", "job-1", entry);
    await writeSubmitted("alice", "job-2", { ...entry, tag: "other" });
    await expect(fs.stat(path.join(dataDir, "alice", "submitted.json"))).resolves.toBeTruthy();
    expect(await readSubmitted("alice", "job-1")).toMatchObject(entry);
    expect((await readSubmitted("alice", "job-2"))?.tag).toBe("other");
    expect((await readSubmitted("alice", "job-1"))?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("replaces an older entry and clears an entry with null", async () => {
    await writeSubmitted("alice", "job-1", entry);
    await writeSubmitted("alice", "job-1", { ...entry, version: 3 });
    expect((await readSubmitted("alice", "job-1"))?.version).toBe(3);
    await writeSubmitted("alice", "job-1", null);
    expect(await readSubmitted("alice", "job-1")).toBeNull();
  });

  it("returns null for a corrupt file", async () => {
    await fs.writeFile(path.join(dataDir, "alice", "submitted.json"), "{not json");
    expect(await readSubmitted("alice", "job-1")).toBeNull();
  });
});

describe("/api/jobs/[jobId]/submitted", () => {
  it("returns no record at first", async () => {
    expect(await (await get("acme-ml-aaaa1111")).json()).toEqual({ submitted: null, changed: false });
  });

  it("records the tag with its current version and hash", async () => {
    const res = await put("acme-ml-aaaa1111", { tag: "backend" });
    expect(res.status).toBe(200);
    const [meta] = await listResumes("alice");
    const body = await (await get("acme-ml-aaaa1111")).json();
    expect(body.submitted).toMatchObject({ tag: "backend", version: meta.version, textHash: meta.textHash });
    expect(body.changed).toBe(false);
  });

  it("reports changed when the resume text changed after the submission", async () => {
    await put("acme-ml-aaaa1111", { tag: "backend" });
    await importText("alice", "backend", "A different resume.");
    expect((await (await get("acme-ml-aaaa1111")).json()).changed).toBe(true);
  });

  it("reports changed when the resume was deleted", async () => {
    await put("acme-ml-aaaa1111", { tag: "backend" });
    const library = await import("@/lib/resumes/library");
    await library.deleteResume("alice", "backend");
    const body = await (await get("acme-ml-aaaa1111")).json();
    expect(body.submitted?.tag).toBe("backend");
    expect(body.changed).toBe(true);
  });

  it("clears the record with a null tag", async () => {
    await put("acme-ml-aaaa1111", { tag: "backend" });
    expect((await put("acme-ml-aaaa1111", { tag: null })).status).toBe(200);
    expect((await (await get("acme-ml-aaaa1111")).json()).submitted).toBeNull();
  });

  it("returns 404 for an unknown job or tag and 400 for a bad body", async () => {
    expect((await get("ghost")).status).toBe(404);
    expect((await put("ghost", { tag: "backend" })).status).toBe(404);
    expect((await put("acme-ml-aaaa1111", { tag: "ghost" })).status).toBe(404);
    expect((await put("acme-ml-aaaa1111", {})).status).toBe(400);
    expect((await put("acme-ml-aaaa1111", { tag: "../x" })).status).toBe(400);
  });
});
