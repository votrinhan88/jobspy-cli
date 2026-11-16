import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { makeDataDir, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const route = await import("@/app/api/resume-convert/route");

const fetchMock = vi.fn();
let dataDir: string;

const post = (body: unknown) =>
  route.POST(
    new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as NextRequest
  );

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-secret-999");
  vi.stubEnv("ANTHROPIC_MODEL", "");
  vi.stubEnv("LLM_BASE_URL", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(Response.json({ content: [{ type: "text", text: "# Jane\n\n## Skills" }] }));
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice", {});
  setCookies({ active_profile: "alice" });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await removeDataDir(dataDir);
});

describe("GET /api/resume-convert", () => {
  it("reports whether a model is set up", async () => {
    expect((await (await route.GET()).json()).available).toBe(true);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await (await route.GET()).json()).available).toBe(false);
  });
});

describe("POST /api/resume-convert", () => {
  it("returns the converted text", async () => {
    const res = await post({ text: "Jane\nSkills" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "# Jane\n\n## Skills" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing or empty text without calling the model", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ text: "  " })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 when no model is set up", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await post({ text: "x" })).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 502 with the model error and never shows the key", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: "bad key sk-test-secret-999" } }, { status: 401 }));
    const res = await post({ text: "x" });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("sk-test-secret-999");
  });

  it("answers 400 without an active profile", async () => {
    setCookies({});
    await removeDataDir(dataDir);
    dataDir = await makeDataDir();
    expect((await post({ text: "x" })).status).toBe(400);
  });
});
