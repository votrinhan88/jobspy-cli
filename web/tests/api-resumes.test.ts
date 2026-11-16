import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { listResumes, importText } from "@/lib/resumes/library";
import { readAnalysis, writeAnalysis } from "@/lib/analysis-store";
import { readSubmitted, writeSubmitted } from "@/lib/submitted";
import { makeDataDir, params, tinyPdf, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const collection = await import("@/app/api/resumes/route");
const item = await import("@/app/api/resumes/[tag]/route");
const file = await import("@/app/api/resumes/[tag]/file/route");

let dataDir: string;

const form = (fields: Record<string, string | File>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const upload = (fields: Record<string, string | File>) =>
  collection.POST(new Request("http://localhost/test", { method: "POST", body: form(fields) }) as NextRequest);
const txt = (name: string, content: string) => new File([content], name, { type: "text/plain" });
const ctx = (tag: string) => params({ tag });
const json = (method: string, body: unknown) =>
  new Request("http://localhost/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;

const stamps = { resume_version: 1, resume_hash: "h", job_hash: "j" };
const analysis = { score: 1, summary: "s", strengths: [], requirements: [], gaps: [], rewrites: [] };

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice");
  setCookies({ active_profile: "alice" });
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

describe("POST /api/resumes", () => {
  it("imports an uploaded file under the tag", async () => {
    const res = await upload({ tag: "backend", file: txt("cv.md", "# Jane\nPython") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tag: "backend", version: 1 });
    expect((await listResumes("alice"))[0]).toMatchObject({ tag: "backend", ext: "md" });
  });

  it("imports pasted text under the tag", async () => {
    const res = await upload({ tag: "pasted", text: "Python and SQL" });
    expect(res.status).toBe(200);
    expect((await listResumes("alice"))[0]).toMatchObject({ tag: "pasted", ext: "txt" });
  });

  it("raises the version when the same tag gets different text", async () => {
    await upload({ tag: "a", text: "one" });
    const res = await upload({ tag: "a", text: "two" });
    expect((await res.json()).version).toBe(2);
  });

  it("returns 400 for a missing or invalid tag and for no file and no text", async () => {
    expect((await upload({ text: "x" })).status).toBe(400);
    expect((await upload({ tag: "Not Valid", text: "x" })).status).toBe(400);
    expect((await upload({ tag: "a" })).status).toBe(400);
  });

  it("returns 415 for an unsupported file type", async () => {
    const res = await upload({ tag: "a", file: txt("cv.docx", "x") });
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/pdf|tex|md|txt/i);
  });

  it("returns 413 for a file that is too large", async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "cv.txt");
    expect((await upload({ tag: "a", file: big })).status).toBe(413);
  });

  it("returns 422 for an empty file and for a pdf that cannot be read", async () => {
    expect((await upload({ tag: "a", file: txt("cv.txt", "  ") })).status).toBe(422);
    expect((await upload({ tag: "a", file: txt("cv.pdf", "not a pdf") })).status).toBe(422);
  });

  it("returns 400 without an active profile", async () => {
    setCookies({});
    await removeDataDir(dataDir);
    dataDir = await makeDataDir();
    expect((await upload({ tag: "a", text: "x" })).status).toBe(400);
  });
});

describe("GET /api/resumes", () => {
  it("lists the resumes", async () => {
    await importText("alice", "b", "x");
    await importText("alice", "a", "x");
    const body = await (await collection.GET()).json();
    expect(body.resumes.map((r: { tag: string }) => r.tag)).toEqual(["a", "b"]);
    expect(body.resumes[0]).toMatchObject({ version: 1, ext: "txt" });
  });

  it("returns an empty list when there are none", async () => {
    expect(await (await collection.GET()).json()).toEqual({ resumes: [] });
  });
});

describe("GET /api/resumes/[tag]", () => {
  it("returns the details and the text", async () => {
    await importText("alice", "backend", "Python and SQL");
    const body = await (await item.GET(new Request("http://localhost/test") as NextRequest, ctx("backend"))).json();
    expect(body.meta).toMatchObject({ tag: "backend", version: 1 });
    expect(body.text).toBe("Python and SQL");
  });

  it("returns 404 for an unknown or invalid tag", async () => {
    const req = new Request("http://localhost/test") as NextRequest;
    expect((await item.GET(req, ctx("ghost"))).status).toBe(404);
    expect((await item.GET(req, ctx("../x"))).status).toBe(404);
  });
});

describe("GET /api/resumes/[tag]/file", () => {
  const get = (tag: string, query = "") =>
    file.GET(new Request(`http://localhost/test${query}`) as NextRequest, ctx(tag));

  it("returns the original bytes inline with the right type", async () => {
    await upload({ tag: "a", file: txt("my cv.md", "# Jane") });
    const res = await get("a");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("# Jane");
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(res.headers.get("content-disposition")).toMatch(/^inline;.*a\.md/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns an attachment when download=1", async () => {
    await upload({ tag: "a", file: txt("cv.txt", "x") });
    const res = await get("a", "?download=1");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("serves a pdf with the pdf type", async () => {
    await upload({ tag: "p", file: new File([tinyPdf("Python engineer")], "cv.pdf", { type: "application/pdf" }) });
    const res = await get("p");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^inline;/);
  });

  it("returns 404 for an unknown tag", async () => {
    expect((await get("ghost")).status).toBe(404);
  });
});

describe("PATCH /api/resumes/[tag]", () => {
  it("renames the resume and carries its analyses and submitted records along", async () => {
    await importText("alice", "old", "text");
    await writeAnalysis("alice", "job-1", "old", { model: "m", created_at: "t", tag: "old", ...stamps, analysis });
    await writeSubmitted("alice", "job-1", { tag: "old", version: 1, textHash: "h" });
    const res = await item.PATCH(json("PATCH", { tag: "new" }), ctx("old"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tag: "new" });
    expect((await listResumes("alice")).map((r) => r.tag)).toEqual(["new"]);
    expect((await readAnalysis("alice", "job-1", "new"))?.tag).toBe("new");
    expect(await readAnalysis("alice", "job-1", "old")).toBeNull();
    expect((await readSubmitted("alice", "job-1"))?.tag).toBe("new");
  });

  it("returns 404, 409 and 400 for the failure cases", async () => {
    await importText("alice", "a", "x");
    await importText("alice", "b", "x");
    expect((await item.PATCH(json("PATCH", { tag: "c" }), ctx("ghost"))).status).toBe(404);
    expect((await item.PATCH(json("PATCH", { tag: "b" }), ctx("a"))).status).toBe(409);
    expect((await item.PATCH(json("PATCH", { tag: "Bad Tag" }), ctx("a"))).status).toBe(400);
    expect((await item.PATCH(json("PATCH", {}), ctx("a"))).status).toBe(400);
  });
});

describe("DELETE /api/resumes/[tag]", () => {
  it("deletes the resume and its analyses", async () => {
    await importText("alice", "gone", "x");
    await writeAnalysis("alice", "job-1", "gone", { model: "m", created_at: "t", tag: "gone", ...stamps, analysis });
    const res = await item.DELETE(new Request("http://localhost/test") as NextRequest, ctx("gone"));
    expect(res.status).toBe(200);
    expect(await listResumes("alice")).toEqual([]);
    expect(await readAnalysis("alice", "job-1", "gone")).toBeNull();
  });

  it("returns 404 for an unknown tag", async () => {
    expect((await item.DELETE(new Request("http://localhost/test") as NextRequest, ctx("ghost"))).status).toBe(404);
  });
});
