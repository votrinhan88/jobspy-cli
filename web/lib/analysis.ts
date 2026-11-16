export const VERDICTS = ["strong", "partial", "weak", "missing"] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface Requirement {
  requirement: string;
  evidence: string;
  verdict: Verdict;
  reasoning: string;
}

export interface Rewrite {
  original: string;
  suggested: string;
}

export interface Analysis {
  score: number;
  summary: string;
  strengths: string[];
  requirements: Requirement[];
  gaps: { gap: string; fix: string }[];
  rewrites: Rewrite[];
}

export interface JobText {
  title: string;
  company: string;
  description: string;
}

export type AnalysisResult = { ok: true; analysis: Analysis } | { ok: false; error: string };

const DEFAULT_MODEL = "claude-haiku-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_TOKENS = 3000;
const MAX_DESCRIPTION_CHARS = 20000;
const UNREADABLE_REPLY = "The reply could not be read.";

const SYSTEM_PROMPT = [
  "You compare one resume with one job posting and rate the fit.",
  "The resume is plain text. Reply with ONE JSON object and no other text.",
  "The object has these keys:",
  "score: an integer from 0 to 100 for the fit.",
  "summary: one or two short sentences.",
  "strengths: an array of short strings. Each one is a part of the resume that fits the job.",
  "requirements: an array of objects, one for each main requirement of the job. Each object has these keys:",
  "requirement: the requirement, in your own short words.",
  "evidence: a short quote copied from the resume that shows it, or an empty string if the resume does not show it.",
  "verdict: exactly one of strong, partial, weak or missing. strong means the resume clearly shows it. partial means it shows part of it. weak means it only hints at it. missing means the resume does not show it.",
  "reasoning: one short sentence that explains the verdict.",
  "gaps: an array of objects with the keys gap and fix. gap is a need of the job that the resume does not show. fix says which section or line of the resume to change to show it.",
  "rewrites: an array of objects with the keys original and suggested. original is an exact line copied from the resume. suggested is better wording for that line that stays true to the resume.",
  "Use short sentences. Do not invent experience, skills, tools or results. If the resume shows weak or missing evidence, say so in the verdict and the reasoning.",
].join("\n");

export interface LocalModelConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

const LOCAL_MODEL_DEFAULT = "local-model";

export function localModelConfig(
  env: Record<string, string | undefined> = process.env
): LocalModelConfig | null {
  const baseUrl = env.LLM_BASE_URL?.trim();
  if (!baseUrl) return null;
  return {
    baseUrl,
    model: env.LLM_MODEL?.trim() || LOCAL_MODEL_DEFAULT,
    apiKey: env.LLM_API_KEY?.trim() || "",
  };
}

export function resolveModel(env: Record<string, string | undefined> = process.env): string {
  const local = localModelConfig(env);
  if (local) return local.model;
  const model = env.ANTHROPIC_MODEL?.trim();
  return model ? model : DEFAULT_MODEL;
}

export function analysisAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim() || localModelConfig(env));
}

export function buildMessages(job: JobText, resumeText: string): { system: string; user: string } {
  let description = job.description;
  if (description.length > MAX_DESCRIPTION_CHARS) {
    description = `${description.slice(0, MAX_DESCRIPTION_CHARS)}\n[truncated]`;
  }
  const user = [
    `Job title: ${job.title}`,
    `Company: ${job.company}`,
    "",
    "Job description:",
    description,
    "",
    "Resume (plain text):",
    resumeText,
  ].join("\n");
  return { system: SYSTEM_PROMPT, user };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && (VERDICTS as readonly string[]).includes(value);
}

function parseRequirements(value: unknown): Requirement[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const parsed: Requirement[] = [];
  for (const item of value) {
    if (
      !isObject(item) ||
      typeof item.requirement !== "string" ||
      typeof item.evidence !== "string" ||
      !isVerdict(item.verdict) ||
      typeof item.reasoning !== "string"
    ) {
      return null;
    }
    parsed.push({
      requirement: item.requirement,
      evidence: item.evidence,
      verdict: item.verdict,
      reasoning: item.reasoning,
    });
  }
  return parsed;
}

function parseRewrites(value: unknown): Rewrite[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const parsed: Rewrite[] = [];
  for (const item of value) {
    if (!isObject(item) || typeof item.original !== "string" || typeof item.suggested !== "string") {
      return null;
    }
    parsed.push({ original: item.original, suggested: item.suggested });
  }
  return parsed;
}

export function parseAnalysisValue(value: unknown): Analysis | null {
  if (!isObject(value)) return null;
  const { score, summary, strengths, gaps } = value;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (typeof summary !== "string" || !isStringArray(strengths)) return null;
  if (!Array.isArray(gaps)) return null;

  const parsedGaps: Analysis["gaps"] = [];
  for (const item of gaps) {
    if (!isObject(item) || typeof item.gap !== "string" || typeof item.fix !== "string") return null;
    parsedGaps.push({ gap: item.gap, fix: item.fix });
  }

  const requirements = parseRequirements(value.requirements);
  const rewrites = parseRewrites(value.rewrites);
  if (!requirements || !rewrites) return null;

  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    summary,
    strengths,
    requirements,
    gaps: parsedGaps,
    rewrites,
  };
}

export function parseAnalysis(text: string): Analysis | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) return null;
  try {
    return parseAnalysisValue(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return null;
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export type ModelReply = { ok: true; text: string } | { ok: false; error: string };

export async function callModel({
  system,
  user,
  apiKey,
  model,
  baseUrl,
  maxTokens = MAX_TOKENS,
  fetchImpl = fetch as FetchLike,
}: {
  system: string;
  user: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  fetchImpl?: FetchLike;
}): Promise<ModelReply> {
  const local = Boolean(baseUrl);
  let response: Response;
  try {
    response = await fetchImpl(baseUrl ? chatCompletionsUrl(baseUrl) : API_URL, {
      method: "POST",
      headers: local
        ? {
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            "content-type": "application/json",
          }
        : {
            "x-api-key": apiKey,
            "anthropic-version": API_VERSION,
            "content-type": "application/json",
          },
      body: JSON.stringify(
        local
          ? {
              model,
              max_tokens: maxTokens,
              temperature: 0,
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
            }
          : {
              model,
              max_tokens: maxTokens,
              system,
              messages: [{ role: "user", content: user }],
            }
      ),
    });
  } catch {
    return {
      ok: false,
      error: local ? "Could not reach the model endpoint." : "Could not reach the Claude API.",
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = isObject(body) ? body.error : undefined;
    const message = isObject(error)
      ? error.message
      : typeof error === "string"
        ? error
        : undefined;
    const leaksKey = apiKey !== "" && typeof message === "string" && message.includes(apiKey);
    const usable = typeof message === "string" && message.trim() !== "" && !leaksKey;
    return {
      ok: false,
      error: usable ? message : `The API answered with status ${response.status}`,
    };
  }

  return { ok: true, text: local ? openAiText(body) : anthropicText(body) };
}

export async function runAnalysis({
  job,
  resumeText,
  ...rest
}: {
  job: JobText;
  resumeText: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<AnalysisResult> {
  const reply = await callModel({ ...buildMessages(job, resumeText), ...rest });
  if (!reply.ok) return reply;
  const analysis = parseAnalysis(reply.text);
  if (!analysis) return { ok: false, error: UNREADABLE_REPLY };
  return { ok: true, analysis };
}

function anthropicText(body: unknown): string {
  const content = isObject(body) && Array.isArray(body.content) ? body.content : [];
  return content
    .filter((block): block is { type: "text"; text: string } => isObject(block) && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function openAiText(body: unknown): string {
  const choices = isObject(body) && Array.isArray(body.choices) ? body.choices : [];
  const message = isObject(choices[0]) && isObject(choices[0].message) ? choices[0].message : null;
  const content = message ? message.content : undefined;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => isObject(part) && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}
