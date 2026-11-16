import { callModel, type FetchLike } from "@/lib/analysis";

const MAX_RESUME_CHARS = 30000;
const MAX_TOKENS = 8000;
const EMPTY_REPLY = "The model sent no text.";

const SYSTEM_PROMPT = [
  "You change the plain text of one resume into Markdown. Reply with the Markdown only.",
  "Do not add, remove, reword or reorder any fact. Keep every word of the resume.",
  "Use only these forms:",
  "# Name on the first line.",
  "One contact line under the name, with the items separated by ' | '.",
  "## for a section heading, such as Work Experience, Projects or Education.",
  "### for the title of one job, project or school. Put a date range at the end after ' :: ', as in '### Engineer, Acme :: Jan 2023 – Present'.",
  "'- ' at the start of each bullet. Join a bullet that wraps onto two lines.",
  "**bold** and *italic* for words that look bold or italic in the source.",
  "A blank line between blocks. No code fences and no comments.",
].join("\n");

export function buildConvertMessages(text: string): { system: string; user: string } {
  return { system: SYSTEM_PROMPT, user: text.slice(0, MAX_RESUME_CHARS) };
}

export function cleanReply(text: string): string {
  const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n?```$/.exec(text.trim());
  return (fenced ? fenced[1] : text).trim();
}

export type ConvertResult = { ok: true; text: string } | { ok: false; error: string };

export async function runConversion({
  text,
  apiKey,
  model,
  baseUrl,
  fetchImpl,
}: {
  text: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<ConvertResult> {
  const reply = await callModel({ ...buildConvertMessages(text), apiKey, model, baseUrl, maxTokens: MAX_TOKENS, fetchImpl });
  if (!reply.ok) return reply;
  const converted = cleanReply(reply.text);
  return converted === "" ? { ok: false, error: EMPTY_REPLY } : { ok: true, text: converted };
}
