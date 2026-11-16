import { describe, expect, it } from "vitest";
import { structurePdf, type PdfItem } from "@/lib/resumes/pdf-structure";

function item(str: string, x: number, y: number, size: number, width = str.length * size * 0.5): PdfItem {
  return { str, x, y, size, width };
}

function line(str: string, y: number, size = 10, x = 50): PdfItem[] {
  return [item(str, x, y, size)];
}

describe("structurePdf", () => {
  it("returns null when the page has one size and no bullets", () => {
    const pages = [[...line("Jane Doe", 700), ...line("Python engineer", 686), ...line("Built things", 672)]];
    expect(structurePdf(pages)).toBeNull();
  });

  it("marks the largest size as the title and the next size as a section heading", () => {
    const pages = [
      [
        ...line("Jane Doe", 760, 22),
        ...line("Experience", 720, 14),
        ...line("Wrote code for a living", 700),
        ...line("Wrote more code", 688),
        ...line("Education", 650, 14),
        ...line("A university", 630),
      ],
    ];
    const text = structurePdf(pages)!;
    expect(text).toContain("# Jane Doe");
    expect(text).toContain("## Experience");
    expect(text).toContain("## Education");
    expect(text).toContain("Wrote code for a living");
    expect(text).not.toContain("# Wrote");
  });

  it("turns bullet glyphs into list items and joins wrapped lines", () => {
    const pages = [
      [
        ...line("Jane Doe", 760, 22),
        ...line("Skills", 730, 14),
        ...[item("•", 50, 710, 10, 5), item("Built a pipeline that", 62, 710, 10)],
        ...line("moved data nightly", 698, 10, 62),
        ...[item("-", 50, 686, 10, 5), item("Wrote tests", 62, 686, 10)],
      ],
    ];
    const text = structurePdf(pages)!;
    expect(text).toContain("- Built a pipeline that moved data nightly");
    expect(text).toContain("- Wrote tests");
  });

  it("joins the contact items under the title with a pipe", () => {
    const pages = [
      [
        ...line("Jane Doe", 760, 22),
        ...line("Sydney, Australia  •  +61 400 000 000  •  jane@example.com", 740),
        ...line("Experience", 710, 14),
        ...line("Did work", 690),
      ],
    ];
    const text = structurePdf(pages)!;
    expect(text).toContain("Sydney, Australia | +61 400 000 000 | jane@example.com");
  });

  it("puts a date at the right edge after the row separator", () => {
    const pages = [
      [
        ...line("Jane Doe", 760, 22),
        ...line("Experience", 730, 14),
        item("Engineer, Example Co", 50, 710, 10),
        item("Jan 2023 – Present", 450, 710, 10),
        ...line("Did work", 696),
      ],
    ];
    expect(structurePdf(pages)!).toContain("Engineer, Example Co :: Jan 2023 – Present");
  });

  it("keeps items on one line in reading order and separates blocks by a blank line", () => {
    const pages = [
      [
        ...line("Jane Doe", 760, 22),
        ...[item("World", 100, 730, 10, 25), item("Hello", 50, 730, 10, 25)],
        ...line("Far below", 650),
      ],
    ];
    const text = structurePdf(pages)!;
    expect(text).toContain("Hello World");
    expect(text).toMatch(/Hello World\n\nFar below/);
  });

  it("reads pages in order", () => {
    const pages = [
      [...line("Jane Doe", 760, 22), ...line("One", 730)],
      [...line("Experience", 760, 14), ...line("Two", 730)],
    ];
    const text = structurePdf(pages)!;
    expect(text.indexOf("One")).toBeLessThan(text.indexOf("Two"));
  });

  it("drops icon glyphs that lead a contact item", () => {
    const pages = [
      [
        ...line("Jane Doe", 760, 22),
        ...line("+ Melbourne, VIC | Âƒ +61 473 510 670 | # jane@example.com | Ãï jane-doe", 740),
        ...line("Experience", 710, 14),
        ...line("Did work", 690),
      ],
    ];
    const text = structurePdf(pages)!;
    expect(text).toContain("Melbourne, VIC | +61 473 510 670 | jane@example.com | jane-doe");
  });

  it("joins a word that a line break split with a hyphen", () => {
    const pages = [
      [
        ...line("Jane Doe", 760, 22),
        ...line("About", 730, 14),
        ...line("Expert in the instal-", 710),
        ...line("lation of analyzers.", 698),
      ],
    ];
    expect(structurePdf(pages)!).toContain("Expert in the installation of analyzers.");
  });

  it("drops a page number at the foot of a page", () => {
    const pages = [
      [...line("Jane Doe", 760, 22), ...line("One", 730), ...line("1", 30)],
      [...line("Experience", 760, 14), ...line("Two", 730), ...line("2", 30)],
    ];
    const text = structurePdf(pages)!;
    expect(text).not.toMatch(/^\d$/m);
    expect(text).toContain("Two");
  });
});
