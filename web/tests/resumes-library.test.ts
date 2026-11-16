import fs from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteResume,
  importFile,
  importText,
  listResumes,
  readOriginal,
  readResumeText,
  renameResume,
} from "@/lib/resumes/library";
import { makeDataDir, removeDataDir, seedProfile } from "./helpers";

let dataDir: string;

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice");
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

const bytes = (text: string) => new TextEncoder().encode(text);

describe("importFile", () => {
  it("stores the original, the text and the details under the tag", async () => {
    const result = await importFile("alice", "backend", "cv.md", bytes("# Jane\n\nPython"));
    expect(result).toMatchObject({ ok: true, tag: "backend", version: 1 });
    expect(await readResumeText("alice", "backend")).toBe("# Jane\n\nPython");
    const original = await readOriginal("alice", "backend");
    expect(original?.ext).toBe("md");
    expect(new TextDecoder().decode(original?.bytes)).toBe("# Jane\n\nPython");
  });

  it("lists the resumes with version, import time and text hash", async () => {
    await importFile("alice", "backend", "cv.txt", bytes("hello"));
    const [item] = await listResumes("alice");
    expect(item).toMatchObject({ tag: "backend", version: 1, ext: "txt" });
    expect(item.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(item.textHash).toMatch(/^[0-9a-f]{16,}$/);
  });

  it("raises the version and changes the hash when the file is replaced", async () => {
    await importFile("alice", "backend", "cv.txt", bytes("one"));
    const [first] = await listResumes("alice");
    const second = await importFile("alice", "backend", "cv2.txt", bytes("two"));
    expect(second).toMatchObject({ ok: true, version: 2 });
    const [item] = await listResumes("alice");
    expect(item.textHash).not.toBe(first.textHash);
    expect(item.ext).toBe("txt");
    expect(await readResumeText("alice", "backend")).toBe("two");
  });

  it("keeps the same hash and version when the same text is imported again", async () => {
    await importFile("alice", "backend", "cv.txt", bytes("same"));
    const [first] = await listResumes("alice");
    await importFile("alice", "backend", "cv.txt", bytes("same"));
    const [item] = await listResumes("alice");
    expect(item.textHash).toBe(first.textHash);
    expect(item.version).toBe(1);
  });

  it("rejects an invalid tag", async () => {
    expect(await importFile("alice", "Not Valid", "cv.txt", bytes("x"))).toEqual({
      ok: false,
      reason: "invalid_tag",
    });
  });

  it("rejects an unsupported file type", async () => {
    expect(await importFile("alice", "backend", "cv.docx", bytes("x"))).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
  });

  it("rejects a file with no text", async () => {
    expect(await importFile("alice", "backend", "cv.txt", bytes("  \n "))).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("rejects a file that is too large", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    expect(await importFile("alice", "backend", "cv.txt", big)).toEqual({ ok: false, reason: "too_large" });
  });

  it("reports a pdf that cannot be read", async () => {
    const result = await importFile("alice", "backend", "cv.pdf", bytes("not a pdf"));
    expect(result).toMatchObject({ ok: false, reason: "unreadable" });
  });

  it("does not leave a half-written resume after a failed import", async () => {
    await importFile("alice", "backend", "cv.pdf", bytes("not a pdf"));
    expect(await listResumes("alice")).toEqual([]);
  });
});

describe("importText", () => {
  it("saves pasted text as a text resume", async () => {
    const result = await importText("alice", "pasted", "Python and SQL");
    expect(result).toMatchObject({ ok: true, tag: "pasted", version: 1 });
    const [item] = await listResumes("alice");
    expect(item).toMatchObject({ tag: "pasted", ext: "txt" });
    expect(await readResumeText("alice", "pasted")).toBe("Python and SQL");
  });
});

describe("listResumes", () => {
  it("returns an empty list when the profile has no resumes", async () => {
    expect(await listResumes("alice")).toEqual([]);
  });

  it("sorts by tag", async () => {
    await importText("alice", "b", "x");
    await importText("alice", "a", "x");
    expect((await listResumes("alice")).map((r) => r.tag)).toEqual(["a", "b"]);
  });

  it("ignores the old builder files", async () => {
    await fs.mkdir(`${dataDir}/alice/resumes`, { recursive: true });
    await fs.writeFile(`${dataDir}/alice/resumes/old.json`, "{}");
    expect(await listResumes("alice")).toEqual([]);
  });
});

describe("read helpers", () => {
  it("return null for a missing tag or an invalid tag", async () => {
    expect(await readResumeText("alice", "missing")).toBeNull();
    expect(await readOriginal("alice", "missing")).toBeNull();
    expect(await readResumeText("alice", "../x")).toBeNull();
  });
});

describe("renameResume", () => {
  it("moves the resume to the new tag", async () => {
    await importText("alice", "old", "text");
    expect(await renameResume("alice", "old", "new")).toEqual({ ok: true, tag: "new" });
    expect(await readResumeText("alice", "new")).toBe("text");
    expect(await readResumeText("alice", "old")).toBeNull();
  });

  it("reports a missing source, an existing target and an invalid tag", async () => {
    await importText("alice", "a", "x");
    await importText("alice", "b", "x");
    expect(await renameResume("alice", "nope", "c")).toEqual({ ok: false, reason: "not_found" });
    expect(await renameResume("alice", "a", "b")).toEqual({ ok: false, reason: "exists" });
    expect(await renameResume("alice", "a", "Bad Tag")).toEqual({ ok: false, reason: "invalid_tag" });
  });
});

describe("deleteResume", () => {
  it("removes the resume", async () => {
    await importText("alice", "a", "x");
    expect(await deleteResume("alice", "a")).toEqual({ ok: true });
    expect(await listResumes("alice")).toEqual([]);
  });

  it("reports a missing resume", async () => {
    expect(await deleteResume("alice", "a")).toEqual({ ok: false, reason: "not_found" });
  });
});
