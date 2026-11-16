import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyRewrite,
  importFile,
  listResumes,
  readOriginal,
  readResumeText,
  saveResumeText,
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

describe("saveResumeText", () => {
  it("replaces the text, raises the version and keeps the original file", async () => {
    await importFile("alice", "backend", "cv.md", bytes("# Jane\n\nPython"));
    const result = await saveResumeText("alice", "backend", "# Jane\n\nPython and Go");

    expect(result).toEqual({ ok: true, version: 2 });
    expect(await readResumeText("alice", "backend")).toBe("# Jane\n\nPython and Go");
    const original = await readOriginal("alice", "backend");
    expect(new TextDecoder().decode(original?.bytes)).toBe("# Jane\n\nPython");
    const [meta] = await listResumes("alice");
    expect(meta).toMatchObject({ version: 2, edited: true });
  });

  it("keeps the version when the text does not change", async () => {
    await importFile("alice", "backend", "cv.md", bytes("# Jane"));
    expect(await saveResumeText("alice", "backend", "# Jane")).toEqual({ ok: true, version: 1 });
  });

  it("rejects empty text, a bad tag and a missing resume", async () => {
    await importFile("alice", "backend", "cv.md", bytes("# Jane"));
    expect(await saveResumeText("alice", "backend", "  \n")).toEqual({ ok: false, reason: "empty" });
    expect(await saveResumeText("alice", "Bad Tag", "x")).toEqual({ ok: false, reason: "invalid_tag" });
    expect(await saveResumeText("alice", "other", "x")).toEqual({ ok: false, reason: "not_found" });
  });

  it("clears the edited flag when a new file replaces the resume", async () => {
    await importFile("alice", "backend", "cv.md", bytes("# Jane"));
    await saveResumeText("alice", "backend", "# Jane Doe");
    await importFile("alice", "backend", "cv.md", bytes("# Jane Smith"));
    const [meta] = await listResumes("alice");
    expect(meta.edited).toBeFalsy();
  });
});

describe("applyRewrite", () => {
  it("replaces one exact line", () => {
    const result = applyRewrite("A\nDeveloped ML systems.\nB", "Developed ML systems.", "Built ML systems.");
    expect(result).toEqual({ ok: true, text: "A\nBuilt ML systems.\nB" });
  });

  it("ignores surrounding space on the original", () => {
    const result = applyRewrite("- Developed ML systems.", "  Developed ML systems. ", "Built ML systems.");
    expect(result).toEqual({ ok: true, text: "- Built ML systems." });
  });

  it("fails when the original is not in the text", () => {
    expect(applyRewrite("A", "Z", "Y")).toEqual({ ok: false, reason: "not_found" });
  });

  it("fails when the original appears more than once", () => {
    expect(applyRewrite("Z\nZ", "Z", "Y")).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("fails on an empty original", () => {
    expect(applyRewrite("A", "  ", "Y")).toEqual({ ok: false, reason: "not_found" });
  });
});
