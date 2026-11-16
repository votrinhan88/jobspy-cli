import type { NextRequest } from "next/server";
import { getActiveProfile } from "@/lib/profile";
import { importFile, importText, listResumes, type ImportResult } from "@/lib/resumes/library";
import { isValidTag } from "@/lib/tag";

const INVALID_TAG = { error: "Pick a valid resume tag." };
const NO_INPUT = { error: "Send a file or paste text." };

const FAILURES: Record<Exclude<ImportResult, { ok: true }>["reason"], { status: number; error: string }> = {
  invalid_tag: { status: 400, error: "Pick a valid resume tag." },
  unsupported_type: { status: 415, error: "Only PDF, TEX, MD and TXT files are supported." },
  too_large: { status: 413, error: "Files must be 5 MB or smaller." },
  unreadable: { status: 422, error: "Could not read text from this file." },
  empty: { status: 422, error: "The resume has no text to read." },
};

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }
  return Response.json({ resumes: await listResumes(profile) });
}

export async function POST(request: NextRequest) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(NO_INPUT, { status: 400 });
  }

  const tag = form.get("tag");
  if (typeof tag !== "string" || !isValidTag(tag)) {
    return Response.json(INVALID_TAG, { status: 400 });
  }

  const file = form.get("file");
  const text = form.get("text");
  let result: ImportResult;
  if (file instanceof File) {
    result = await importFile(profile, tag, file.name, new Uint8Array(await file.arrayBuffer()));
  } else if (typeof text === "string" && text !== "") {
    result = await importText(profile, tag, text);
  } else {
    return Response.json(NO_INPUT, { status: 400 });
  }

  if (!result.ok) {
    const failure = FAILURES[result.reason];
    return Response.json({ error: failure.error, reason: result.reason }, { status: failure.status });
  }
  return Response.json({ tag: result.tag, version: result.version });
}
