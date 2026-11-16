import type { NextRequest } from "next/server";
import { deleteAnalyses, renameAnalyses } from "@/lib/analysis-store";
import { getActiveProfile } from "@/lib/profile";
import {
  deleteResume,
  listResumes,
  readResumeText,
  renameResume,
} from "@/lib/resumes/library";
import { isValidTag } from "@/lib/tag";
import { renameSubmittedTag } from "@/lib/submitted";

type Context = { params: Promise<{ tag: string }> };

const NO_RESUME = { error: "Resume not found" };
const INVALID_TAG = { error: "Pick a valid resume tag." };

export async function GET(_request: NextRequest, { params }: Context) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const { tag } = await params;
  const meta = (await listResumes(profile)).find((item) => item.tag === tag);
  if (!meta) {
    return Response.json(NO_RESUME, { status: 404 });
  }
  const text = await readResumeText(profile, tag);
  return Response.json({ meta, text });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { tag?: unknown } | null;
  const to = body?.tag;
  if (typeof to !== "string" || !isValidTag(to)) {
    return Response.json(INVALID_TAG, { status: 400 });
  }

  const { tag: from } = await params;
  const result = await renameResume(profile, from, to);
  if (!result.ok) {
    if (result.reason === "not_found") return Response.json(NO_RESUME, { status: 404 });
    if (result.reason === "exists") {
      return Response.json({ error: "A resume with this tag already exists." }, { status: 409 });
    }
    return Response.json(INVALID_TAG, { status: 400 });
  }

  await renameAnalyses(profile, from, to);
  await renameSubmittedTag(profile, from, to);
  return Response.json({ tag: to });
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const { tag } = await params;
  const result = await deleteResume(profile, tag);
  if (!result.ok) {
    return Response.json(NO_RESUME, { status: 404 });
  }

  await deleteAnalyses(profile, tag);
  return Response.json({ ok: true });
}
