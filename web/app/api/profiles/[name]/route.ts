import fs from "fs/promises";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { listProfiles, profileDir, getActiveProfile } from "@/lib/profile";

const PROFILE_COOKIE = "active_profile";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const profiles = await listProfiles();
  if (!profiles.includes(name)) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  const active = await getActiveProfile();
  await fs.rm(profileDir(name), { recursive: true, force: true });

  let newActive: string | null = active;
  if (active === name) {
    const remaining = profiles.filter((p) => p !== name);
    newActive = remaining[0] ?? null;
    const cookieStore = await cookies();
    if (newActive) {
      cookieStore.set(PROFILE_COOKIE, newActive, { httpOnly: true, path: "/" });
    } else {
      cookieStore.delete(PROFILE_COOKIE);
    }
  }

  return Response.json({ name, newActive });
}
