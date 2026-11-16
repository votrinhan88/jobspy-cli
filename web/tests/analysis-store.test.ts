import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteAnalyses,
  readAnalysis,
  renameAnalyses,
  writeAnalysis,
  type SavedAnalysis,
} from "@/lib/analysis-store";
import { makeDataDir, removeDataDir, seedProfile } from "./helpers";

let dataDir: string;

const saved: SavedAnalysis = {
  model: "claude-haiku-5-5",
  created_at: "2026-11-02T10:00:00.000Z",
  tag: "backend",
  resume_version: 2,
  resume_hash: "abc123",
  job_hash: "def456",
  analysis: {
    score: 70,
    summary: "Good fit.",
    strengths: ["Python"],
    requirements: [{ requirement: "Python", evidence: "Python", verdict: "strong", reasoning: "Named." }],
    gaps: [{ gap: "No Kubernetes", fix: "Add it." }],
    rewrites: [],
  },
};

beforeEach(async () => {
  dataDir = await makeDataDir();
  await seedProfile(dataDir, "alice");
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

describe("analysis store", () => {
  it("returns null when nothing is saved", async () => {
    expect(await readAnalysis("alice", "acme-ml-1234abcd", "backend")).toBeNull();
  });

  it("saves to data/{profile}/analysis/{jobId}--{tag}.json and reads it back", async () => {
    await writeAnalysis("alice", "acme-ml-1234abcd", "backend", saved);
    await expect(
      fs.stat(path.join(dataDir, "alice", "analysis", "acme-ml-1234abcd--backend.json"))
    ).resolves.toBeTruthy();
    expect(await readAnalysis("alice", "acme-ml-1234abcd", "backend")).toEqual(saved);
  });

  it("keeps one result for each job and tag pair", async () => {
    await writeAnalysis("alice", "job-1", "backend", saved);
    await writeAnalysis("alice", "job-1", "frontend", { ...saved, tag: "frontend" });
    expect((await readAnalysis("alice", "job-1", "frontend"))?.tag).toBe("frontend");
    expect((await readAnalysis("alice", "job-1", "backend"))?.tag).toBe("backend");
  });

  it("replaces an older result", async () => {
    await writeAnalysis("alice", "job-1", "backend", saved);
    await writeAnalysis("alice", "job-1", "backend", { ...saved, analysis: { ...saved.analysis, score: 10 } });
    expect((await readAnalysis("alice", "job-1", "backend"))?.analysis.score).toBe(10);
  });

  it("returns null for a corrupt or wrongly shaped file", async () => {
    const dir = path.join(dataDir, "alice", "analysis");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "job-1--bad.json"), "{not json");
    await fs.writeFile(path.join(dir, "job-1--shape.json"), '{"x":1}');
    expect(await readAnalysis("alice", "job-1", "bad")).toBeNull();
    expect(await readAnalysis("alice", "job-1", "shape")).toBeNull();
  });

  it("refuses ids and tags that could leave the folder", async () => {
    expect(await readAnalysis("alice", "../x", "backend")).toBeNull();
    expect(await readAnalysis("alice", "job-1", "../x")).toBeNull();
    await expect(writeAnalysis("alice", "../x", "backend", saved)).rejects.toThrow();
    await expect(writeAnalysis("alice", "job-1", "A/B", saved)).rejects.toThrow();
  });

  it("returns null for a saved file without version stamps", async () => {
    const dir = path.join(dataDir, "alice", "analysis");
    await fs.mkdir(dir, { recursive: true });
    const old: Partial<SavedAnalysis> = { ...saved };
    delete old.resume_version;
    delete old.resume_hash;
    delete old.job_hash;
    await fs.writeFile(path.join(dir, "job-1--old.json"), JSON.stringify(old));
    expect(await readAnalysis("alice", "job-1", "old")).toBeNull();
  });
});

describe("renameAnalyses", () => {
  it("moves every result of a tag to the new tag and updates the tag inside", async () => {
    await writeAnalysis("alice", "job-1", "old", { ...saved, tag: "old" });
    await writeAnalysis("alice", "job-2", "old", { ...saved, tag: "old" });
    await writeAnalysis("alice", "job-1", "other", { ...saved, tag: "other" });
    await renameAnalyses("alice", "old", "new");
    expect((await readAnalysis("alice", "job-1", "new"))?.tag).toBe("new");
    expect(await readAnalysis("alice", "job-2", "new")).not.toBeNull();
    expect(await readAnalysis("alice", "job-1", "old")).toBeNull();
    expect(await readAnalysis("alice", "job-1", "other")).not.toBeNull();
  });

  it("does nothing when the profile has no analysis folder", async () => {
    await expect(renameAnalyses("alice", "a", "b")).resolves.toBeUndefined();
  });
});

describe("deleteAnalyses", () => {
  it("removes every result of a tag and keeps the others", async () => {
    await writeAnalysis("alice", "job-1", "gone", { ...saved, tag: "gone" });
    await writeAnalysis("alice", "job-2", "gone", { ...saved, tag: "gone" });
    await writeAnalysis("alice", "job-1", "kept", { ...saved, tag: "kept" });
    await deleteAnalyses("alice", "gone");
    expect(await readAnalysis("alice", "job-1", "gone")).toBeNull();
    expect(await readAnalysis("alice", "job-2", "gone")).toBeNull();
    expect(await readAnalysis("alice", "job-1", "kept")).not.toBeNull();
  });

  it("does nothing when the profile has no analysis folder", async () => {
    await expect(deleteAnalyses("alice", "a")).resolves.toBeUndefined();
  });
});
