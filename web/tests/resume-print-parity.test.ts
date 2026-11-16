import { allCss } from "./css";
import { describe, expect, it } from "vitest";

const css = allCss;

function rule(source: string, selector: string): Record<string, string> {
  const start = source.indexOf(`\n${selector} {`);
  expect(start, `rule ${selector}`).toBeGreaterThan(-1);
  const body = source.slice(source.indexOf("{", start) + 1, source.indexOf("}", start));
  return Object.fromEntries(
    body
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d && !d.startsWith("/*"))
      .map((d) => {
        const at = d.indexOf(":");
        return [d.slice(0, at).trim(), d.slice(at + 1).trim()];
      })
  );
}

const printBlock = css.slice(css.indexOf("@media print"));
const sheet = rule(css, ".resume-sheet");
const printSheet = rule(printBlock.replace(/\n {2}/g, "\n"), ".resume-sheet");
const page = /@page\s*\{[^}]*margin:\s*([^;]+);/.exec(printBlock)?.[1];

// Anything that changes how text lays out must be the same in the preview and in the print.
const LAYOUT = ["font-family", "font-size", "line-height", "font-variant-ligatures", "text-align"];

describe("resume preview and print parity", () => {
  it("never overrides a type or layout property in print", () => {
    for (const property of LAYOUT) expect(printSheet).not.toHaveProperty(property);
  });

  it("gives the preview the A4 width and the same side margins as the print page", () => {
    expect(sheet.width).toBe("210mm");
    expect(sheet["box-sizing"]).toBe("border-box");
    expect(page).toBe("15.24mm");
    expect(sheet.padding).toBe("15.24mm");
  });

  it("does not scale or clip the page in print", () => {
    expect(printSheet.width).toBe("auto");
    expect(printSheet.padding).toBe("0");
    expect(rule(printBlock.replace(/\n {2}/g, "\n"), ".resume-sheet-frame")["max-height"]).toBe("none");
  });
});
