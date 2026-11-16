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

export interface PdfTextLine {
  text: string;
  size: number;
  y: number;
}

export function tinyPdf(text: string): Uint8Array<ArrayBuffer> {
  return pdfWithLines([{ text, size: 12, y: 720 }]);
}

export function pdfWithLines(lines: PdfTextLine[]): Uint8Array<ArrayBuffer> {
  const stream = lines.map((l) => `BT /F1 ${l.size} Tf 72 ${l.y} Td (${l.text}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
