"use client";

import { useState } from "react";
import type { DiscoveredBoard } from "@/lib/board-discovery";
import { ScheduleSelect } from "@/app/scrape/_components/schedule-select";
import { FetchDescriptionOption } from "@/app/scrape/_components/fetch-description-option";
import { JobspyUpdateNotice } from "@/app/scrape/_components/jobspy-update-notice";
import { SourceRunsTable } from "@/app/scrape/_components/source-runs-table";
import { SaveIcon, LoadIcon } from "@/app/scrape/_components/icons";
import { LinesInput } from "@/app/scrape/_components/lines-input";
import { RunHistory } from "@/app/scrape/_components/run-history";
import { LogSpoiler, ScrapeProgress, StatusBanner } from "@/app/scrape/_components/run-output";
import { PROVIDERS, SITES } from "@/app/scrape/_components/scrape-options";
import { SuggestedBoards } from "@/app/scrape/_components/suggested-boards";
import { SAVE_TEXT, useScrapeConfig } from "@/app/scrape/_components/use-scrape-config";
import { useScrapeRun } from "@/app/scrape/_components/use-scrape-run";

export default function ScrapePage() {
  const { config, noProfile: noConfigProfile, saveState, update: updateConfig, flush: flushConfig } = useScrapeConfig();
  const { status, log, runError, noProfile: noRunProfile, isRunning, run: runScrape } = useScrapeRun();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [keywordsNotif, setKeywordsNotif] = useState<string | null>(null);
  const noProfile = noConfigProfile || noRunProfile;

  function notifyKeywords(message: string) {
    setKeywordsNotif(message);
    setTimeout(() => setKeywordsNotif(null), 3000);
  }

  async function saveKeywords() {
    if (!config) return;
    const res = await fetch("/api/keywords", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: config.job }),
    });
    if (!res.ok) {
      notifyKeywords("Could not save job titles");
      return;
    }
    const { keywords } = await res.json();
    notifyKeywords(`${keywords.length} job title${keywords.length === 1 ? "" : "s"} saved`);
  }

  async function loadKeywords() {
    const res = await fetch("/api/keywords");
    if (res.status === 404) {
      notifyKeywords("No saved job titles");
      return;
    }
    if (!res.ok) {
      notifyKeywords("Could not load job titles");
      return;
    }
    const { keywords } = await res.json();
    updateConfig({ job: keywords });
    flushConfig();
    notifyKeywords(`${keywords.length} job title${keywords.length === 1 ? "" : "s"} loaded`);
  }

  if (noProfile) {
    return (
      <div className="page-content">
        <header className="page-header">
          <h1 className="page-title">Scrape</h1>
        </header>
        <div className="empty-card">
          <p className="empty-card-text">No active profile.</p>
          <a href="/profile" className="btn btn-primary">Create a profile</a>
        </div>
      </div>
    );
  }

  if (!config) {
    return <div className="page-content"><p className="loading-row">Loading…</p></div>;
  }

  const runLabel = isRunning ? "Running…" : "Run scrape";
  const advancedCount = [config.title_exclude, config.exclude_companies, config.companies].filter(
    (list) => list.length > 0
  ).length;

  function addBoard(board: DiscoveredBoard) {
    if (!config) return;
    updateConfig({ companies: [...config.companies, `${board.entry}:${board.name}`] });
    flushConfig();
  }

  return (
    <div className="page-content">
      <header className="page-header page-header--row">
        <div>
          <h1 className="page-title">Scrape</h1>
        </div>
      </header>

      <JobspyUpdateNotice />

      <fieldset className="settings-frame" role="group" aria-label="Scrape settings">
        <div className="settings-head">
          <h2 className="settings-title">Scrape settings</h2>
          <span role="status" className={`save-state save-state--${saveState}`}>
            {SAVE_TEXT[saveState]}
            {saveState === "error" && (
              <button type="button" className="link-btn" onClick={flushConfig}>
                Retry
              </button>
            )}
          </span>
          <button
            className="btn btn-primary"
            onClick={runScrape}
            disabled={isRunning}
          >
            {runLabel}
          </button>
        </div>
        <div className="form-grid settings-grid">
        <div className="form-field form-field--full">
          <label className="form-label">Job sites</label>
          <div className="checkbox-group">
            {SITES.map((site) => (
              <label
                key={site.id}
                className={`checkbox-label${site.unavailable ? " checkbox-label--unavailable" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={config.site_name.includes(site.id)}
                  disabled={!!site.unavailable}
                  onChange={(e) => {
                    if (site.unavailable) return;
                    const next = e.target.checked
                      ? [...config.site_name, site.id]
                      : config.site_name.filter((s) => s !== site.id);
                    updateConfig({ site_name: next });
                  }}
                />
                {site.label}
              </label>
            ))}
          </div>
        </div>

        <div className="form-field">
          <div className="form-field-head">
            <label className="form-label" htmlFor="job-titles">Job titles</label>
            <button
              type="button"
              className="icon-btn"
              title="Save job titles to this profile"
              aria-label="Save job titles"
              onClick={saveKeywords}
            >
              <SaveIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Load the job titles saved for this profile"
              aria-label="Load job titles"
              onClick={loadKeywords}
            >
              <LoadIcon />
            </button>
            {keywordsNotif && <span className="saving-indicator">{keywordsNotif}</span>}
          </div>
          <textarea
            id="job-titles"
            className="input input--textarea"
            rows={10}
            value={config.job.join("\n")}
            onChange={(e) => updateConfig({ job: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })}
            onBlur={flushConfig}
            placeholder={"AI Engineer\nML Engineer\nData Scientist"}
          />
        </div>
        <LinesInput
          label="Locations"
          values={config.location}
          onChange={(v) => updateConfig({ location: v })}
          onFlush={flushConfig}
          placeholder={"Australia\nVietnam\nRemote"}
        />

        <div className="form-field">
          <label className="form-label" htmlFor="results-wanted">Results per search</label>
          <input
            id="results-wanted"
            className="input input--sm"
            type="number"
            min={1}
            max={100}
            value={config.results_wanted}
            onChange={(e) =>
              updateConfig({ results_wanted: parseInt(e.target.value) || 20 })
            }
          />
        </div>

        <div className="form-field">
          <label className="form-label">Schedule</label>
          <ScheduleSelect
            value={config.schedule}
            onChange={(v) => updateConfig({ schedule: v })}
          />
        </div>

        <FetchDescriptionOption
          checked={config.fetch_linkedin_description}
          onChange={(v) => updateConfig({ fetch_linkedin_description: v })}
        />
        </div>

        <div className="settings-advanced">
          <button
            type="button"
            role="switch"
            aria-checked={showAdvanced}
            className="switch-row"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span className="switch-track" aria-hidden="true">
              <span className="switch-knob" />
            </span>
            Advanced settings
            <span className="muted" style={{ fontWeight: 400 }}>
              {advancedCount} configured
            </span>
          </button>
          <div role="group" aria-label="Advanced settings" hidden={!showAdvanced}>
          <div className="form-grid advanced-grid">
        <div className="form-field form-field--full">
          <label className="form-label">ATS crawlers</label>
          <div className="checkbox-group">
            {PROVIDERS.map((provider) => (
              <label key={provider.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.providers.includes(provider.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...config.providers, provider.id]
                      : config.providers.filter((p) => p !== provider.id);
                    updateConfig({ providers: next });
                  }}
                />
                {provider.label}
              </label>
            ))}
          </div>
        </div>

        <LinesInput
          label="Exclude titles containing"
          values={config.title_exclude}
          onChange={(v) => updateConfig({ title_exclude: v })}
          onFlush={flushConfig}
          placeholder={"Senior\nManager\nDirector"}
        />
        <LinesInput
          label="Exclude companies"
          values={config.exclude_companies}
          onChange={(v) => updateConfig({ exclude_companies: v })}
          onFlush={flushConfig}
          placeholder={"Acme Corp\nRecruitment Agency"}
        />
        <LinesInput
          label="Company boards"
          values={config.companies}
          onChange={(v) => updateConfig({ companies: v })}
          onFlush={flushConfig}
          placeholder={"greenhouse:gitlab:GitLab\nlever:acme:Acme\nashby:ramp:Ramp\nworkday:nvidia.wd5/NVIDIAExternalCareerSite:NVIDIA"}
        />
          </div>
          <SuggestedBoards onAdd={addBoard} />
          </div>
        </div>

        <div className="settings-foot">
          <button
            className="btn btn-primary"
            onClick={runScrape}
            disabled={isRunning}
          >
            {runLabel}
          </button>
        </div>
      </fieldset>

      <section className="scrape-output" role="region" aria-label="Scrape output">
        <StatusBanner status={status} />
        {runError && <div className="alert alert-error">{runError}</div>}
        {isRunning && <ScrapeProgress log={log} isRunning={isRunning} />}
        {status && status.status !== "running" && <SourceRunsTable runs={status.source_runs} />}
        <LogSpoiler log={log} isRunning={isRunning} />
        <RunHistory />
      </section>
    </div>
  );
}
