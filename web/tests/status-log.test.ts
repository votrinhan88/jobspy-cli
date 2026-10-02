import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDataDir, removeDataDir, seedProfile } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const { appendStatusLog, readStatusLog } = await import("@/lib/status-log");

let dataDir: string;
const logFile = () => path.join(dataDir, "demo", "status_log.jsonl");

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "demo");
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

const a = { job_id: "a", from: "", to: "shortlisted", at: "2026-09-01T00:00:00.000Z" } as const;
const b = { job_id: "a", from: "shortlisted", to: "applied", at: "2026-09-02T00:00:00.000Z" } as const;

describe("status log", () => {
  it("appends one JSON line per entry", async () => {
    await appendStatusLog("demo", a);
    await appendStatusLog("demo", b);
    const lines = (await fs.readFile(logFile(), "utf-8")).split("\n");
    expect(lines).toEqual([JSON.stringify(a), JSON.stringify(b), ""]);
  });

  it("reads entries in order", async () => {
    await appendStatusLog("demo", a);
    await appendStatusLog("demo", b);
    expect(await readStatusLog("demo")).toEqual([a, b]);
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
