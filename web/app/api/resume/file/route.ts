import fs from "fs/promises";
import { getActiveProfile, cvPath } from "@/lib/profile";

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  for (const ext of ["pdf", "md"] as const) {
    const filePath = cvPath(profile, ext);
    try {
      const bytes = await fs.readFile(filePath);
      const contentType = ext === "pdf" ? "application/pdf" : "text/markdown; charset=utf-8";
      return new Response(bytes, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="cv.${ext}"`,
        },
      });
    } catch { /* try next ext */ }
  }

  return Response.json({ error: "No CV found" }, { status: 404 });
}
