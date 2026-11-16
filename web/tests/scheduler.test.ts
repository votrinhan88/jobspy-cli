import { describe, it, expect, vi, beforeEach } from "vitest";

const { stop, schedule, validate, startScrape, listProfiles, readConfig } = vi.hoisted(() => {
  const stop = vi.fn();
  return {
    stop,
    schedule: vi.fn(() => ({ stop })),
    validate: vi.fn(),
    startScrape: vi.fn(),
    listProfiles: vi.fn(),
    readConfig: vi.fn(),
  };
});

vi.mock("node-cron", () => ({ default: { schedule, validate } }));
vi.mock("@/lib/scrape-runner", () => ({ startScrape }));
vi.mock("@/lib/profile", () => ({ listProfiles }));
vi.mock("@/lib/config", () => ({ readConfig }));

import {
  registerSchedule,
  unregisterSchedule,
  getRegisteredProfiles,
  registerAllSchedules,
  isValidSchedule,
} from "@/lib/scheduler";

type Tick = () => Promise<void>;
const lastTick = (): Tick => (schedule.mock.calls.at(-1) as unknown as [string, Tick])[1];

beforeEach(() => {
  getRegisteredProfiles().forEach(unregisterSchedule);
  vi.clearAllMocks();
  startScrape.mockResolvedValue({ started: true });
});

describe("isValidSchedule", () => {
  it("delegates to node-cron validate", () => {
    validate.mockReturnValue(false);
    expect(isValidSchedule("nope")).toBe(false);
    expect(validate).toHaveBeenCalledWith("nope");
  });
});

describe("registerSchedule", () => {
  it("creates a cron task for the profile", () => {
    registerSchedule("alice", "0 8 * * *");
    expect(schedule).toHaveBeenCalledWith("0 8 * * *", expect.any(Function));
    expect(getRegisteredProfiles()).toEqual(["alice"]);
  });

  it("runs a scrape for the profile when the task fires", async () => {
    registerSchedule("alice", "0 8 * * *");
    await lastTick()();
    expect(startScrape).toHaveBeenCalledWith("alice");
  });

  it("does not throw when a scheduled scrape is skipped", async () => {
    startScrape.mockResolvedValue({ started: false, reason: "already_running" });
    registerSchedule("alice", "0 8 * * *");
    await expect(lastTick()()).resolves.toBeUndefined();
  });

  it("logs a short message when a scheduled scrape has no keywords", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    startScrape.mockResolvedValue({ started: false, reason: "no_keywords" });
    registerSchedule("alice", "0 8 * * *");
    await lastTick()();
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toMatch(/no keywords/i);
    log.mockRestore();
  });

  it("does not throw when a scheduled scrape fails to start", async () => {
    startScrape.mockRejectedValue(new Error("boom"));
    registerSchedule("alice", "0 8 * * *");
    await expect(lastTick()()).resolves.toBeUndefined();
  });

  it("stops the old task before it registers a new one for the same profile", () => {
    registerSchedule("alice", "0 8 * * *");
    registerSchedule("alice", "0 0 * * *");
    expect(stop).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(getRegisteredProfiles()).toEqual(["alice"]);
  });

  it("removes the task when the expression is null", () => {
    registerSchedule("alice", "0 8 * * *");
    registerSchedule("alice", null);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(getRegisteredProfiles()).toEqual([]);
  });

  it("keeps separate tasks per profile", () => {
    registerSchedule("alice", "0 8 * * *");
    registerSchedule("bob", "0 0 * * *");
    expect(getRegisteredProfiles().sort()).toEqual(["alice", "bob"]);
  });
});

describe("unregisterSchedule", () => {
  it("is a no-op for an unknown profile", () => {
    expect(() => unregisterSchedule("ghost")).not.toThrow();
    expect(stop).not.toHaveBeenCalled();
  });
});

describe("registerAllSchedules", () => {
  it("registers only profiles that have a schedule", async () => {
    listProfiles.mockResolvedValue(["alice", "bob"]);
    readConfig.mockImplementation(async (p: string) => ({
      schedule: p === "alice" ? "0 8 * * *" : null,
    }));
    validate.mockReturnValue(true);
    await registerAllSchedules();
    expect(getRegisteredProfiles()).toEqual(["alice"]);
  });

  it("skips a profile with an invalid saved expression", async () => {
    listProfiles.mockResolvedValue(["alice"]);
    readConfig.mockResolvedValue({ schedule: "garbage" });
    validate.mockReturnValue(false);
    await registerAllSchedules();
    expect(getRegisteredProfiles()).toEqual([]);
  });
});
