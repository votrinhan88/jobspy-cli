import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteResume, importText, listResumes, renameResume } from "@/lib/resumes/library";
import { makeDataDir, removeDataDir, seedProfile } from "./helpers";

let dataDir: string;

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice");
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

const parentOf = async (tag: string) => (await listResumes("alice")).find((r) => r.tag === tag)?.parent;

describe("resume parent", () => {
  it("stores the parent tag of a fork in the details", async () => {
    await importText("alice", "base", "Jane");
    await importText("alice", "base-ml", "Jane ML", "base");
    expect(await parentOf("base-ml")).toBe("base");
    expect(await parentOf("base")).toBeUndefined();
  });

  it("ignores a parent that does not exist, is invalid or is the tag itself", async () => {
    await importText("alice", "a", "one", "ghost");
    await importText("alice", "b", "two", "Bad Tag");
    await importText("alice", "c", "three", "c");
    for (const tag of ["a", "b", "c"]) expect(await parentOf(tag)).toBeUndefined();
  });

  it("keeps the parent when the same tag is imported again without one", async () => {
    await importText("alice", "base", "Jane");
    await importText("alice", "fork", "Jane 2", "base");
    await importText("alice", "fork", "Jane 3");
    expect(await parentOf("fork")).toBe("base");
  });

  it("follows a renamed parent", async () => {
    await importText("alice", "base", "Jane");
    await importText("alice", "fork", "Jane 2", "base");
    await renameResume("alice", "base", "root");
    expect(await parentOf("fork")).toBe("root");
  });

  it("turns the children of a deleted resume into roots, so a reused tag does not adopt them", async () => {
    await importText("alice", "base", "Jane");
    await importText("alice", "fork", "Jane 2", "base");
    await deleteResume("alice", "base");
    expect(await parentOf("fork")).toBeUndefined();
    await importText("alice", "base", "New base");
    expect(await parentOf("fork")).toBeUndefined();
  });

  it("keeps a renamed fork linked to its parent", async () => {
    await importText("alice", "base", "Jane");
    await importText("alice", "fork", "Jane 2", "base");
    await renameResume("alice", "fork", "fork-2");
    expect(await parentOf("fork-2")).toBe("base");
  });
});
