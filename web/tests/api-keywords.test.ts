import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import type { NextRequest } from "next/server";
import { makeDataDir, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const route = await import("@/app/api/keywords/route");

let dataDir: string;

const put = (body: unknown) =>
  route.PUT(
    new Request("http://localhost/test", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }) as NextRequest
  );

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice");
  await seedProfile(dataDir, "bob");
  setCookies({ active_profile: "alice" });
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

describe("/api/keywords", () => {
  it("returns 404 when the profile has no saved list", async () => {
    const res = await route.GET();
    expect(res.status).toBe(404);
  });

  it("saves the titles to the profile folder, one per line", async () => {
    const res = await put({ keywords: [" AI Engineer ", "", "ML Engineer"] });
    expect(res.status).toBe(200);
    expect((await res.json()).keywords).toEqual(["AI Engineer", "ML Engineer"]);
    const text = await fs.readFile(path.join(dataDir, "alice", "keywords.txt"), "utf-8");
    expect(text).toBe("AI Engineer\nML Engineer\n");
  });

  it("loads what the profile saved", async () => {
    await put({ keywords: ["Data Scientist"] });
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ keywords: ["Data Scientist"] });
  });

  it("keeps each profile's list apart", async () => {
    await put({ keywords: ["Alice Role"] });
    setCookies({ active_profile: "bob" });
    expect((await route.GET()).status).toBe(404);
    await put({ keywords: ["Bob Role"] });
    setCookies({ active_profile: "alice" });
    expect(await (await route.GET()).json()).toEqual({ keywords: ["Alice Role"] });
  });

  it("rejects a body that is not a list of strings", async () => {
    expect((await put({ keywords: "AI Engineer" })).status).toBe(400);
    expect((await put({ keywords: [1, 2] })).status).toBe(400);
    expect((await put("not json")).status).toBe(400);
  });

  it("returns 400 without a profile", async () => {
    await removeDataDir(dataDir);
    dataDir = await makeDataDir();
    expect((await route.GET()).status).toBe(400);
    expect((await put({ keywords: ["x"] })).status).toBe(400);
  });
});
