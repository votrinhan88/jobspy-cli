import fs from "fs/promises";
import path from "path";
import type { NextRequest } from "next/server";
import { getActiveProfile, profileDir } from "@/lib/profile";

const CV_NAMES = ["cv.pdf", "cv.md"];

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const dir = profileDir(profile);
  for (const name of CV_NAMES) {
    const filePath = path.join(dir, name);
    try {
      const stat = await fs.stat(filePath);
      return Response.json({ filename: name, size: stat.size });
    } catch {
      continue;
    }
  }

  return Response.json({ filename: null, size: null });
}

export async function POST(request: NextRequest) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 422 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "pdf" && ext !== "md") {
    return Response.json({ error: "Only PDF and Markdown files are accepted" }, { status: 422 });
  }

  const dest = path.join(profileDir(profile), `cv.${ext}`);
  const buf = await file.arrayBuffer();
  await fs.writeFile(dest, Buffer.from(buf));

  return Response.json({ filename: `cv.${ext}`, size: buf.byteLength }, { status: 201 });
}
