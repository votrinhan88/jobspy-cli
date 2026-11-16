import type { NextRequest } from "next/server";
import { getActiveProfile } from "@/lib/profile";
import { listResumes, readOriginal, readResumeText } from "@/lib/resumes/library";

type Context = { params: Promise<{ tag: string }> };

const NO_RESUME = { error: "Resume not found" };

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
};
const TEXT_TYPE = "text/plain; charset=utf-8";

// Quotes, backslashes, control characters and non-ASCII would break the quoted filename, so they are dropped here
// and the full name travels in filename* instead.
function asciiFileName(fileName: string): string {
  return fileName.replace(/[^\x20-\x7e]|["\\]/g, "");
}

function disposition(fileName: string, download: boolean): string {
  const kind = download ? "attachment" : "inline";
  const encoded = encodeURIComponent(fileName);
  return `${kind}; filename="${asciiFileName(fileName)}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: NextRequest, { params }: Context) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const { tag } = await params;
  const original = await readOriginal(profile, tag);
  if (!original) {
    return Response.json(NO_RESUME, { status: 404 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const edited = (await listResumes(profile)).find((item) => item.tag === tag)?.edited;
  const text = edited ? await readResumeText(profile, tag) : null;
  if (text !== null) {
    return new Response(text, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": disposition(`${tag}.md`, download),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(Buffer.from(original.bytes), {
    headers: {
      "Content-Type": CONTENT_TYPES[original.ext] ?? TEXT_TYPE,
      "Content-Disposition": disposition(`${tag}.${original.ext}`, download),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
