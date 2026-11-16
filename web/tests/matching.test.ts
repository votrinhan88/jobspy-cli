import { describe, expect, it } from "vitest";
import { extractTerms, rankTags, resumeTerms, scoreMatch } from "@/lib/matching";

describe("extractTerms", () => {
  it("lowercases and keeps terms such as c++, c# and node.js", () => {
    const terms = extractTerms("Senior Python Engineer. Build with C++, C# and Node.js!");
    expect(terms).toEqual(expect.arrayContaining(["python", "engineer", "c++", "c#", "node.js"]));
  });

  it("drops stop words, single characters and plain numbers", () => {
    const terms = extractTerms("The team will use a Python stack with 5 years of experience and x");
    expect(terms).toContain("python");
    expect(terms).toContain("stack");
    for (const dropped of ["the", "and", "with", "a", "5", "x", "experience", "years", "team", "will"]) {
      expect(terms).not.toContain(dropped);
    }
  });

  it("lists each term once, in order of first use", () => {
    expect(extractTerms("Python SQL python Docker sql")).toEqual(["python", "sql", "docker"]);
  });

  it("returns nothing for empty text", () => {
    expect(extractTerms("")).toEqual([]);
  });
});

describe("resumeTerms", () => {
  const text = [
    "# Zelda Fitzgerald",
    "I build **PyTorch** models. [Portfolio](https://secret.example.io/x)",
    "Data Engineer - Built Airflow pipelines",
    "Languages: Python, Rust",
  ].join("\n");
  const terms = resumeTerms(text);

  it("collects the words of the resume text", () => {
    for (const t of ["pytorch", "model", "data", "engineer", "airflow", "pipeline", "python", "rust"]) {
      expect(terms.has(t)).toBe(true);
    }
  });

  it("strips markdown markup and link addresses", () => {
    expect(terms.has("portfolio")).toBe(true);
    for (const t of ["https", "secret.example.io", "**pytorch**"]) expect(terms.has(t)).toBe(false);
  });

  it("returns an empty set for empty text", () => {
    expect(resumeTerms("").size).toBe(0);
  });
});

describe("scoreMatch", () => {
  it("scores the share of job terms the resume has and lists both groups", () => {
    const result = scoreMatch("Python SQL Docker Kubernetes", new Set(["python", "sql"]));
    expect(result).toEqual({ score: 50, matched: ["python", "sql"], missing: ["docker", "kubernetes"] });
  });

  it("counts a repeated job word once", () => {
    const result = scoreMatch("python python python sql", new Set(["python"]));
    expect(result.score).toBe(50);
  });

  it("matches simple plurals and reports the job wording", () => {
    const result = scoreMatch("Build data pipelines", new Set(["pipeline", "data", "build"]));
    expect(result.matched).toContain("pipelines");
    expect(result.score).toBe(100);
  });

  it("returns score 0 for a job text without usable terms", () => {
    expect(scoreMatch("", new Set(["python"]))).toEqual({ score: 0, matched: [], missing: [] });
    expect(scoreMatch("the and of", new Set(["python"]))).toEqual({ score: 0, matched: [], missing: [] });
  });

  it("returns whole-number scores from 0 to 100", () => {
    const result = scoreMatch("python sql docker", new Set(["python"]));
    expect(result.score).toBe(33);
  });
});

describe("rankTags", () => {
  it("sorts by score, highest first", () => {
    const ranking = rankTags("python sql docker", [
      { tag: "low", text: "rust" },
      { tag: "high", text: "python sql docker" },
      { tag: "mid", text: "python" },
    ]);
    expect(ranking.map((r) => [r.tag, r.score])).toEqual([
      ["high", 100],
      ["mid", 33],
      ["low", 0],
    ]);
  });

  it("breaks a tie by tag name", () => {
    const ranking = rankTags("python", [
      { tag: "zeta", text: "python" },
      { tag: "alpha", text: "python" },
    ]);
    expect(ranking.map((r) => r.tag)).toEqual(["alpha", "zeta"]);
  });

  it("returns matched and missing words for each tag", () => {
    const [first] = rankTags("python docker", [{ tag: "a", text: "python" }]);
    expect(first).toEqual({ tag: "a", score: 50, matched: ["python"], missing: ["docker"] });
  });

  it("returns an empty list when there are no tags", () => {
    expect(rankTags("python", [])).toEqual([]);
  });
});
