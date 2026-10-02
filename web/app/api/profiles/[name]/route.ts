import fs from "fs/promises";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  listProfiles,
  profileDir,
  getActiveProfile,
  isValidProfileName,
  PROFILE_COOKIE,
  PROFILE_COOKIE_OPTIONS,
} from "@/lib/profile";

const INVALID_NAME = "Profile name must be 1-64 characters: letters, digits, hyphens, underscores";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name: oldName } = await params;
  let newName: unknown;
  try {
    newName = (await request.json())?.name;
  } catch {
    newName = undefined;
  }

  if (!isValidProfileName(oldName) || typeof newName !== "string" || !isValidProfileName(newName)) {
    return Response.json({ error: INVALID_NAME }, { status: 422 });
  }

  const profiles = await listProfiles();
  if (!profiles.includes(oldName)) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  if (newName === oldName) {
    return Response.json({ name: oldName, active: await getActiveProfile() });
  }

  if (await pathExists(profileDir(newName))) {
    return Response.json({ error: "Profile already exists" }, { status: 409 });
  }

  await fs.rename(profileDir(oldName), profileDir(newName));

  const cookieStore = await cookies();
  if (cookieStore.get(PROFILE_COOKIE)?.value === oldName) {
    cookieStore.set(PROFILE_COOKIE, newName, PROFILE_COOKIE_OPTIONS);
  }

  return Response.json({ name: newName, active: await getActiveProfile() });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

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
