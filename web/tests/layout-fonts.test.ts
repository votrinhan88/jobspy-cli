import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(path.resolve(__dirname, "../app/layout.tsx"), "utf8");
const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

describe("root layout fonts", () => {
  it("loads fonts with next/font instead of a stylesheet link", () => {
    expect(layout).toContain("next/font/google");
    expect(layout).not.toContain("fonts.googleapis.com");
  });

  it("uses Inter and JetBrains Mono", () => {
    expect(layout).toMatch(/\bInter\b/);
    expect(layout).toMatch(/\bJetBrains_Mono\b/);
  });

  it("points the app font variables at the next/font variables", () => {
    expect(css).toMatch(/--app-font:\s*var\(--font-inter\)/);
    expect(css).toMatch(/--app-mono:\s*var\(--font-jetbrains-mono\)/);
  });
});
