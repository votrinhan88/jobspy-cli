import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { patchJob, readJobs, writeJobs, type Job } from "@/lib/csv";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "jobspy-csv-"));
  file = path.join(dir, "jobs.csv");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function parse(content: string): Promise<Record<string, string>[]> {
  await fs.writeFile(file, content, "utf-8");
  return readJobs(file);
}

function job(fields: Record<string, string>): Job {
  return fields as unknown as Job;
}

describe("readJobs", () => {
  it("parses a header and simple rows", async () => {
    expect(await parse("a,b\n1,2\n3,4")).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("returns an empty list for a header-only file", async () => {
    expect(await parse("a,b\n")).toEqual([]);
    expect(await parse("a,b")).toEqual([]);
  });

  it("parses a quoted field that contains a comma", async () => {
    expect(await parse('a,b\n"Hanoi, Vietnam",2\n')).toEqual([{ a: "Hanoi, Vietnam", b: "2" }]);
  });

  it("parses a quoted field that contains a newline as one row", async () => {
    expect(await parse('a,b\n"line 1\nline 2",x\n3,y\n')).toEqual([
      { a: "line 1\nline 2", b: "x" },
      { a: "3", b: "y" },
    ]);
  });

  it("parses a quoted field that contains CRLF as one row", async () => {
    expect(await parse('a,b\r\n"line 1\r\nline 2",x\r\n3,y\r\n')).toEqual([
      { a: "line 1\r\nline 2", b: "x" },
      { a: "3", b: "y" },
    ]);
  });

  it("parses escaped quotes", async () => {
    expect(await parse('a,b\n"say ""hi""",""""\n')).toEqual([{ a: 'say "hi"', b: '"' }]);
  });

  it("handles CRLF row ends, a trailing newline and a blank last line", async () => {
    expect(await parse("a,b\r\n1,2\r\n3,4\r\n\r\n")).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
    expect(await parse("a,b\n1,2\n\n")).toEqual([{ a: "1", b: "2" }]);
  });

  it("pads short rows with empty strings", async () => {
    expect(await parse("a,b,c\n1\n2,3\n")).toEqual([
      { a: "1", b: "", c: "" },
      { a: "2", b: "3", c: "" },
    ]);
  });

  it("strips a leading byte-order mark", async () => {
    const rows = await parse("﻿job_id,title\nx-1,Engineer\n");
    expect(rows).toEqual([{ job_id: "x-1", title: "Engineer" }]);
  });

  it("reads a file written by pandas that has a multi-line field (fixture in tests/fixtures/)", async () => {
    const rows = await readJobs(path.join(__dirname, "fixtures", "pandas-multiline.csv"));
    expect(rows).toHaveLength(2);
    expect(rows[0].job_id).toBe("acme-data-scientist-1a2b3c4d");
    expect(rows[0].company).toBe("Acme, Inc.");
    expect(rows[0].description.replace(/\r\n/g, "\n")).toBe('Line one\nLine two with "quotes"\n\nLine four');
    expect(rows[0].status).toBe("applied");
    expect(rows[1]).toMatchObject({ job_id: "beta-ml-engineer-5e6f7a8b", status: "", status_updated_at: "" });
  });
});

describe("writeJobs", () => {
  it("round-trips fields with comma, quote, newline and carriage return through write and read", async () => {
    const jobs = [
      job({ job_id: "a", title: "x, y", company: 'say "hi"', location: "l1\nl2", note: "r1\rr2", other: "c\r\nd" }),
      job({ job_id: "b", title: "", company: "plain", location: " spaced ", note: "", other: "" }),
    ];
    await writeJobs(file, jobs);
    expect(await readJobs(file)).toEqual(jobs);
  });

  it("keeps the union of columns when later rows have extra keys", async () => {
    await writeJobs(file, [job({ job_id: "a", title: "t" }), job({ job_id: "b", extra: "e", title: "u" })]);
    const content = await fs.readFile(file, "utf-8");
    expect(content.split(/\r?\n/)[0]).toBe("job_id,title,extra");
    expect(await readJobs(file)).toEqual([
      { job_id: "a", title: "t", extra: "" },
      { job_id: "b", title: "u", extra: "e" },
    ]);
  });

  it("leaves the file untouched when the job list is empty", async () => {
    await fs.writeFile(file, "keep me", "utf-8");
    await writeJobs(file, []);
    expect(await fs.readFile(file, "utf-8")).toBe("keep me");
  });

  it("leaves no temporary file after a write", async () => {
    await writeJobs(file, [job({ job_id: "a" })]);
    await writeJobs(file, [job({ job_id: "b" })]);
    expect(await fs.readdir(dir)).toEqual(["jobs.csv"]);
  });
});

describe("patchJob", () => {
  it("patchJob changes only the target row and keeps the others equal", async () => {
    const jobs = [
      job({ job_id: "a", title: "A", description: "multi\nline, \"text\"", status: "", status_updated_at: "" }),
      job({ job_id: "b", title: "B", description: "", status: "applied", status_updated_at: "2026-09-01T00:00:00.000Z" }),
      job({ job_id: "c", title: "C", description: "x", status: "", status_updated_at: "" }),
    ];
    await writeJobs(file, jobs);
    const updated = await patchJob(file, "b", { status: "interview", status_updated_at: "2026-09-02T00:00:00.000Z" });
    expect(updated).toMatchObject({ job_id: "b", status: "interview" });
    const after = await readJobs(file);
    expect(after.map((j) => j.job_id)).toEqual(["a", "b", "c"]);
    expect(after[0]).toEqual(jobs[0]);
    expect(after[2]).toEqual(jobs[2]);
    expect(after[1]).toEqual({ ...jobs[1], status: "interview", status_updated_at: "2026-09-02T00:00:00.000Z" });
  });
});
