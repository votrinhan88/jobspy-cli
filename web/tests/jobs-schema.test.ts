import fs from "fs/promises";
import path from "path";
import { describe, expect, it } from "vitest";
import { missingJobColumns, REQUIRED_JOB_COLUMNS } from "@/lib/jobs-schema";
import type { Job } from "@/lib/csv";

const JOB_ROW: Job = {
  job_url: "",
  title: "",
  company: "",
  location: "",
  date_posted: "",
  interval: "",
  min_amount: "",
  max_amount: "",
  currency: "",
  is_remote: "",
  id: "",
  site: "",
  job_url_direct: "",
  job_type: "",
  salary_source: "",
  job_level: "",
  job_function: "",
  listing_type: "",
  emails: "",
  description: "",
  company_industry: "",
  company_url: "",
  company_num_employees: "",
  company_revenue: "",
  job_id: "",
  status: "",
  status_updated_at: "",
  region: "",
  role_key: "",
  duplicate_of: "",
  first_seen_at: "",
  last_seen_at: "",
  closed_at: "",
  closed_reason: "",
  country: "",
  city: "",
  work_mode: "",
  seniority: "",
  employment_type: "",
};

async function readSchema(): Promise<{ required: string[]; "x-columns": string[] }> {
  const raw = await fs.readFile(path.join(__dirname, "..", "..", "schema", "jobs.json"), "utf-8");
  return JSON.parse(raw);
}

describe("jobs.csv schema", () => {
  it("reader required columns match the schema", async () => {
    const schema = await readSchema();
    expect([...REQUIRED_JOB_COLUMNS]).toEqual(schema.required);
  });

  it("Job fields match the schema columns in order", async () => {
    const schema = await readSchema();
    expect(Object.keys(JOB_ROW)).toEqual(schema["x-columns"]);
  });

  it("reports the columns a header misses", () => {
    expect(missingJobColumns(["job_id", "title"])).toEqual(["company", "location"]);
    expect(missingJobColumns(["job_id", "title", "company", "location", "extra"])).toEqual([]);
  });
});
