import { describe, expect, it, vi } from "vitest";
import { buildConvertMessages, cleanReply, runConversion } from "@/lib/resume-convert";

const raw = "Jane Doe\nExperience\nWrote code\nBuilt tests";

function reply(text: string, status = 200) {
  return vi.fn(async () => Response.json({ content: [{ type: "text", text }] }, { status }));
}

describe("buildConvertMessages", () => {
  it("sends the resume text as the user message and names the Markdown set in the system prompt", () => {
    const { system, user } = buildConvertMessages(raw);
    expect(user).toBe(raw);
    expect(system).toContain("# ");
    expect(system).toContain("::");
  });

  it("cuts a very long text", () => {
    expect(buildConvertMessages("x".repeat(100000)).user.length).toBeLessThan(100000);
  });
});

describe("cleanReply", () => {
  it("removes a code fence around the reply", () => {
    expect(cleanReply("```markdown\n# Jane\n```")).toBe("# Jane");
    expect(cleanReply("```\n# Jane\n- a\n```\n")).toBe("# Jane\n- a");
  });

  it("keeps a reply with no fence", () => {
    expect(cleanReply("  # Jane\n")).toBe("# Jane");
  });
});

describe("runConversion", () => {
  const base = { text: raw, apiKey: "sk-test", model: "claude-haiku-5-5" };

  it("returns the converted text", async () => {
    const result = await runConversion({ ...base, fetchImpl: reply("# Jane Doe\n\n## Experience") });
    expect(result).toEqual({ ok: true, text: "# Jane Doe\n\n## Experience" });
  });

  it("fails on an empty reply", async () => {
    const result = await runConversion({ ...base, fetchImpl: reply("  ") });
    expect(result.ok).toBe(false);
  });

  it("passes a model failure on", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: "Overloaded" } }, { status: 529 }));
    expect(await runConversion({ ...base, fetchImpl })).toEqual({ ok: false, error: "Overloaded" });
  });
});
