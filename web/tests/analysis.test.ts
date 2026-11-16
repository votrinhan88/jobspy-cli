import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analysisAvailable,
  buildMessages,
  localModelConfig,
  parseAnalysis,
  resolveModel,
  runAnalysis,
  type Analysis,
} from "@/lib/analysis";

const resumeText = "Jane Doe\nPython and SQL engineer. Built ETL jobs.";
const job = { title: "ML Engineer", company: "Acme Labs", description: "Build models with Python." };

const good: Analysis = {
  score: 72,
  summary: "Good fit for the role.",
  strengths: ["Python", "PyTorch"],
  requirements: [
    { requirement: "Python", evidence: "Python and SQL engineer", verdict: "strong", reasoning: "Named directly." },
    { requirement: "Team leadership", evidence: "", verdict: "missing", reasoning: "No leadership shown." },
  ],
  gaps: [{ gap: "No Kubernetes", fix: "Add the deploy project to the Skills line." }],
  rewrites: [{ original: "Built ETL jobs.", suggested: "Built and ran ETL jobs for daily reports." }],
};

describe("resolveModel", () => {
  it("defaults to claude-haiku-5-5", () => {
    expect(resolveModel({})).toBe("claude-haiku-5-5");
    expect(resolveModel({ ANTHROPIC_MODEL: "  " })).toBe("claude-haiku-5-5");
  });
});

describe("analysisAvailable", () => {
  it("needs a non-empty ANTHROPIC_API_KEY", () => {
    expect(analysisAvailable({ ANTHROPIC_API_KEY: "sk-test" })).toBe(true);
    expect(analysisAvailable({ ANTHROPIC_API_KEY: "" })).toBe(false);
    expect(analysisAvailable({ ANTHROPIC_API_KEY: "   " })).toBe(false);
    expect(analysisAvailable({})).toBe(false);
  });
});

describe("buildMessages", () => {
  it("puts the job and the resume text in the user message", () => {
    const { system, user } = buildMessages(job, resumeText);
    expect(system.length).toBeGreaterThan(20);
    expect(user).toContain("ML Engineer");
    expect(user).toContain("Acme Labs");
    expect(user).toContain("Build models with Python.");
    expect(user).toContain(resumeText);
  });

  it("asks for the JSON shape that parseAnalysis reads", () => {
    const { system } = buildMessages(job, resumeText);
    for (const word of ["JSON", "score", "summary", "strengths", "requirements", "verdict", "evidence", "gaps", "fix", "rewrites"]) {
      expect(system).toContain(word);
    }
  });

  it("cuts a long description at 20000 characters and says so", () => {
    const long = { ...job, description: "x".repeat(25000) };
    const { user } = buildMessages(long, resumeText);
    expect(user).toContain("[truncated]");
    expect(user).not.toContain("x".repeat(20001));
    expect(user).toContain("x".repeat(20000));
  });
});

describe("parseAnalysis", () => {
  it("reads plain JSON", () => {
    expect(parseAnalysis(JSON.stringify(good))).toEqual(good);
  });

  it("reads JSON inside a code fence", () => {
    expect(parseAnalysis("```json\n" + JSON.stringify(good) + "\n```")).toEqual(good);
  });

  it("reads JSON with text around it", () => {
    expect(parseAnalysis("Here is the result: " + JSON.stringify(good) + " Hope it helps.")).toEqual(good);
  });

  it("rounds and limits the score to 0-100", () => {
    expect(parseAnalysis(JSON.stringify({ ...good, score: 140 }))?.score).toBe(100);
    expect(parseAnalysis(JSON.stringify({ ...good, score: -5 }))?.score).toBe(0);
    expect(parseAnalysis(JSON.stringify({ ...good, score: 71.6 }))?.score).toBe(72);
  });

  it("reads a reply without requirements or rewrites as empty lists", () => {
    const rest: Partial<Analysis> = { ...good };
    delete rest.requirements;
    delete rest.rewrites;
    expect(parseAnalysis(JSON.stringify(rest))).toEqual({ ...rest, requirements: [], rewrites: [] });
  });

  it("returns null for a requirement with a verdict that is not allowed or a missing field", () => {
    const bad = (requirements: unknown) => JSON.stringify({ ...good, requirements });
    expect(parseAnalysis(bad([{ requirement: "x", evidence: "", verdict: "great", reasoning: "" }]))).toBeNull();
    expect(parseAnalysis(bad([{ requirement: "x", verdict: "strong", reasoning: "" }]))).toBeNull();
    expect(parseAnalysis(JSON.stringify({ ...good, rewrites: [{ original: "a" }] }))).toBeNull();
  });

  it("returns null for text without JSON or with the wrong shape", () => {
    expect(parseAnalysis("no json here")).toBeNull();
    expect(parseAnalysis("{not json}")).toBeNull();
    expect(parseAnalysis(JSON.stringify({ ...good, summary: undefined }))).toBeNull();
    expect(parseAnalysis(JSON.stringify({ ...good, strengths: "Python" }))).toBeNull();
    expect(parseAnalysis(JSON.stringify({ ...good, gaps: [{ gap: "x" }] }))).toBeNull();
    expect(parseAnalysis(JSON.stringify({ ...good, score: "high" }))).toBeNull();
  });
});

describe("runAnalysis", () => {
  const fetchMock = vi.fn();
  const reply = (text: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text }] }),
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = () => runAnalysis({ job, resumeText, apiKey: "sk-secret-123", model: "claude-haiku-5-5", fetchImpl: fetchMock });

  it("calls the Messages API with the key, version and model", async () => {
    fetchMock.mockResolvedValue(reply(JSON.stringify(good)));
    await run();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("sk-secret-123");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(init.headers["content-type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-haiku-5-5");
    expect(typeof body.max_tokens).toBe("number");
    expect(typeof body.system).toBe("string");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toContain("Acme Labs");
  });

  it("returns the parsed analysis", async () => {
    fetchMock.mockResolvedValue(reply(JSON.stringify(good)));
    expect(await run()).toEqual({ ok: true, analysis: good });
  });

  it("joins several text blocks before it reads the reply", async () => {
    const json = JSON.stringify(good);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          { type: "text", text: json.slice(0, 20) },
          { type: "text", text: json.slice(20) },
        ],
      }),
    });
    expect(await run()).toEqual({ ok: true, analysis: good });
  });

  it("returns the API error message and never the key", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "invalid x-api-key" } }),
    });
    const result = await run();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("invalid x-api-key");
      expect(result.error).not.toContain("sk-secret-123");
    }
  });

  it("names the status when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 529,
      json: async () => {
        throw new Error("not json");
      },
    });
    const result = await run();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("529");
  });

  it("reports a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const result = await run();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/could not reach/i);
  });

  it("reports a reply that cannot be read", async () => {
    fetchMock.mockResolvedValue(reply("I cannot help with that."));
    const result = await run();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/could not be read/i);
  });
});

describe("localModelConfig", () => {
  it("is null without LLM_BASE_URL", () => {
    expect(localModelConfig({})).toBeNull();
    expect(localModelConfig({ LLM_BASE_URL: "   " })).toBeNull();
  });

  it("reads the base url, the model and an optional key", () => {
    expect(localModelConfig({ LLM_BASE_URL: " http://127.0.0.1:8080/v1 " })).toEqual({
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "local-model",
      apiKey: "",
    });
    expect(
      localModelConfig({ LLM_BASE_URL: "http://localhost:8080/v1", LLM_MODEL: "qwen3", LLM_API_KEY: "local" })
    ).toEqual({ baseUrl: "http://localhost:8080/v1", model: "qwen3", apiKey: "local" });
  });
});

describe("the local endpoint in resolveModel and analysisAvailable", () => {
  it("picks LLM_MODEL ahead of ANTHROPIC_MODEL", () => {
    expect(
      resolveModel({ LLM_BASE_URL: "http://127.0.0.1:8080/v1", LLM_MODEL: "qwen3", ANTHROPIC_MODEL: "claude-x" })
    ).toBe("qwen3");
  });

  it("counts as available without an Anthropic key", () => {
    expect(analysisAvailable({ LLM_BASE_URL: "http://127.0.0.1:8080/v1" })).toBe(true);
    expect(analysisAvailable({ ANTHROPIC_API_KEY: "", LLM_BASE_URL: "http://127.0.0.1:8080/v1" })).toBe(true);
    expect(analysisAvailable({ ANTHROPIC_API_KEY: "", LLM_BASE_URL: "" })).toBe(false);
  });
});

describe("runAnalysis with a local endpoint", () => {
  const fetchMock = vi.fn();
  const localReply = (text: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: text } }] }),
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runLocal = (apiKey = "") =>
    runAnalysis({
      job,
      resumeText,
      apiKey,
      model: "qwen3-8b",
      baseUrl: "http://127.0.0.1:8080/v1/",
      fetchImpl: fetchMock,
    });

  it("posts to chat/completions with a system and a user message", async () => {
    fetchMock.mockResolvedValue(localReply(JSON.stringify(good)));
    await runLocal();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8080/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(init.headers.Authorization).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(body.model).toBe("qwen3-8b");
    expect(body.temperature).toBe(0);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain("Acme Labs");
  });

  it("sends a bearer token when LLM_API_KEY is set", async () => {
    fetchMock.mockResolvedValue(localReply(JSON.stringify(good)));
    await runLocal("local-secret");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer local-secret");
  });

  it("reads the reply from choices", async () => {
    fetchMock.mockResolvedValue(localReply(JSON.stringify(good)));
    expect(await runLocal()).toEqual({ ok: true, analysis: good });
  });

  it("returns the endpoint error message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "model not found" } }),
    });
    const result = await runLocal();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("model not found");
  });

  it("reports a network failure against the endpoint", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const result = await runLocal();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/could not reach/i);
  });

  it("reports a reply that cannot be read", async () => {
    fetchMock.mockResolvedValue(localReply("I cannot help with that."));
    const result = await runLocal();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/could not be read/i);
  });
});
