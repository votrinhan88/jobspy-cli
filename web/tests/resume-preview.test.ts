import { describe, expect, it } from "vitest";
import { contactKind, parseInline, parseResume, splitRow } from "@/lib/resumes/preview";

describe("parseResume", () => {
  it("reads headings, bullets and paragraphs", () => {
    const blocks = parseResume("# Jane Smith\n\nMelbourne\njane@example.com\n\n## Experience\n\n### Engineer\n- Built A\n- Built B");
    expect(blocks).toEqual([
      { kind: "h1", text: "Jane Smith" },
      { kind: "p", text: "Melbourne\njane@example.com" },
      { kind: "h2", text: "Experience" },
      { kind: "h3", text: "Engineer" },
      { kind: "list", items: ["Built A", "Built B"] },
    ]);
  });

  it("accepts star bullets and groups only neighbouring items", () => {
    expect(parseResume("* A\n* B\ntext\n- C")).toEqual([
      { kind: "list", items: ["A", "B"] },
      { kind: "p", text: "text" },
      { kind: "list", items: ["C"] },
    ]);
  });

  it("keeps plain text with no markup as paragraphs", () => {
    expect(parseResume("Jane\n\nPython")).toEqual([
      { kind: "p", text: "Jane" },
      { kind: "p", text: "Python" },
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(parseResume("  \n\n")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("marks bold and italic spans and keeps the rest plain", () => {
    expect(parseInline("**Award:** Winner of *InnoFes* 2024")).toEqual([
      { text: "Award:", bold: true },
      { text: " Winner of " },
      { text: "InnoFes", italic: true },
      { text: " 2024" },
    ]);
  });

  it("leaves a lone star as text", () => {
    expect(parseInline("5 * 3 and a*b")).toEqual([{ text: "5 * 3 and a*b" }]);
  });

  it("returns one plain span for text with no markup", () => {
    expect(parseInline("Python")).toEqual([{ text: "Python" }]);
  });
});

describe("parseInline links", () => {
  it("reads a Markdown link as a span with an address", () => {
    expect(parseInline("See [Portfolio](https://example.com/me) now")).toEqual([
      { text: "See " },
      { text: "Portfolio", href: "https://example.com/me" },
      { text: " now" },
    ]);
  });

  it("accepts a mailto link", () => {
    expect(parseInline("[me](mailto:me@example.com)")).toEqual([{ text: "me", href: "mailto:me@example.com" }]);
  });

  it("keeps only the text of a link with an unsafe address", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ text: "x" }]);
    expect(parseInline("[y](data:text/html,hi)")).toEqual([{ text: "y" }]);
  });

  it("allows bold text around a link", () => {
    expect(parseInline("**A** [b](https://e.com)")).toEqual([
      { text: "A", bold: true },
      { text: " " },
      { text: "b", href: "https://e.com" },
    ]);
  });
});

describe("splitRow", () => {
  it("splits a line into a left part and a right-aligned part", () => {
    expect(splitRow("Deakin University :: 2022 – 2026")).toEqual(["Deakin University", "2022 – 2026"]);
  });

  it("returns no right part when there is no separator", () => {
    expect(splitRow("Deakin University")).toEqual(["Deakin University", null]);
  });
});

describe("contactKind", () => {
  it("names a link by where it points", () => {
    expect(contactKind("[a@b.com](mailto:a@b.com)")).toBe("mail");
    expect(contactKind("[LinkedIn](https://www.linkedin.com/in/x/)")).toBe("linkedin");
    expect(contactKind("[GitHub](https://github.com/x)")).toBe("github");
    expect(contactKind("[Google Scholar](https://scholar.google.com/citations?user=1)")).toBe("scholar");
    expect(contactKind("[Portfolio](https://example.com/)")).toBe("web");
  });

  it("names plain text as an email, a phone number or a place", () => {
    expect(contactKind("jane@example.com")).toBe("mail");
    expect(contactKind("+61 400 000 000")).toBe("phone");
    expect(contactKind("(03) 9000 0000")).toBe("phone");
    expect(contactKind("Melbourne, VIC")).toBe("location");
    expect(contactKind("Ho Chi Minh City, Vietnam")).toBe("location");
  });

  it("gives no icon to text it cannot place", () => {
    expect(contactKind("Open to relocation")).toBeNull();
    expect(contactKind("Python")).toBeNull();
    expect(contactKind("12 years")).toBeNull();
  });
});
