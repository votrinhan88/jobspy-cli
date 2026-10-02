import fs from "fs/promises";
import os from "os";
import path from "path";

export interface CookieSetCall {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

const values = new Map<string, string>();
export const cookieSetCalls: CookieSetCall[] = [];

const store = {
  get(name: string) {
    const value = values.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set(name: string, value: string, options?: Record<string, unknown>) {
    values.set(name, value);
    cookieSetCalls.push({ name, value, options });
  },
  delete(name: string) {
    values.delete(name);
  },
  has(name: string) {
    return values.has(name);
  },
};

export const headersMock = {
  cookies: async () => store,
};

export function setCookies(initial: Record<string, string> = {}): void {
  values.clear();
  cookieSetCalls.length = 0;
  for (const [k, v] of Object.entries(initial)) values.set(k, v);
}

export function getCookie(name: string): string | undefined {
  return values.get(name);
}

export async function makeDataDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jobspy-test-"));
  process.env.JOBSPY_DATA_DIR = dir;
  return dir;
}

export async function removeDataDir(dir: string): Promise<void> {
  delete process.env.JOBSPY_DATA_DIR;
  await fs.rm(dir, { recursive: true, force: true });
}

export async function seedProfile(
  dataDir: string,
  name: string,
  files: Record<string, string> = {}
): Promise<string> {
  const dir = path.join(dataDir, name);
  await fs.mkdir(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, file), content, "utf-8");
  }
  return dir;
}

export const JOBS_HEADER =
  "job_id,title,company,location,is_remote,date_posted,job_url,status,status_updated_at";

export function jobsCsv(rows: string[]): string {
  return [JOBS_HEADER, ...rows].join("\n") + "\n";
}

export function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}
