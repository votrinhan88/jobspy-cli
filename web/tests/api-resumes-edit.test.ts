import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { importText, listResumes, readResumeText } from "@/lib/resumes/library";
import { makeDataDir, params, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const item = await import("@/app/api/resumes/[tag]/route");
const apply = await import("@/app/api/resumes/[tag]/apply/route");
const file = await import("@/app/api/resumes/[tag]/file/route");

let dataDir: string;

const ctx = (tag: string) => params({ tag });
const json = (method: string, body: unknown) =>
  new Request("http://localhost/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice");
  setCookies({ active_profile: "alice" });
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

describe("PUT /api/resumes/[tag]", () => {
  it("saves new text and returns the version", async () => {
    await importText("alice", "a", "old");
    const res = await item.PUT(json("PUT", { text: "new text" }), ctx("a"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 2 });
    expect(await readResumeText("alice", "a")).toBe("new text");
  });

  it("returns 404 for an unknown tag and 400 for empty or missing text", async () => {
    await importText("alice", "a", "old");
    expect((await item.PUT(json("PUT", { text: "x" }), ctx("ghost"))).status).toBe(404);
    expect((await item.PUT(json("PUT", { text: " " }), ctx("a"))).status).toBe(400);
    expect((await item.PUT(json("PUT", {}), ctx("a"))).status).toBe(400);
  });
});

describe("POST /api/resumes/[tag]/apply", () => {
  it("replaces the original line with the suggestion", async () => {
    await importText("alice", "a", "Line one\nDeveloped ML systems.");
    const res = await apply.POST(
      json("POST", { original: "Developed ML systems.", suggested: "Built ML systems." }),
      ctx("a")
    );
    expect(res.status).toBe(200);
    expect(await readResumeText("alice", "a")).toBe("Line one\nBuilt ML systems.");
    expect((await listResumes("alice"))[0].version).toBe(2);
  });

  it("returns 409 and leaves the text when the line is missing or repeated", async () => {
    await importText("alice", "a", "Z\nZ");
    expect((await apply.POST(json("POST", { original: "Q", suggested: "Y" }), ctx("a"))).status).toBe(409);
    expect((await apply.POST(json("POST", { original: "Z", suggested: "Y" }), ctx("a"))).status).toBe(409);
    expect(await readResumeText("alice", "a")).toBe("Z\nZ");
  });

  it("returns 404 for an unknown tag and 400 for a bad body", async () => {
    await importText("alice", "a", "Z");
    expect((await apply.POST(json("POST", { original: "Z", suggested: "Y" }), ctx("ghost"))).status).toBe(404);
    expect((await apply.POST(json("POST", { original: "Z" }), ctx("a"))).status).toBe(400);
  });
});

describe("GET /api/resumes/[tag]/file after an edit", () => {
  it("serves the edited text, not the import", async () => {
    await importText("alice", "a", "old");
    await item.PUT(json("PUT", { text: "edited" }), ctx("a"));
    const res = await file.GET(new Request("http://localhost/test?download=1") as NextRequest, ctx("a"));
    expect(await res.text()).toBe("edited");
  });
});
