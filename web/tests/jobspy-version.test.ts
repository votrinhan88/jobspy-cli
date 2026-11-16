import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkJobspy,
  compareVersions,
  readLockedVersion,
  resetJobspyCache,
} from "@/lib/jobspy-version";

const LOCK = [
  "[[package]]",
  'name = "pandas"',
  'version = "2.3.0"',
  "",
  "[[package]]",
  'name = "python-jobspy"',
  'version = "1.4.1"',
  'source = { registry = "https://pypi.org/simple" }',
  "",
].join("\n");

const pypi = (version: string) => ({ ok: true, status: 200, json: async () => ({ info: { version } }) });

describe("readLockedVersion", () => {
  it("returns the version of python-jobspy", () => {
    expect(readLockedVersion(LOCK)).toBe("1.4.1");
  });

  it("reads a lock file with Windows line endings", () => {
    expect(readLockedVersion(LOCK.replace(/\n/g, "\r\n"))).toBe("1.4.1");
  });

  it("returns null when the package is missing", () => {
    expect(readLockedVersion('[[package]]\nname = "pandas"\nversion = "2.3.0"\n')).toBeNull();
    expect(readLockedVersion("")).toBeNull();
  });

  it("does not take the version of another package", () => {
    const lock = '[[package]]\nname = "python-jobspy-extra"\nversion = "9.9.9"\n';
    expect(readLockedVersion(lock)).toBeNull();
  });
});

describe("compareVersions", () => {
  it("compares numbers, not text", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.4.1", "1.4.10")).toBeLessThan(0);
    expect(compareVersions("1.4.1", "1.4.1")).toBe(0);
  });

  it("treats a missing part as zero", () => {
    expect(compareVersions("1.4", "1.4.0")).toBe(0);
    expect(compareVersions("2", "1.9.9")).toBeGreaterThan(0);
  });

  it("returns 0 for text that is not a version", () => {
    expect(compareVersions("abc", "1.0.0")).toBe(0);
  });
});

describe("checkJobspy", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    resetJobspyCache();
  });

  it("reports outdated when PyPI has a newer version", async () => {
    fetchMock.mockResolvedValue(pypi("1.5.0"));
    expect(await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock })).toEqual({
      installed: "1.4.1",
      latest: "1.5.0",
      outdated: true,
    });
  });

  it("reports current when the versions match or the installed one is newer", async () => {
    fetchMock.mockResolvedValue(pypi("1.4.1"));
    expect((await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock })).outdated).toBe(false);
    resetJobspyCache();
    fetchMock.mockResolvedValue(pypi("1.3.0"));
    expect((await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock })).outdated).toBe(false);
  });

  it("is quiet when PyPI cannot be reached or answers badly", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock })).toEqual({
      installed: "1.4.1",
      latest: null,
      outdated: false,
    });
    resetJobspyCache();
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    expect((await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock })).latest).toBeNull();
    resetJobspyCache();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ nope: 1 }) });
    expect((await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock })).latest).toBeNull();
  });

  it("is quiet when the installed version is unknown", async () => {
    fetchMock.mockResolvedValue(pypi("9.0.0"));
    const result = await checkJobspy({ lockText: null, fetchImpl: fetchMock });
    expect(result).toEqual({ installed: null, latest: "9.0.0", outdated: false });
  });

  it("asks PyPI once and reuses the answer for six hours", async () => {
    fetchMock.mockResolvedValue(pypi("1.5.0"));
    let now = 1_000_000;
    await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock, now: () => now });
    now += 5 * 60 * 60 * 1000;
    await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock, now: () => now });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 2 * 60 * 60 * 1000;
    await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock, now: () => now });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed lookup", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(pypi("1.5.0"));
    await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock });
    expect((await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock })).latest).toBe("1.5.0");
  });

  it("asks the PyPI JSON address for python-jobspy", async () => {
    fetchMock.mockResolvedValue(pypi("1.4.1"));
    await checkJobspy({ lockText: LOCK, fetchImpl: fetchMock });
    expect(fetchMock.mock.calls[0][0]).toBe("https://pypi.org/pypi/python-jobspy/json");
  });
});
