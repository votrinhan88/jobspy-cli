import { describe, expect, it } from "vitest";
import { isValidTag, normalizeTag } from "@/lib/tag";

describe("normalizeTag", () => {
  it("converts free text to kebab-case", () => {
    expect(normalizeTag("Research Assistant!")).toBe("research-assistant");
  });

  it("collapses separators and trims them", () => {
    expect(normalizeTag("  --A__b-- ")).toBe("a-b");
  });

  it("returns an empty string when nothing usable is left", () => {
    expect(normalizeTag("!!!")).toBe("");
    expect(normalizeTag("")).toBe("");
  });
});

describe("isValidTag", () => {
  it("accepts kebab-case", () => {
    expect(isValidTag("backend-engineer")).toBe(true);
    expect(isValidTag("acme")).toBe(true);
    expect(isValidTag("v2-acme-2026")).toBe(true);
  });

  it("rejects everything else", () => {
    for (const bad of ["", "A", "a--b", "-a", "a-", "a b", "../x", "a/b", "a_b", "a".repeat(65)]) {
      expect(isValidTag(bad)).toBe(false);
    }
  });
});
