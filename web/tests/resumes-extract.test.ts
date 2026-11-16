import { describe, expect, it } from "vitest";
import { extractText, isSupportedFile } from "@/lib/resumes/extract";
import { tinyPdf } from "./helpers";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("isSupportedFile", () => {
  it("accepts pdf, tex, md and txt in any letter case", () => {
    for (const name of ["a.pdf", "a.TEX", "a.Md", "a.txt"]) expect(isSupportedFile(name)).toBe(true);
  });

  it("rejects other types and names without an extension", () => {
    for (const name of ["a.docx", "a.exe", "resume"]) expect(isSupportedFile(name)).toBe(false);
  });
});

describe("extractText", () => {
  it("returns plain text and markdown as they are, with line breaks normalised", async () => {
    expect(await extractText("a.txt", bytes("one\r\ntwo\n"))).toBe("one\ntwo");
    expect(await extractText("a.md", bytes("# Jane\n\n- Python\n"))).toBe("# Jane\n\n- Python");
  });

  it("removes a byte-order mark", async () => {
    expect(await extractText("a.txt", bytes("\uFEFFhello"))).toBe("hello");
  });

  it("strips LaTeX commands and keeps the visible words", async () => {
    const tex = [
      "% a comment",
      "\\documentclass{article}",
      "\\usepackage{hyperref}",
      "\\begin{document}",
      "\\section{Experience}",
      "\\textbf{Research Assistant} at \\textit{Example Lab}",
      "\\href{https://example.com}{Portfolio}",
      "\\item Built ETL jobs \\& tests",
      "\\end{document}",
    ].join("\n");
    const text = await extractText("cv.tex", bytes(tex));
    expect(text).toContain("Experience");
    expect(text).toContain("Research Assistant at Example Lab");
    expect(text).toContain("Portfolio");
    expect(text).toContain("Built ETL jobs & tests");
    expect(text).not.toMatch(/\\|documentclass|usepackage|a comment|\{|\}/);
  });

  it("reads the text of a pdf", async () => {
    const text = await extractText("cv.pdf", tinyPdf("Python and SQL engineer"));
    expect(text).toContain("Python and SQL engineer");
  });

  it("throws a clear error for a pdf that cannot be read", async () => {
    await expect(extractText("cv.pdf", bytes("not a pdf"))).rejects.toThrow(/pdf/i);
  });

  it("throws for an unsupported file type", async () => {
    await expect(extractText("cv.docx", bytes("x"))).rejects.toThrow(/unsupported/i);
  });
});
