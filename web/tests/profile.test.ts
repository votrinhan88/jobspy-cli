import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDataDir, removeDataDir, seedProfile, setCookies } from "./helpers";

vi.mock("next/headers", async () => (await import("./helpers")).headersMock);

const profile = await import("@/lib/profile");
const { listProfiles, getActiveProfile, profileDir, jobsCsvPath } = profile;

let dataDir: string;

beforeEach(async () => {
  dataDir = await makeDataDir();
  setCookies();
});

afterEach(async () => {
  await removeDataDir(dataDir);
});

describe("getActiveProfile", () => {
  it("returns the cookie profile when the name is valid and the folder exists", async () => {
    await seedProfile(dataDir, "alpha");
    await seedProfile(dataDir, "beta");
    setCookies({ active_profile: "beta" });
    expect(await getActiveProfile()).toBe("beta");
  });

  it("returns null when there is no cookie and no profile exists", async () => {
    expect(await getActiveProfile()).toBeNull();
  });

  it("returns the first profile alphabetically when there is no cookie", async () => {
    await seedProfile(dataDir, "zeta");
    await seedProfile(dataDir, "alpha");
    expect(await getActiveProfile()).toBe("alpha");
  });

  it("falls back to the first profile when the cookie names a missing profile", async () => {
    await seedProfile(dataDir, "demo");
    setCookies({ active_profile: "gone" });
    expect(await getActiveProfile()).toBe("demo");
  });

  it("never returns a traversal value such as ../data/demo or ..", async () => {
    await seedProfile(dataDir, "demo");
    for (const value of ["../data/demo", "..", "../demo", "./demo", "demo/.."]) {
      setCookies({ active_profile: value });
      expect(await getActiveProfile()).toBe("demo");
    }
  });

  it("falls back for invalid names: empty string, a/b, a b, a\\b, 65 characters", async () => {
    await seedProfile(dataDir, "demo");
    for (const value of ["", "a/b", "a b", "a\\b", "x".repeat(65)]) {
      setCookies({ active_profile: value });
      expect(await getActiveProfile()).toBe("demo");
    }
  });
});

describe("path helpers", () => {
  it("profileDir and jobsCsvPath throw for an invalid name", () => {
    for (const bad of ["..", "../x", "a/b", "a\\b", "", "x".repeat(65), "a b"]) {
      expect(() => profileDir(bad)).toThrow(Error);
      expect(() => jobsCsvPath(bad)).toThrow(Error);
    }
  });

  it("path helpers return paths inside the data directory", () => {
    const helpers = [
      profile.profileDir,
      profile.jobsCsvPath,
      profile.scrapeConfigPath,
      profile.scrapeStatusPath,
      profile.scrapeLogPath,
      profile.scrapeHistoryPath,
      profile.statusLogPath,
      (p: string) => profile.cvPath(p, "md"),
    ];
    for (const helper of helpers) {
      const result = helper("demo");
      expect(result.startsWith(path.join(dataDir, "demo"))).toBe(true);
      expect(() => helper("..")).toThrow(Error);
    }
  });
});

describe("data directory", () => {
  it("JOBSPY_DATA_DIR overrides the default data directory", async () => {
    await seedProfile(dataDir, "alpha");
    expect(await listProfiles()).toEqual(["alpha"]);
    expect(profileDir("alpha")).toBe(path.join(dataDir, "alpha"));
  });
});
