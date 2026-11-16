import fs from "fs/promises";
import type { NextRequest } from "next/server";
import { getActiveProfile, keywordsPath } from "@/lib/profile";

function clean(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter(Boolean);
}

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  try {
    const text = await fs.readFile(keywordsPath(profile), "utf-8");
    return Response.json({ keywords: clean(text.split(/\r?\n/)) });
  } catch {
    return Response.json({ error: "No saved job titles for this profile" }, { status: 404 });
  }
}

export async function PUT(request: NextRequest) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be valid JSON" }, { status: 400 });
  }
  const list = (body as { keywords?: unknown } | null)?.keywords;
  if (!Array.isArray(list) || !list.every((item) => typeof item === "string")) {
    return Response.json({ error: "keywords must be a list of strings" }, { status: 400 });
  }
  const keywords = clean(list);
  await fs.writeFile(keywordsPath(profile), keywords.map((k) => `${k}\n`).join(""), "utf-8");
  return Response.json({ keywords });
}
