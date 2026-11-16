import type { NextRequest } from "next/server";
import { getActiveProfile } from "@/lib/profile";
import { analysisAvailable, localModelConfig, resolveModel } from "@/lib/analysis";
import { runConversion } from "@/lib/resume-convert";

export async function GET() {
  return Response.json({ available: analysisAvailable() });
}

export async function POST(request: NextRequest) {
  const profile = await getActiveProfile();
  if (!profile) {
    return Response.json({ error: "No active profile" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = body?.text;
  if (typeof text !== "string" || text.trim() === "") {
    return Response.json({ error: "Send the resume text." }, { status: 400 });
  }

  const local = localModelConfig();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (!local && !apiKey) {
    return Response.json({ error: "Set ANTHROPIC_API_KEY or LLM_BASE_URL to convert with a model." }, { status: 503 });
  }

  const result = await runConversion({
    text,
    apiKey: local ? local.apiKey : apiKey,
    model: resolveModel(),
    baseUrl: local?.baseUrl,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }
  return Response.json({ text: result.text });
}
