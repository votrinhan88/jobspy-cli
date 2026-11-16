import { describe, expect, it } from "vitest";
import { hasAllTags, topTags } from "@/lib/resumes/tags";
import type { ResumeMeta } from "@/lib/resumes/library";

const meta = (tag: string) => ({ tag }) as ResumeMeta;

describe("topTags", () => {
  it("counts each hyphen segment once per resume, most common first", () => {
    const tags = topTags([meta("ra-clean"), meta("ra-ra"), meta("research-ra")]);
    expect(tags[0]).toEqual({ tag: "ra", count: 3 });
    expect(tags.map((item) => item.tag)).toEqual(["ra", "clean", "research"]);
  });

  it("keeps only the requested number of tags", () => {
    const names = Array.from({ length: 15 }, (_, i) => meta(`t${String(i).padStart(2, "0")}`));
    expect(topTags(names)).toHaveLength(10);
    expect(topTags(names, 3)).toHaveLength(3);
  });
});

describe("hasAllTags", () => {
  it("needs every active tag among the segments", () => {
    expect(hasAllTags(meta("research-assistant-ai"), ["research", "ai"])).toBe(true);
    expect(hasAllTags(meta("research-assistant-ai"), ["research", "web"])).toBe(false);
    expect(hasAllTags(meta("engineer"), [])).toBe(true);
  });
});
