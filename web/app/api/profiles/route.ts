import type { NextRequest } from "next/server";
import { listProfiles, createProfile, isValidProfileName, getActiveProfile } from "@/lib/profile";

export async function GET() {
  const [profiles, active] = await Promise.all([listProfiles(), getActiveProfile()]);
  return Response.json({ profiles, active });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name: string = body.name ?? "";

  if (!isValidProfileName(name)) {
    return Response.json(
      { error: "Profile name must be 1-64 characters: letters, digits, hyphens, underscores" },
      { status: 422 }
    );
  }

  const existing = await listProfiles();
  if (existing.includes(name)) {
    return Response.json({ error: "Profile already exists" }, { status: 409 });
  }

  await createProfile(name);
  return Response.json({ name }, { status: 201 });
}
