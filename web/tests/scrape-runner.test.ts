// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { spawn, readScrapeStatus, writeScrapeStatus, appendScrapeHistory, readConfig, existsSync } =
  vi.hoisted(() => ({
    spawn: vi.fn(),
    readScrapeStatus: vi.fn(),
    writeScrapeStatus: vi.fn(),
    appendScrapeHistory: vi.fn(),
    readConfig: vi.fn(),
    existsSync: vi.fn(),
  }));

vi.mock("child_process", () => ({ spawn }));
vi.mock("fs", () => ({
  openSync: vi.fn(() => 3),
  closeSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ""),
  existsSync,
}));
vi.mock("@/lib/scrape-status", () => ({
  readScrapeStatus,
  writeScrapeStatus,
  appendScrapeHistory,
}));
vi.mock("@/lib/config", () => ({ readConfig }));
vi.mock("@/lib/profile", () => ({
  profileDir: (p: string) => `/data/${p}`,
  jobsCsvPath: (p: string) => `/custom-data/${p}/jobs.csv`,
  scrapeLogPath: (p: string) => `/data/${p}/scrape.log`,
}));

import { startScrape } from "@/lib/scrape-runner";

const CONFIG = {
  job: ["dev"],
  location: ["Paris"],
  results_wanted: 20,
  site_name: ["linkedin"],
  workers: 4,
  title_exclude: [],
  exclude_companies: [],
  schedule: null,
};

let killSpy: ReturnType<typeof vi.spyOn>;

function fakeChild(pid: number | null = 4242) {
  const on = vi.fn();
  spawn.mockReturnValue({ on, unref: vi.fn(), pid: pid ?? undefined });
  return on;
}

function handler(on: ReturnType<typeof vi.fn>, event: string) {
  return on.mock.calls.find(([name]) => name === event)?.[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  readConfig.mockResolvedValue({ ...CONFIG });
  existsSync.mockReturnValue(true);
  killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
  fakeChild();
});

afterEach(() => {
  killSpy.mockRestore();
});

describe("startScrape", () => {
  it("refuses to start when a scrape is already running", async () => {
    readScrapeStatus.mockResolvedValue({ status: "running", pid: 4242 });
    const result = await startScrape("alice");
    expect(result).toEqual({ started: false, reason: "already_running" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawns the scrape process and marks the status as running", async () => {
    readScrapeStatus.mockResolvedValue({ status: "idle" });
    const result = await startScrape("alice");
    expect(result).toEqual({ started: true });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][1]).toEqual(
      expect.arrayContaining(["main.py", "--job", "dev"])
    );
    expect(writeScrapeStatus).toHaveBeenCalledWith(
      "alice",
      expect.objectContaining({ status: "running" })
    );
  });

  it("saves jobs to the profile jobs.csv path", async () => {
    readScrapeStatus.mockResolvedValue({ status: "idle" });
    await startScrape("alice");
    const args: string[] = spawn.mock.calls[0][1];
    expect(args[args.indexOf("--save_path") + 1]).toBe("/custom-data/alice/jobs.csv");
  });

  it("marks the run as failed when the process cannot start", async () => {
    readScrapeStatus.mockResolvedValueOnce({ status: "idle" });
    const on = fakeChild();
    await startScrape("alice");

    readScrapeStatus.mockResolvedValue({ status: "error" });
    const onError = handler(on, "error");
    expect(onError).toBeTypeOf("function");
    await onError(new Error("spawn uv ENOENT"));

    expect(writeScrapeStatus).toHaveBeenLastCalledWith(
      "alice",
      expect.objectContaining({
        status: "error",
        error: expect.stringContaining("spawn uv ENOENT"),
      })
    );
    expect(appendScrapeHistory).toHaveBeenCalledTimes(1);
  });
});

describe("startScrape process id tracking", () => {
  it("stores the child process id in the status", async () => {
    readScrapeStatus.mockResolvedValue({ status: "idle" });
    fakeChild(777);
    await startScrape("alice");
    expect(writeScrapeStatus).toHaveBeenCalledWith("alice", { pid: 777 });
  });

  it("stores a null process id when the process has none", async () => {
    readScrapeStatus.mockResolvedValue({ status: "idle" });
    fakeChild(null);
    await startScrape("alice");
    expect(writeScrapeStatus).toHaveBeenCalledWith("alice", { pid: null });
  });

  it("checks the stored process id with signal 0", async () => {
    readScrapeStatus.mockResolvedValue({ status: "running", pid: 4242 });
    await startScrape("alice");
    expect(killSpy).toHaveBeenCalledWith(4242, 0);
  });

  it("starts a new run when the recorded process is gone", async () => {
    readScrapeStatus.mockResolvedValue({ status: "running", pid: 4242 });
    killSpy.mockImplementation(() => {
      throw Object.assign(new Error("no such process"), { code: "ESRCH" });
    });
    const result = await startScrape("alice");
    expect(result).toEqual({ started: true });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("treats a process that denies the signal as still alive", async () => {
    readScrapeStatus.mockResolvedValue({ status: "running", pid: 4242 });
    killSpy.mockImplementation(() => {
      throw Object.assign(new Error("not permitted"), { code: "EPERM" });
    });
    const result = await startScrape("alice");
    expect(result).toEqual({ started: false, reason: "already_running" });
  });

  it("starts a new run when a running status has no process id", async () => {
    readScrapeStatus.mockResolvedValue({ status: "running", pid: null });
    const result = await startScrape("alice");
    expect(result).toEqual({ started: true });
    expect(killSpy).not.toHaveBeenCalled();
  });
});

describe("startScrape keyword check", () => {
  it("does not start when the keyword list is empty", async () => {
    readScrapeStatus.mockResolvedValue({ status: "idle" });
    readConfig.mockResolvedValue({ ...CONFIG, job: [] });
    const result = await startScrape("alice");
    expect(result).toEqual({ started: false, reason: "no_keywords" });
    expect(spawn).not.toHaveBeenCalled();
    expect(writeScrapeStatus).not.toHaveBeenCalled();
  });
});

describe("startScrape when the profile folder is gone", () => {
  it("skips the final status write after the process closes", async () => {
    readScrapeStatus.mockResolvedValue({ status: "idle" });
    const on = fakeChild();
    await startScrape("alice");
    writeScrapeStatus.mockClear();
    existsSync.mockReturnValue(false);

    await handler(on, "close")(0);

    expect(writeScrapeStatus).not.toHaveBeenCalled();
    expect(appendScrapeHistory).not.toHaveBeenCalled();
  });

  it("skips the final status write after a spawn error", async () => {
    readScrapeStatus.mockResolvedValue({ status: "idle" });
    const on = fakeChild();
    await startScrape("alice");
    writeScrapeStatus.mockClear();
    existsSync.mockReturnValue(false);

    await handler(on, "error")(new Error("spawn uv ENOENT"));

    expect(writeScrapeStatus).not.toHaveBeenCalled();
    expect(appendScrapeHistory).not.toHaveBeenCalled();
  });

  it("still writes the final status when the folder exists", async () => {
    readScrapeStatus.mockResolvedValue({ status: "idle" });
    const on = fakeChild();
    await startScrape("alice");
    writeScrapeStatus.mockClear();

    await handler(on, "close")(0);

    expect(writeScrapeStatus).toHaveBeenCalledWith(
      "alice",
      expect.objectContaining({ status: "done" })
    );
  });
});
