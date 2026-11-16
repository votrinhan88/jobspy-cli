import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDataDir, removeDataDir, seedProfile } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const { applyMove, compactHistory, compactStatusLog, readStatusLog, recordStatusChange } = await import(
  "@/lib/status-log"
);

let dataDir: string;
const logFile = () => path.join(dataDir, "demo", "status_log.jsonl");

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "demo");
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

const t = (day: number) => `2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z`;
const a = { job_id: "a", from: "", to: "shortlisted", at: t(1) } as const;
const b = { job_id: "a", from: "shortlisted", to: "applied", at: t(2) } as const;

async function write(entries: object[]) {
  await fs.writeFile(logFile(), entries.map((e) => JSON.stringify(e) + "\n").join(""), "utf-8");
}

describe("status log", () => {
  it("appends one JSON line per forward move", async () => {
    await recordStatusChange("demo", { job_id: "a", to: "shortlisted", at: t(1) });
    await recordStatusChange("demo", { job_id: "a", to: "applied", at: t(2) });
    const lines = (await fs.readFile(logFile(), "utf-8")).split("\n");
    expect(lines).toEqual([JSON.stringify(a), JSON.stringify(b), ""]);
  });

  it("reads entries in order", async () => {
    await recordStatusChange("demo", { job_id: "a", to: "shortlisted", at: t(1) });
    await recordStatusChange("demo", { job_id: "a", to: "applied", at: t(2) });
    expect(await readStatusLog("demo")).toEqual([a, b]);
  });

  it("writes no line for a backward move, and cuts the steps after the stage it returns to", async () => {
    await recordStatusChange("demo", { job_id: "a", to: "shortlisted", at: t(1) });
    await recordStatusChange("demo", { job_id: "a", to: "applied", at: t(2) });
    await recordStatusChange("demo", { job_id: "a", to: "interview", at: t(3) });
    await recordStatusChange("demo", { job_id: "a", to: "applied", at: t(4) });
    expect(await readStatusLog("demo")).toEqual([a, b]);
  });

  it("drops every step of a job that is reset to Scrape", async () => {
    await recordStatusChange("demo", { job_id: "a", to: "shortlisted", at: t(1) });
    await recordStatusChange("demo", { job_id: "a", to: "applied", at: t(2) });
    await recordStatusChange("demo", { job_id: "a", to: "", at: t(3) });
    expect(await readStatusLog("demo")).toEqual([]);
  });

  it("keeps other jobs' steps when one job moves back", async () => {
    await recordStatusChange("demo", { job_id: "a", to: "shortlisted", at: t(1) });
    await recordStatusChange("demo", { job_id: "z", to: "shortlisted", at: t(1) });
    await recordStatusChange("demo", { job_id: "a", to: "applied", at: t(2) });
    await recordStatusChange("demo", { job_id: "a", to: "shortlisted", at: t(3) });
    const log = await readStatusLog("demo");
    expect(log.map((e) => e.job_id).sort()).toEqual(["a", "z"]);
    expect(log.filter((e) => e.job_id === "a")).toEqual([a]);
  });

  it("records a backward move to a stage the job never reached as one step from Scrape", () => {
    const history = applyMove([{ ...b, from: "shortlisted", to: "applied" }], {
      job_id: "a",
      to: "shortlisted",
      at: t(5),
    });
    expect(history).toEqual([{ job_id: "a", from: "", to: "shortlisted", at: t(5) }]);
    expect(applyMove([], { job_id: "a", to: "offer", at: t(5) })).toEqual([
      { job_id: "a", from: "", to: "offer", at: t(5) },
    ]);
  });

  it("writes nothing when the status is set to the one it already has", async () => {
    await recordStatusChange("demo", { job_id: "a", to: "shortlisted", at: t(1) });
    await recordStatusChange("demo", { job_id: "a", to: "shortlisted", at: t(2) });
    expect(await readStatusLog("demo")).toEqual([a]);
  });

  it("replays an old log into forward steps only", () => {
    const old: Parameters<typeof compactHistory>[0] = [
      { job_id: "a", from: "", to: "shortlisted", at: t(1) },
      { job_id: "a", from: "shortlisted", to: "applied", at: t(2) },
      { job_id: "a", from: "applied", to: "shortlisted", at: t(3) },
    ];
    expect(compactHistory(old)).toEqual([{ job_id: "a", from: "", to: "shortlisted", at: t(1) }]);
  });

  it("compacts a log file in place, keeping each job's forward history", async () => {
    await write([
      { job_id: "a", from: "", to: "shortlisted", at: t(1) },
      { job_id: "z", from: "", to: "rejected", at: t(1) },
      { job_id: "a", from: "shortlisted", to: "applied", at: t(2) },
      { job_id: "a", from: "applied", to: "shortlisted", at: t(3) },
    ]);
    await compactStatusLog("demo");
    expect(await readStatusLog("demo")).toEqual([
      { job_id: "a", from: "", to: "shortlisted", at: t(1) },
      { job_id: "z", from: "", to: "rejected", at: t(1) },
    ]);
  });

  it("skips blank and corrupt lines", async () => {
    await fs.writeFile(
      logFile(),
      [JSON.stringify(a), "", "{not json", "  ", '{"job_id":"x"}', "42", JSON.stringify(b), ""].join("\r\n"),
      "utf-8"
    );
    expect(await readStatusLog("demo")).toEqual([a, b]);
  });

  it("returns an empty list when the file is missing", async () => {
    expect(await readStatusLog("demo")).toEqual([]);
  });
});
