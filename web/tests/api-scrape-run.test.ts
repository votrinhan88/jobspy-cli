// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getActiveProfile, startScrape } = vi.hoisted(() => ({
  getActiveProfile: vi.fn(),
  startScrape: vi.fn(),
}));

vi.mock("@/lib/profile", () => ({ getActiveProfile }));
vi.mock("@/lib/scrape-runner", () => ({ startScrape }));

import { POST } from "@/app/api/scrape/run/route";

beforeEach(() => {
  vi.clearAllMocks();
  getActiveProfile.mockResolvedValue("alice");
});

describe("POST /api/scrape/run", () => {
  it("returns 202 when the scrape starts", async () => {
    startScrape.mockResolvedValue({ started: true });
    const res = await POST();
    expect(res.status).toBe(202);
    expect(startScrape).toHaveBeenCalledWith("alice");
  });

  it("returns 409 when a scrape is already running", async () => {
    startScrape.mockResolvedValue({ started: false, reason: "already_running" });
    const res = await POST();
    expect(res.status).toBe(409);
  });

  it("returns 400 with a keyword message when no keywords are set", async () => {
    startScrape.mockResolvedValue({ started: false, reason: "no_keywords" });
    const res = await POST();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/keyword/i);
  });

  it("returns 400 without an active profile", async () => {
    getActiveProfile.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(400);
    expect(startScrape).not.toHaveBeenCalled();
  });
});
