import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises", () => ({
  default: { readFile: vi.fn(), writeFile: vi.fn() },
}));
vi.mock("@/lib/profile", () => ({
  scrapeConfigPath: (p: string) => `/tmp/${p}/scrape_config.json`,
}));

import fs from "fs/promises";
import { readConfig, validateConfig, writeConfig } from "@/lib/config";

describe("readConfig schedule field", () => {
  beforeEach(() => vi.resetAllMocks());

  it("defaults schedule to null when the file is missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    expect((await readConfig("p")).schedule).toBeNull();
  });

  it("defaults schedule to null for a legacy file without the field", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ job: ["dev"] }));
    const cfg = await readConfig("p");
    expect(cfg.schedule).toBeNull();
    expect(cfg.job).toEqual(["dev"]);
  });

  it("keeps a saved schedule", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ schedule: "0 8 * * *" }));
    expect((await readConfig("p")).schedule).toBe("0 8 * * *");
  });
});

describe("readConfig fetch_linkedin_description field", () => {
  beforeEach(() => vi.resetAllMocks());

  it("defaults to true when the file is missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    expect((await readConfig("p")).fetch_linkedin_description).toBe(true);
  });

  it("defaults to true for a legacy file without the field", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ job: ["dev"] }));
    expect((await readConfig("p")).fetch_linkedin_description).toBe(true);
  });

  it("keeps a saved false", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ fetch_linkedin_description: false }));
    expect((await readConfig("p")).fetch_linkedin_description).toBe(false);
  });
});

describe("readConfig site list", () => {
  beforeEach(() => vi.resetAllMocks());

  it("ticks LinkedIn, Indeed and Glassdoor by default", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    expect((await readConfig("p")).site_name).toEqual(["linkedin", "indeed", "glassdoor"]);
  });

  it("drops Google Jobs from a saved site list because it returns no data", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ site_name: ["linkedin", "indeed", "google"] }));
    expect((await readConfig("p")).site_name).toEqual(["linkedin", "indeed"]);
  });

  it("keeps the other saved sites in order", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ site_name: ["zip_recruiter", "google", "linkedin"] }));
    expect((await readConfig("p")).site_name).toEqual(["zip_recruiter", "linkedin"]);
  });
});

describe("validateConfig", () => {
  it("returns the defaults for an empty object", () => {
    const { config, errors } = validateConfig({});
    expect(errors).toEqual([]);
    expect(config).toMatchObject({
      job: [],
      location: [],
      results_wanted: 20,
      workers: 4,
      schedule: null,
      fetch_linkedin_description: true,
    });
  });

  it("reports a text field that is not a list", () => {
    const { config, errors } = validateConfig({ job: "dev" });
    expect(errors).toContain("job must be a list of text values.");
    expect(config.job).toEqual([]);
  });

  it("reports a result count that is outside the range", () => {
    for (const value of [0, 101, 1.5, "20"]) {
      const { config, errors } = validateConfig({ results_wanted: value });
      expect(errors).toContain("results_wanted must be a whole number from 1 to 100.");
      expect(config.results_wanted).toBe(20);
    }
  });

  it("keeps a valid result count", () => {
    expect(validateConfig({ results_wanted: 50 }).config.results_wanted).toBe(50);
  });

  it("reports a worker count that is outside the range", () => {
    for (const value of [0, 17, 2.5]) {
      const { config, errors } = validateConfig({ workers: value });
      expect(errors).toContain("workers must be a whole number from 1 to 16.");
      expect(config.workers).toBe(4);
    }
  });

  it("reports a non-boolean description flag", () => {
    const { config, errors } = validateConfig({ fetch_linkedin_description: "yes" });
    expect(errors).toContain("fetch_linkedin_description must be true or false.");
    expect(config.fetch_linkedin_description).toBe(true);
  });

  it("keeps a saved false description flag", () => {
    expect(validateConfig({ fetch_linkedin_description: false }).config.fetch_linkedin_description).toBe(false);
  });

  it("reports a schedule that is not text or null", () => {
    const { config, errors } = validateConfig({ schedule: 42 });
    expect(errors).toContain("schedule must be text or null.");
    expect(config.schedule).toBeNull();
  });

  it("keeps a saved schedule", () => {
    expect(validateConfig({ schedule: "0 8 * * *" }).config.schedule).toBe("0 8 * * *");
  });

  it("drops Google Jobs and keeps Glassdoor", () => {
    const { config } = validateConfig({ site_name: ["linkedin", "google", "glassdoor", "indeed"] });
    expect(config.site_name).toEqual(["linkedin", "glassdoor", "indeed"]);
  });

  it("uses the default sites when every saved site is unsupported", () => {
    expect(validateConfig({ site_name: ["google"] }).config.site_name).toEqual([
      "linkedin",
      "indeed",
      "glassdoor",
    ]);
  });

  it("reports a site list that is not text values", () => {
    const { config, errors } = validateConfig({ site_name: ["linkedin", 4] });
    expect(errors).toContain("site_name must be a list of text values.");
    expect(config.site_name).toEqual(["linkedin", "indeed", "glassdoor"]);
  });

  it("reads a legacy file and fills the missing fields", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ job: ["dev"], site_name: ["google", "indeed"] }));
    const cfg = await readConfig("p");
    expect(cfg.job).toEqual(["dev"]);
    expect(cfg.site_name).toEqual(["indeed"]);
    expect(cfg.results_wanted).toBe(20);
  });

  it("repairs a saved file with bad field types", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ results_wanted: "many", workers: 0 }));
    const cfg = await readConfig("p");
    expect(cfg.results_wanted).toBe(20);
    expect(cfg.workers).toBe(4);
  });
});

describe("writeConfig", () => {
  beforeEach(() => vi.resetAllMocks());

  it("writes a valid config", async () => {
    await writeConfig("p", {
      job: ["dev"],
      location: ["Sydney"],
      results_wanted: 20,
      site_name: ["linkedin"],
      workers: 4,
      title_exclude: [],
      exclude_companies: [],
      companies: [],
      providers: ["greenhouse", "lever", "ashby", "workday"],
      schedule: null,
      fetch_linkedin_description: true,
    });
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid config and writes nothing", async () => {
    await expect(
      writeConfig("p", {
        job: "dev",
        location: [],
        results_wanted: 20,
        site_name: ["linkedin"],
        workers: 4,
        title_exclude: [],
        exclude_companies: [],
        schedule: null,
        fetch_linkedin_description: true,
      } as never)
    ).rejects.toThrow("job must be a list of text values.");
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

describe("readConfig company boards", () => {
  beforeEach(() => vi.resetAllMocks());

  it("defaults to an empty list when the file is missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    expect((await readConfig("p")).companies).toEqual([]);
  });

  it("keeps saved boards", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ companies: ["greenhouse:gitlab:GitLab"] })
    );
    expect((await readConfig("p")).companies).toEqual(["greenhouse:gitlab:GitLab"]);
  });

  it("rejects an unknown provider", () => {
    const checked = validateConfig({ companies: ["smartrecruiters:acme:Acme"] });
    expect(checked.errors).toEqual([
      "companies entries must look like provider:board[:Company Name], where provider is greenhouse, lever, ashby or workday. A workday board looks like nvidia.wd5/NVIDIAExternalCareerSite.",
    ]);
    expect(checked.config.companies).toEqual([]);
  });

  it("rejects a workday board without a site", () => {
    const checked = validateConfig({ companies: ["workday:nvidia.wd5:NVIDIA"] });
    expect(checked.errors).toEqual([
      "companies entries must look like provider:board[:Company Name], where provider is greenhouse, lever, ashby or workday. A workday board looks like nvidia.wd5/NVIDIAExternalCareerSite.",
    ]);
    expect(checked.config.companies).toEqual([]);
  });

  it("accepts a workday board", () => {
    const checked = validateConfig({
      companies: ["workday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA"],
    });
    expect(checked.errors).toEqual([]);
    expect(checked.config.companies).toEqual([
      "workday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA",
    ]);
  });

  it("rejects a board with a bad character", () => {
    const checked = validateConfig({ companies: ["greenhouse:acme/../x"] });
    expect(checked.errors).toHaveLength(1);
    expect(checked.config.companies).toEqual([]);
  });

  it("keeps the good entries and reports the bad one", () => {
    const checked = validateConfig({ companies: ["greenhouse:acme:Acme", "nope"] });
    expect(checked.config.companies).toEqual(["greenhouse:acme:Acme"]);
    expect(checked.errors).toHaveLength(1);
  });

  it("accepts a lever board", () => {
    const checked = validateConfig({ companies: ["lever:acme:Acme Corporation"] });
    expect(checked.errors).toEqual([]);
    expect(checked.config.companies).toEqual(["lever:acme:Acme Corporation"]);
  });

  it("accepts an ashby board", () => {
    const checked = validateConfig({ companies: ["ashby:acme:Acme Corporation"] });
    expect(checked.errors).toEqual([]);
    expect(checked.config.companies).toEqual(["ashby:acme:Acme Corporation"]);
  });

  it("accepts a company name with spaces and a colon", () => {
    const checked = validateConfig({ companies: ["greenhouse:acme:Acme: Labs"] });
    expect(checked.errors).toEqual([]);
    expect(checked.config.companies).toEqual(["greenhouse:acme:Acme: Labs"]);
  });
});

describe("readConfig ats providers", () => {
  beforeEach(() => vi.resetAllMocks());

  it("ticks every provider by default", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    expect((await readConfig("p")).providers).toEqual([
      "greenhouse",
      "lever",
      "ashby",
      "workday",
    ]);
  });

  it("keeps the saved ticks", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ providers: ["ashby"] })
    );
    expect((await readConfig("p")).providers).toEqual(["ashby"]);
  });

  it("accepts no ticks", async () => {
    const checked = validateConfig({ providers: [] });
    expect(checked.errors).toEqual([]);
    expect(checked.config.providers).toEqual([]);
  });

  it("drops an unknown provider and reports it", () => {
    const checked = validateConfig({ providers: ["greenhouse", "workable"] });
    expect(checked.config.providers).toEqual(["greenhouse"]);
    expect(checked.errors).toEqual([
      "providers must be a list of greenhouse, lever, ashby or workday.",
    ]);
  });
});
