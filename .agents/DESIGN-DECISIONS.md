# Design Decisions

Durable, append-only record of design choices for jobspy-cli. Each entry records what was decided and why, so decisions survive handoff rotation.

For full UI conventions and page specs, see `.agents/SPEC.md`.

## 2026-08-27 — Profile UX

- **Toast** — `position: fixed` pill, bottom-center, no layout shift; spring-in, fade+sink out over 1 s after 9 s. Persisted across reload via `sessionStorage` key `profile_notif`.
- **No `window.confirm`** — destructive actions use inline row confirmation instead: click the action, then "Yes / Cancel" in the same row.
- **Auto-switch on create** — creating a profile immediately activates it.
- **Active-profile fallback on delete** — the server picks the next alphabetical profile, or clears the cookie if none remain; the client reloads.
- **Profile chip in nav** — inline on the Profile nav row, right-aligned; no footer chip.

## 2026-10-02 — UX review fixes

- **Free-flowing statuses** — any status can move to any other status, including back to new. There is no transition table, no disabled move and no confirmation dialog. Mistakes are fixed with an undo toast (8 s) that restores the earlier status and the earlier `status_updated_at`. Reason: a fixed pipeline caused dead ends (Rejected and Skipped had no way back) and one wrong click could not be reversed.
- **Cookie fallback to the first profile** — a cookie that is not a valid name, or names a folder that does not exist, is ignored. The app uses the first profile in alphabetical order, or no profile if none exist. The server does not rewrite the cookie (server components cannot set cookies). Reason: it closes the path traversal through the cookie and removes the silent empty pages after a profile is renamed or deleted elsewhere.
- **Own CSV parser instead of a dependency** — `web/lib/csv.ts` has a small single-pass RFC 4180 parser and an atomic writer (temp file, then rename). Reason: the rules allow no new runtime dependency, and the needed cases (quoted commas, newlines, escaped quotes, CRLF, byte-order mark) are few and fully covered by tests, including a fixture written by pandas.
- **Status log as a side file** — status history goes to `data/{profile}/status_log.jsonl` (append-only, one JSON line per change, undo included). It is not a CSV column. Reason: the engine invariants (`_PRESERVE_ON_UPSERT`, column set) stay untouched, and the log gives the Gantt view a real history.
- **Real profile rename** — `PATCH /api/profiles/[name]` renames the folder with `fs.rename`. Reason: the old create-then-delete path deleted all profile data.
- **`accepted` status** — closes the pipeline loop after `offer`. Terminal status alongside `rejected` and `skipped`. Teal color (`#0d9488` light, `#5eead4` dark) to distinguish from offer-green.
- **Ghosted indicator** — computed visual overlay, not a stored status. Ghost icon opacity increases at 2/3/4/6/8 weeks since `status_updated_at`. Avoids polluting the pipeline data model with a time-derived pseudo-status.
- **Kanban drag-and-drop** — HTML5 DnD API, no library. Drop targets validate against `NEXT_STATUSES`; invalid drops snap back. Module-level ref stores dragged job ID because `dragOver` cannot read `dataTransfer` per browser security. No action buttons on kanban cards.
- **Table verb buttons** — action buttons use target-status colors via `--viz-*` CSS vars with `color-mix`. Columns sortable via click-to-toggle (asc/desc/clear).
- **Gantt view** — d3-scale for time math, inline SVG for rendering (consistent with Statistics page pattern). Bars span `date_posted` to `status_updated_at` (terminal) or today (active). Grouped by status, sorted by date within group. Default viewport scrolled to show last 2 months.
- **Component decomposition** — monolithic 315-line `page.tsx` split into `_components/` directory (kanban-view, kanban-column, job-card, table-view, gantt-view, ghosted-icon). Shared domain logic extracted to `lib/status.ts`.

## 2026-09-02 — Free-Flowing Status Transitions

- **Free-flowing status** — removed `NEXT_STATUSES` restriction map and `isTerminal()` from `lib/status.ts`. Any status can transition to any other status. The API already accepted any valid status; the restriction was purely client-side. Simplifies all three views and removes a gatekeeping layer the user found unnecessary.
- **Ghosted-exempt set** — replaced `isTerminal` with `isGhostedExempt`. The set `{accepted, rejected, skipped}` defines statuses that do not show the ghosted indicator. These are intentionally final states, but not locked — they can still transition to other statuses.
- **Status chip popover** — new `StatusPopover` component replaces verb action buttons in the table and adds inline status editing to the Gantt view. Click a status chip to open a popover showing all 7 statuses as colored pills. Click-outside or Escape dismisses.
- **Table simplified** — removed the Actions column entirely. Status is now changed via the clickable status chip in the Status column.
- **Kanban free drag** — all cards are draggable regardless of status (no terminal restriction). Drop targets accept any column different from the card's current status. Archive section (rejected/skipped) is a collapsible `<details>` spoiler, always rendered so cards can be dragged in and out.
- **Gantt flat sort** — removed status grouping. Jobs sorted by `status_updated_at` ascending (oldest top, newest bottom). Text labels (title, company, status chip, day count) rendered outside-right of each bar via foreignObject. Day count shows days in current status.

## 2026-11-01 - Scrape Scheduler

- **In-process cron** - `node-cron` runs inside the Next.js server process. No OS scheduler, no database. The schedule lives in `scrape_config.json` as `schedule: string | null`. The scheduler works only while the server runs.
- **One run function** - the spawn logic moved from the run route to `lib/scrape-runner.ts` (`startScrape`). The manual route and the cron task both call it, so the "no concurrent scrape per profile" rule has one enforcement point. A scheduled run that finds a running scrape skips and logs.
- **Registry on `globalThis`** - the task map survives Next.js dev module reloads. Without it, a reload would leave orphan tasks that fire twice.
- **Validate on save** - the PUT route rejects an invalid cron expression with 400 and saves nothing. The scrape page shows the error. While a custom expression is partial, the whole config save fails, so other unsaved edits wait until the expression is valid.
- **No `@types/node-cron`** - `node-cron` 4.x ships its own types.
- **Profile delete and rename** - delete unregisters the task. Rename unregisters the old name and registers the saved schedule under the new name. Without this, a task for a deleted profile would fire every tick, and a recreated profile with the same name would inherit it.
- **Server time** - schedules use the server local time zone. The preset labels say "server time". The server must run for a schedule to fire (the user runs `pnpm dev` only while working), so the select shows a note about it. An OS-level scheduler stays out of scope.
- **Semantic search dropped** - Step 9 is not planned. The Jobs page has instant text filtering. Reopen it if text search misses wanted jobs.

## 2026-11-01 - Scrape Run Hardening

- **Process id in the status** - `scrape_status.json` stores the child `pid`. Without it, a crash or an unspawnable `uv` left `running` forever and blocked every later run. Liveness uses `process.kill(pid, 0)`. `EPERM` counts as alive. A process id that the operating system reuses can keep a dead run looking live. The risk is accepted because the window is small.
- **Spawn errors** - the `error` event of the child marks the run as failed and appends history. A once-only guard stops `error` and `close` from both writing.
- **No late writes** - the final status write skips when the profile folder is gone. A scrape that ends after a delete or rename cannot recreate the folder.
- **Keywords required** - `startScrape` returns `no_keywords` before it writes anything. The manual route answers 400. A schedule cannot be saved while `job` is empty. This stops a scheduled task from spawning a failing Python process every tick.
- **Save path** - the scrape saves to `jobsCsvPath(profile)`, so `JOBSPY_DATA_DIR` applies to scrape output too.

## 2026-11-02 - LaTeX Resume Builder

- **Builder replaces the upload** - the Resume page builds resumes from fields. The CV upload UI and routes are gone. Old files stay on disk. The gap analysis plan (feature 6) must read the resume files in `data/{profile}/resumes/`.
- **One resume per tag, independent copies** - a tag is free text turned into kebab-case. A copy shares nothing with its source, so tailoring for one company never changes another resume. A base-plus-overrides model was rejected as too complex for one user.
- **LaTeX through pdflatex** - the user wants an Overleaf-like flow without math. Browser print and server-side PDF libraries were rejected. `pdflatex` is detected on `PATH` or through `JOBSPY_PDFLATEX`. Without it the editor is hidden. Tectonic was considered and dropped because `pdflatex` is already installed.
- **Escape field text, trust the template** - field text is escaped, and only `**bold**`, `*italic*` and `[text](url)` become LaTeX. Links allow `http`, `https` and `mailto` only. The template is the user's own source and may hold any LaTeX. Compiles use `-no-shell-escape`, a temporary folder and a timeout. The app is local and single-user. A template can still read local files with `\input`.
- **Shared template, per-tag content** - the look is one `template.tex` per profile, so every resume looks the same. Section order, visibility and content are per tag. Fonts and colors can move into the template or the data later.
- **Own template syntax** - `<<key>>` delimiters avoid the clash with LaTeX braces. A small renderer in `lib/resume/template.ts` replaces a template library. Lines that hold only a section tag are removed.
- **Live preview rules** - the first compile of a tag starts at once. Later edits wait 3 seconds of idle time. A newer compile cancels an older one. A failed compile keeps the last good PDF.
- **Seed data** - the first resume of the main profile came from the user's own PDF. It lives in `data/`, which git ignores. `resumes/` at the repo root is ignored too, because it holds personal PDFs.

## 2026-11-02 - Resume Fit and Gap Analysis

- **Descriptions are stored** - the scraper kept no job text (`description` was blacklisted), so matching had only titles. `description` now stays in `jobs.csv`. The file grows. Old rows get text when a later scrape sees the same job again.
- **Empty never erases** - on upsert a known job takes a new description only when it has text. A scrape without LinkedIn text must not wipe a good description. `_PRESERVE_ON_UPSERT` is unchanged, because a changed description is normal job data.
- **LinkedIn text is opt-out** - `fetch_linkedin_description` defaults to `true`. LinkedIn gives no text without the extra page fetch, and most of the user's jobs come from LinkedIn. The cost is slower scrapes and a higher chance of rate limits. The scrape page has a checkbox.
- **Light list, heavy detail** - `GET /api/jobs` drops `description` so the table stays small. One job's text comes from `GET /api/jobs/[jobId]`.
- **Offline matching first** - the tag score is keyword overlap with a stop-word list and simple plural folding. It is free, fast and testable. It is a hint, not a judgment. The share of the job's words found in the resume is the score, so a long generic job text lowers it.
- **Claude only on request** - gap analysis runs on a click, after a confirm step that shows the size. The user chose to send everything, including contact details, and to default to the cheapest model (`claude-haiku-5-5`, override with `ANTHROPIC_MODEL`). The key is only `ANTHROPIC_API_KEY`, read inside the handler. Errors never contain it. The API is called with plain `fetch`, so there is no new dependency.
- **Saved per job and tag** - results live in `data/{profile}/analysis/` so repeat views cost nothing. Re-run replaces the file. Fix ideas are read-only. The app never edits a resume from a model reply, because a wrong claim could end up in an application.

## 2026-11-03 - Resume Library and Review (supersedes the LaTeX Resume Builder)

- **Import, not build** - the user found the builder over-engineered and friction-heavy. They write resumes in their own tool. The app imports the file. The builder, its template, the live preview and `pdflatex` were removed. Git history keeps them. The builder entry above no longer applies.
- **Three separate layers** - original file, extracted text and analysis result are stored apart (`original.<ext>`, `text.txt` and `meta.json` under `resume-library/{tag}/`; results under `analysis/`). A structured resume model (JSON sections) was rejected for now: PDF-to-structure parsing is unreliable, and plain text is enough for matching and for Claude. The three layers leave room to add structure later without a rewrite.
- **Formats** - PDF, TEX, MD and TXT, plus pasted text. DOCX is out. PDF text comes from `pdfjs-dist`, which runs in Node on any machine. `pdftotext` was rejected because it needs a local install.
- **One tag, one resume** - a replace keeps the tag and raises the version when the text hash differs. Versions of one resume are not kept as files. Separate versions use separate tags.
- **Analyses carry version stamps** - a saved result stores the resume version, the resume text hash and the job description hash. The page marks a result "out of date" when a hash differs. An old result never shows as current for a changed resume or job. Rename moves results with the tag, and delete removes them.
- **Evidence over a score** - the analysis returns a requirements table (requirement, evidence, verdict, reasoning) and suggested wording. The score is an alignment hint, and the page says it does not predict a hiring result. The app never edits a resume from a model reply. The user copies wording by hand.
- **Side by side** - a full page at `/jobs/[jobId]/review` shows the original resume beside the report. The drawer keeps a short summary with a link.
- **Submitted record** - `data/{profile}/submitted.json` stores which resume version went with each job. It is a side file, so `jobs.csv` columns and the engine invariants stay untouched. The page warns when the resume changed after the submission.
- **JobSpy 1.4.1** - the dependency moved from 1.1.82. The flag `fetch_description` replaces the deprecated `linkedin_fetch_description`. The config field name `fetch_linkedin_description` stays for saved configs.

## 2026-11-03 - Location Tiers and Google Jobs

- **Region comes from the geocoder** - `jobs.csv` stored only "City, Country", so a region could not come from the text. The geocoder asks Nominatim with address details and saves the state or province (first of state, province, region, state_district, county) in a new `region` column. Text guessing was rejected because a second part of an address is sometimes a postcode or a district.
- **Region is filled after the upsert** - `location` is preserved on upsert, so the region must follow the location the row keeps, not the location of the new scrape. `fill_regions` runs after the merge and only fills empty cells. That is why `region` is not added to `_PRESERVE_ON_UPSERT` (the set stays unchanged): the region is derived data, and it is never overwritten once set.
- **Separate region cache** - `data/.regioncache.json` is keyed by the standardized location. A lookup that fails is not cached, so the next run retries. A place with no region is cached as empty text.
- **Tiers in the Jobs table only** - the Location sort uses country, region, city. A "Group by location" toggle adds header rows. Applications and Statistics are unchanged. Unknown country and empty region sort and group last.
- **Google Jobs is off** - Google serves job results only to browsers that run JavaScript, so JobSpy gets no data (speedyapply/JobSpy#284, open). The defaults drop it, the config reader removes it from saved lists, and the Scrape page shows it as blocked. Reopen when upstream fixes it: remove `google` from `UNSUPPORTED_SITES` in `web/lib/config.ts`.
- **City from address details** - the geocoder used the first and last part of the Nominatim display address, which gave streets and museums as the "city". It now asks for address details and takes the first of city, town, village, municipality, suburb, hamlet, plus the country (a suburb such as Richmond rolls up to Melbourne). It falls back to the old rule when the details have no place. A leading "Remote" is dropped from the query, because "Remote, Vietnam" was looked up as a place called Remote. The stored location of old rows is not rewritten (upsert preserves it). Clear `data/.geocache.json` to re-geocode new scrapes.
- **Indeed country** - Indeed searches the USA unless it gets a country. The scraper sets `country_indeed` from the last part of the search location when JobSpy knows it (aliases such as "United States" work). An explicit `--country_indeed` wins.
- **Known gap** - an ambiguous raw location with no country, for example "Hanoi Capital Region", can still resolve to the wrong country.

## 2026-11-04 - Deterministic Facets

- **Stored, not computed in the UI** - the engine writes `country`, `city`, `work_mode`, `seniority` and `employment_type` to `jobs.csv`. The web app filters and counts the stored values. Reason: one rule set, one test suite, and the same answer in Python and TypeScript.
- **JobSpy fields first** - `is_remote`, `job_level` and `job_type` are the most reliable sources. A title or description dictionary is only a fallback. This avoids a title guess that contradicts the board data.
- **Conservative dictionaries** - whole-word patterns and clear phrases only. "Lead Generation" is not lead, "Back End Cashier" is not a level, "Remote Sensing" is not remote work, and "Internal Auditor" is not an internship. An empty facet is better than a wrong one.
- **Country from the location, with a known-name check** - a single location part is a country only when it matches `jobspy.model.Country` plus common aliases. A lone metro name such as "Greater Brisbane Area" is a city, not a country. The check uses ASCII folding, so "Việt Nam" matches Vietnam.
- **Backfill script** - `scripts/backfill_facets.py` adds or refreshes the five columns for an existing `jobs.csv`. The next upsert also fills them. The columns are derived, so no engine invariant changes.
- **Facets in the UI** - the Jobs page has five selects and a clear button. The Statistics page has top lists for the five facets. No new database, no LLM and no facet cache.

## 2026-11-04 - CSV Schema and CI

- **One schema file** - `schema/jobs.json` is the single list of `jobs.csv` columns. The engine writes it, the web app reads it, and tests on both sides compare against it. Reason: the two code bases drifted without a shared contract.
- **All values are text** - a CSV row holds only strings. The schema keeps one type and describes the meaning of each field. Numbers stay text so an empty cell is never a zero.
- **Required is small, columns are full** - the reader needs `job_id`, `title`, `company` and `location`. The writer fills the other 35 columns with empty strings and writes all 39 in schema order. Reason: old files can lack new columns, and a stable header makes the data easier to inspect and diff.
- **Writer fills, reader rejects** - the Python writer fills missing columns and rejects a frame without a required column. The web reader rejects a file without a required column. A silent repair on read would hide a broken file.
- **Config is repaired on read, rejected on write** - one bad field must not break the Scrape page, so `readConfig` uses defaults for bad fields. A save must not write a bad file, so `writeConfig` throws and the API returns 400. Reason: read is recovery, write is a contract.
- **Supported sites** - `google` and `glassdoor` are filtered from a saved site list. If no site remains, the defaults apply. Reason: both boards return no usable data, and an empty list would spawn a scrape that cannot succeed.
- **CI with no new service** - GitHub Actions runs the existing local commands. gitleaks runs on the full history. Dependabot watches `uv`, npm and GitHub Actions. No dashboard, no hosted database.
