import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  cookieSetCalls,
  jsonRequest,
  makeDataDir,
  params,
  removeDataDir,
  seedProfile,
  setCookies,
} from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const { registerSchedule, unregisterSchedule } = vi.hoisted(() => ({
  registerSchedule: vi.fn(),
  unregisterSchedule: vi.fn(),
}));
vi.mock("@/lib/scheduler", () => ({ registerSchedule, unregisterSchedule }));

const { PATCH, DELETE } = await import("@/app/api/profiles/[name]/route");

let dataDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  dataDir = await makeDataDir();
  setCookies();
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

function rename(oldName: string, newName: string) {
  return PATCH(jsonRequest("PATCH", { name: newName }) as NextRequest, params({ name: oldName }));
}

function remove(name: string) {
  return DELETE(new Request("http://localhost/test") as NextRequest, params({ name }));
}

describe("DELETE /api/profiles/[name] scheduler cleanup", () => {
  it("unregisters the schedule of the deleted profile", async () => {
    await seedProfile(dataDir, "alpha", { "scrape_config.json": '{"schedule":"0 8 * * *"}' });
    const res = await remove("alpha");
    expect(res.status).toBe(200);
    expect(unregisterSchedule).toHaveBeenCalledWith("alpha");
  });

  it("does not touch the scheduler when the profile does not exist", async () => {
    const res = await remove("ghost");
    expect(res.status).toBe(404);
    expect(unregisterSchedule).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/profiles/[name] cookie", () => {
  it("sets the next active profile cookie with the shared cookie options", async () => {
    await seedProfile(dataDir, "alpha");
    await seedProfile(dataDir, "beta");
    setCookies({ active_profile: "alpha" });
    await remove("alpha");
    expect(cookieSetCalls.at(-1)).toMatchObject({
      name: "active_profile",
      value: "beta",
      options: { httpOnly: true, path: "/", sameSite: "lax" },
    });
  });
});

describe("PATCH /api/profiles/[name] scheduler re-keying", () => {
  it("unregisters the old name and registers the saved schedule under the new name", async () => {
    await seedProfile(dataDir, "alpha", { "scrape_config.json": '{"schedule":"0 8 * * *"}' });
    const res = await rename("alpha", "beta");
    expect(res.status).toBe(200);
    expect(unregisterSchedule).toHaveBeenCalledWith("alpha");
    expect(registerSchedule).toHaveBeenCalledWith("beta", "0 8 * * *");
  });

  it("registers null under the new name when the profile has no schedule", async () => {
    await seedProfile(dataDir, "alpha", { "scrape_config.json": '{"job":["dev"]}' });
    await rename("alpha", "beta");
    expect(unregisterSchedule).toHaveBeenCalledWith("alpha");
    expect(registerSchedule).toHaveBeenCalledWith("beta", null);
  });

  it("does not touch the scheduler when the new name already exists", async () => {
    await seedProfile(dataDir, "alpha");
    await seedProfile(dataDir, "beta");
    const res = await rename("alpha", "beta");
    expect(res.status).toBe(409);
    expect(unregisterSchedule).not.toHaveBeenCalled();
    expect(registerSchedule).not.toHaveBeenCalled();
  });

  it("does not touch the scheduler when the name does not change", async () => {
    await seedProfile(dataDir, "alpha");
    await rename("alpha", "alpha");
    expect(unregisterSchedule).not.toHaveBeenCalled();
    expect(registerSchedule).not.toHaveBeenCalled();
  });
});
