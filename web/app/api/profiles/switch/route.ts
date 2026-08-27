import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { listProfiles } from "@/lib/profile";

const PROFILE_COOKIE = "active_profile";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name: string = body.name ?? "";

  const profiles = await listProfiles();
  if (!profiles.includes(name)) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set(PROFILE_COOKIE, name, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  });

  return Response.json({ name });
}
