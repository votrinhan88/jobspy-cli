import type { NextRequest } from "next/server";
import { getActiveProfile } from "@/lib/profile";
import { applyRewrite, listResumes, readResumeText, saveResumeText } from "@/lib/resumes/library";

type Context = { params: Promise<{ tag: string }> };

const REASON_TEXT = {
  not_found: "The original line is not in the resume now. Check the current text.",
  ambiguous: "The original line appears more than once. Edit the resume by hand.",
};

export async function POST(request: NextRequest, { params }: Context) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { original?: unknown; suggested?: unknown } | null;
  if (typeof body?.original !== "string" || typeof body.suggested !== "string") {
    return Response.json({ error: "Send the original and the suggested line." }, { status: 400 });
  }

  const { tag } = await params;
  const exists = (await listResumes(profile)).some((item) => item.tag === tag);
  const text = exists ? await readResumeText(profile, tag) : null;
  if (text === null) {
    return Response.json({ error: "Resume not found" }, { status: 404 });
  }

  const replaced = applyRewrite(text, body.original, body.suggested);
  if (!replaced.ok) {
    return Response.json({ error: REASON_TEXT[replaced.reason] }, { status: 409 });
  }
  const saved = await saveResumeText(profile, tag, replaced.text);
  if (!saved.ok) {
    return Response.json({ error: "The resume could not be saved." }, { status: 400 });
  }
  return Response.json({ version: saved.version });
}
