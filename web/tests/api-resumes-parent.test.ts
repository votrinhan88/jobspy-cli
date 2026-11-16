import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { importText, listResumes } from "@/lib/resumes/library";
import { makeDataDir, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const collection = await import("@/app/api/resumes/route");

let dataDir: string;

const upload = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return collection.POST(new Request("http://localhost/test", { method: "POST", body: data }) as NextRequest);
};

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice");
  setCookies({ active_profile: "alice" });
  await importText("alice", "base", "Jane");
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

describe("POST /api/resumes with a parent", () => {
  it("stores the parent of a fork", async () => {
    expect((await upload({ tag: "fork", text: "Jane 2", parent: "base" })).status).toBe(200);
    expect((await listResumes("alice")).find((r) => r.tag === "fork")?.parent).toBe("base");
  });

  it("saves a resume with an unknown parent as a root", async () => {
    expect((await upload({ tag: "fork", text: "Jane 2", parent: "ghost" })).status).toBe(200);
    expect((await listResumes("alice")).find((r) => r.tag === "fork")?.parent).toBeUndefined();
  });
});
