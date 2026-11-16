import { describe, expect, it } from "vitest";
import type { ResumeMeta } from "@/lib/resumes/library";
import { editedTime, nextSort, sortResumes } from "@/lib/resumes/sort";

function meta(tag: string, version: number, importedAt: string, editedAt?: string): ResumeMeta {
  return { tag, ext: "md", importedAt, version, textHash: "x", editedAt };
}

const items = [
  meta("b", 2, "2026-01-02T00:00:00Z"),
  meta("a", 2, "2026-01-03T00:00:00Z"),
  meta("c", 1, "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"),
];

describe("resume sort", () => {
  it("uses the edit time when present", () => {
    expect(editedTime(items[2])).toBe("2026-02-01T00:00:00Z");
    expect(editedTime(items[0])).toBe("2026-01-02T00:00:00Z");
  });

  it("sorts by name", () => {
    expect(sortResumes(items, { key: "name", dir: "asc" }).map((m) => m.tag)).toEqual(["a", "b", "c"]);
    expect(sortResumes(items, { key: "name", dir: "desc" }).map((m) => m.tag)).toEqual(["c", "b", "a"]);
  });

  it("breaks version ties by tag", () => {
    expect(sortResumes(items, { key: "version", dir: "desc" }).map((m) => m.tag)).toEqual(["a", "b", "c"]);
  });

  it("sorts by edit time", () => {
    expect(sortResumes(items, { key: "edited", dir: "desc" }).map((m) => m.tag)).toEqual(["c", "a", "b"]);
  });

  it("does not change the input", () => {
    sortResumes(items, { key: "name", dir: "desc" });
    expect(items.map((m) => m.tag)).toEqual(["b", "a", "c"]);
  });

  it("flips the direction on the same key and picks a default on a new key", () => {
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "asc" }, "edited")).toEqual({ key: "edited", dir: "desc" });
    expect(nextSort({ key: "edited", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
  });
});
