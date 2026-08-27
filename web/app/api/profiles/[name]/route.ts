import fs from "fs/promises";
import type { NextRequest } from "next/server";
import { listProfiles, profileDir } from "@/lib/profile";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const profiles = await listProfiles();
  if (!profiles.includes(name)) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }
  await fs.rm(profileDir(name), { recursive: true, force: true });
  return Response.json({ name });
}
