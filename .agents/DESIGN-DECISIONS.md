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

## 2026-11-04 - Facet Checkboxes and the Archived Page

- **Checkboxes, not native selects** - each facet opens a small menu of checkboxes. Several values in one facet mean OR, and different facets mean AND. Reason: a native multi-select is hard to use, and one value per facet could not express "Australia or Vietnam" or "Remote or Hybrid".
- **Adaptive controls** - a facet with five options or fewer is plain checkboxes. A facet with more than five also gets All and Clear. Reason: short lists do not need extra buttons, and long lists need a fast path.
- **One-way city options** - the city menu uses the selected countries as context, and a country change removes a city that no longer matches. The country menu ignores the selected cities. Reason: a two-way dependency let a city filter hide the country the user wanted to add. The old menu also offered a Hanoi city while a Sydney-only country filter was active.
- **Skipped is an archive, not a delete** - the Skip button sets `status` to `skipped`. The row stays in `jobs.csv`, leaves the Jobs and Applications lists, and appears on the new Archived page. Restore sets the status back to New. Reason: the user needs a way to hide irrelevant jobs without losing the row or breaking identity.
- **Rejected stays in Applications** - the Applications archive section is now "Rejected" and shows only rejected rows. Reason: Skip is a triage action, and Reject is an application outcome. They need separate places.
- **No separate archive file** - Archived reads the same `jobs.csv` and filters `status`. Reason: flat files stay the storage contract, and a second file would need a merge path.

## 2026-11-04 - New Means the Latest Run

- **New is a run marker, not a status** - the old `New` label was the empty status. That made 248 untriaged jobs look new. `status = ""` is now `Untriaged`. `New` means `first_seen_at` is at or after `started_at` of the latest scrape run.
- **First seen, not last seen** - a job is New only when it first appeared in the latest run. A job that was found again is not New. Reason: "new" normally means first appearance. A marker for every returned row would put almost every job in the New set after each run.
- **One source for the run start** - the Jobs page reads `GET /api/scrape/status` and uses `started_at`. Reason: the existing endpoint is already the app's record of the latest run. A new endpoint would add no data.
- **Legacy rows stay empty** - a row from before the lifecycle columns keeps `first_seen_at` empty. A matched legacy row gets `last_seen_at` only. The engine does not invent a first sighting, because that would mark old rows as New.
- **No timestamp fill on upsert** - the existing-row path adds the lifecycle columns but does not fill them. `_close_gone_jobs` does the same. Reason: a run must not make an unseen old row look seen. This also makes Last seen truthful after the migration.
- **New badge under the status chip** - the status chip shows Untriaged. A separate New badge in the same cell, under the chip, shows that the row first appeared in the latest run. The New filter chip uses the same rule.

## 2026-11-04 - One City Label per Metro Area

- **The city facet is a filter, so one value per metro** - six Sydney suburbs and two state names sat beside Sydney in the city menu. The filter was hard to use. `_canonical_city` in `facets.py` now maps the known names to one label.
- **A state is not a city** - "NSW, Australia" and "SA, Australia" now give an empty city. The country and the region stay. The rule is limited to Australia, because "Victoria, Canada" is a real city.
- **Metro and suburb names roll up** - "Greater Brisbane" becomes "Brisbane". "North Sydney", "Chatswood", "Parramatta", "Bella Vista" and "Belrose" become "Sydney". "Melbourne Eastern Suburbs" becomes "Melbourne".
- **Vietnamese labels lose the rank prefix** - "Thành phố Hồ Chí Minh" becomes "Hồ Chí Minh", and the same holds for Hà Nội, Đà Nẵng and Hải Phòng. The English names "Ho Chi Minh City" and "Hanoi" map to the same labels. One label per city keeps the menu short and the two spellings in one place.
- **A fixed table, not a gazetteer** - `_CITY_ALIASES` holds about ten names, plus the Australian region set and the prefix rule. An unknown name passes through unchanged. No model, no network call, no new file.
- **Old rows need the backfill** - a new scrape fills the facets of the rows it returns. Rows it does not return keep their old city until `scripts/backfill_facets.py --save_path <jobs.csv>` runs.

## 2026-11-04 - A Quiet Status Cell

- **No chip for an untriaged row** - 223 of 258 rows were untriaged, so the Jobs table showed a wall of identical boxes. The table cell now renders a chip only for a real status. The untriaged row keeps the word in an `sr-only` span, so screen readers still hear the state. The drawer still shows the chip, because there the status has context.
- **NEW in uppercase** - the badge label is `NEW`, to match the uppercase status chips. The word stays "New" in prose and in the code that decides the marker.
- **No data change** - the stored `status` is still the empty string. Only the presentation changes.

## 2026-11-04 - Remove the Empty Updated Count

- **`updated_jobs` removed** - the field was always null, so the done banner said "0 updated" after a run that matched 132 rows. Removed from the status shape, the types, the runner, the banner and the SPEC.
- **Add it back only with a definition** - if a feed goes quiet, add a "changed" count (title, description or salary moved), not a match count. A match count is near-constant and names the wrong thing.

## 2026-11-05 - A Content Change Count

- **`changed_jobs`** - the engine hashes the content columns before and after the merge of each matched row. The hash leaves out the preserved columns (`status`, `status_updated_at`, `location`, `job_id`), the lifecycle columns, the geocoded location, the derived facets and `role_key`. A difference counts once.
- **No `content_hash` column** - the hash is computed on both sides at run time, so the CSV schema does not grow. At this scale the cost is negligible.
- **Identity stays `job_id`** - `(site, id)` is already stored as the per-board key. Switching identity to it would change `job_id` for existing rows, which breaks application tracking. The immutable identity rule wins.
- **Not in the banner** - the count is a diagnostic in `scrape_run.json`. The done banner still shows only new and total.

## 2026-11-05 - A Local Model Provider

- **Two request shapes** - Claude uses the Messages API; a local endpoint uses the OpenAI-compatible `chat/completions` shape. `LLM_BASE_URL` selects the local provider, `LLM_MODEL` names the model and `LLM_API_KEY` is optional. A trailing slash on the base URL is dropped.
- **Local wins over Claude** - when both are configured, the local endpoint runs. It is the cheaper and more private path, and the person who set it asked for it.
- **No response_format** - the request does not require JSON mode, because older llama.cpp builds reject it. The prompt already asks for one JSON object and `parseAnalysis` reads the object from around any prose.
- **The empty-key guard** - the error path hides a message that contains the key, but only when a key is set. An empty string would otherwise match every message.

## 2026-11-05 - Posting Evidence, Not a Verdict

- **Two observations** - the drawer shows how many days ago the row was first seen, and a note when the board date is more than one day later than that sighting. The second is the observable part of a repost.
- **No ghost score** - the app does not guess whether a job is real. It shows what it saw and leaves the judgment to the reader. A threshold badge would be a verdict.
- **One-day tolerance** - a time zone can move a board date by a day, so a difference of one day or less does not count as a repost.

## 2026-11-05 - Glassdoor Re-enabled

- **The probe** - python-jobspy 1.4.1 returned 5 results each for Sydney, New York and London on 2026-11-05. The HTTP 400 from issue #270 no longer reproduces.
- **Selectable, not default** - the Scrape page checkbox is enabled and a saved config keeps `glassdoor`. The default site list stays LinkedIn and Indeed, because Glassdoor sits behind Cloudflare and can fail.
- **Google stays blocked** - it still needs a browser (issue #284).

## 2026-11-05 - A Read-Only Agent Surface

- **One tool, one file** - `mcp_server.py` speaks newline-delimited JSON-RPC over stdio and exposes only `search_jobs`. No MCP SDK and no new dependency; the protocol surface is small enough to test directly.
- **Shared query logic** - the MCP tool and `jobs_query.py` call the same `query_jobs`, so a filter cannot drift between the CLI and the agent.
- **Skipped rows hidden by default** - this matches the Jobs page. A status filter still reaches the archive.
- **Read-only** - neither entry point writes the CSV. Mutations stay in the web app, where the status log and undo live.

## 2026-11-05 - Direct Company Boards

- **`provider:board:company` in one flag** - `--company greenhouse:acme:Acme Corporation` needs no new config file or schema. The name is optional and defaults from the slug. A web form field can come later; the engine contract stays the same.
- **Fetch once, not per search** - a board returns all of its jobs, so a run fetches each board once. This can add roles outside the search terms, which is the point of following a company.
- **`first_published`, then `updated_at`** - Greenhouse gives both. The board date is the first publication when it exists; the update time is a fallback and is not a repost signal.
- **Provider allowlist and board pattern** - only `greenhouse` is accepted, and the board name must match `[a-zA-Z0-9_-]+`, so a config value cannot build another URL.
- **The web config carries the same entries** - `scrape_config.json` stores the `--company` strings as they are. The engine owns the syntax, the web layer only validates it and drops a bad entry with a message. No second schema, so the CLI, the API and the form cannot drift.

## 2026-11-05 - Sortable Last Seen and Salary

- **Sorting is a display order, not a comparison of value** - Salary sorts on the raw top of the range. Converting currencies would need live rates, and the order would change with the rate. The order compares the amount the board gave, nothing more.
- **Rows without a date or amount stay last in both directions** - an empty salary is not "0", and an unseen row is not "oldest". The same rule as an empty posted date.
- **The label stays "Last seen"** - it is the last scrape that returned the row, and the Stale and Closed badges are derived from the same timestamp. "Status" would collide with the pipeline Status column. "Last seen" says what the reader gets: a sighting date, not a verdict or a user status.

## 2026-11-05 - Second ATS Adapter: Lever

- **Lever before Ashby and Workday** - the Lever board API is keyless, returns a small JSON array, and carries a salary range. That tests the adapter contract with a different payload shape without new auth.
- **Salary range maps to the existing columns** - `salaryRange.min` and `max` become `min_amount` and `max_amount`, and the interval maps to `yearly`, `monthly` or `hourly`. No new column and no change to the Jobs table.
- **`descriptionPlain` wins over HTML** - Lever often publishes both. Plain text needs no stripping and keeps sentences readable; the HTML path is a fallback.
- **A lever board keeps the same entry syntax** - `lever:board[:Company Name]`. The web validation accepts both providers, so the form and the CLI stay one contract.

## 2026-11-05 - Third ATS Adapter: Ashby

- **Ashby after Lever** - the board API is public and keyless, and the payload carries a published salary tier. A third shape proves the adapter seam is not shaped around the first two boards.
- **The first Salary component wins** - a tier can hold equity, bonus and salary components. Only a component with `compensationType: "Salary"` fills the amount columns; equity percentages have no amount and are ignored.
- **Unlisted jobs are skipped** - `isListed: false` means the employer hides the posting from the board. The scraper follows the board, not the internal record.
- **The interval comes from the token, not an exact string** - Ashby writes `1 YEAR`, `1 HOUR` and similar. A token match keeps the mapping stable if the number or spacing changes.

## 2026-11-05 - Fourth ATS Adapter: Workday

- **Workday needs more than a slug** - the board identity is a tenant, a host cluster and a site, so the board part is `tenant.cluster/site`. One flag keeps the CLI contract and the web field.
- **List pages, then one detail call per job** - the list reply has no description and no real date. `startDate` comes from the detail call, which is the only source.
- **A cap of 100 postings per board** - a large Workday board can hold thousands, and each row costs a request. The cap keeps one board from blocking a run.
- **No salary** - the Workday reply carries none, so the amount columns stay empty instead of guessing from the description.

## 2026-11-05 - Scrape Source Ticks

- **ATS providers are a tick list, not extra sites** - a company board is not a job site, so `providers` gates the `companies` entries instead of merging into `site_name`. A board stays saved while its provider is off.
- **Every provider starts ticked** - the default matches the old behavior, where every saved board ran.
- **Glassdoor starts ticked** - it works again, so the default list carries LinkedIn, Indeed and Glassdoor.
- **Google Jobs stays last and reads "unavailable"** - the upstream cause is a browser requirement, not a block that a retry can lift. The label states the fact; the row stays disabled with no badge.

## 2026-11-05 - Last Seen Tie-Break

- **Ties break on the posted date, newest first** - one scrape stamps many rows with the same `last_seen_at`, so sorting on the timestamp alone leaves a large block unchanged. The posted date gives each row a second, visible key.
- **The tie-break does not follow the sort direction** - the reader clicked Last seen, not Posted. Newest posting first inside each timestamp block is the useful order in both directions.
- **Rows with no sighting stay last** - unknown is not older or newer, so it cannot join the order.

## 2026-11-05 - Kanban Drag and Drop

- **Drag on the kanban, keep the menu in the table** - a mouse drag is the shortest path between two columns, so the cards drop their buttons. The table and the Jobs drawer keep the status menu, which stays the keyboard path.
- **Drop target highlights, the card does not move early** - the card stays in its column until the PATCH returns. A card that jumps and then fails would lie about the state.
- **No separate drop zone for the archive** - the Rejected board uses the same column component, so a card can be dropped there too.
- **Touch has no drag path** - HTML5 drag events do not fire on touch screens, so the table view stays the way to move a card on a phone.

## 2026-11-05 - Application Flow Sankey

- **Statistics, not an Applications view** - the Flow card is a read-only summary, and the Statistics page already owns the pipeline and timeline. Applications keeps its three working views.
- **Forward moves only** - a Sankey is acyclic. Backward moves (Interview to Applied) break the layout, so they are dropped and the card says so.
- **Skipped is not a stage** - it is an archive action, so the chart ignores it. Untriaged is a stage because every first move comes from it.
- **One extra dependency** - `d3-sankey` handles node stacking, link widths and label collision. A custom layout would be more code and more edge cases for the same picture.
- **The log read does not gate the page** - the card degrades to its empty text; Statistics still shows the rest.

## 2026-11-05 - Sankey Bands and Counts

- **Fixed pixels per move, not a stretched layout** - d3-sankey fills the extent it is given, so three moves looked like three full-height blocks. A capped unit (28 px) keeps a move readable at any count, and the chart height follows the data.
- **The dependency went away** - the custom layout is smaller than the configuration it replaced, and it makes label placement and counts straightforward. `d3-sankey` was removed. The earlier entry still explains why it was tried first.
- **Every flow prints its count** - a Sankey without numbers asks the reader to compare widths on sight. The count sits in a small pill at the link midpoint; the node pill carries the stage total.
- **Stage labels sit above the bars** - beside the bar, the label collided with the next flow and with the right edge.

## 2026-11-05 - Sankey Labels in a Header Row

- **Labels leave the plot** - beside a bar or above it, a stage label landed on a flow that enters a later stage. A fixed header row per column cannot collide with a band.
- **Skipped-column counts move left** - a flow from column 1 to column 3 has its midpoint on column 2's bar. The count sits at 32% of the curve, where no bar is.

## 2026-11-05 - One Location Label Everywhere

- **One formatter for every page** - the Statistics "Top locations" list counted the raw `location` string, so it read "Hanoi, Vietnam" while the Jobs table read "Việt Nam, Hồ Chí Minh, Ấp Củ Chi". Statistics now uses `formatLocation`, the same function as the Jobs, Applications and Archived pages.
- **The rank prefix goes from the region too** - "Thành phố Hồ Chí Minh" from the geocoder became "Hồ Chí Minh", the same label the city facet uses. The strip lives in `splitLocation`, so the sort and group tiers agree with the display.
- **Sankey bands follow the source** - incoming bands at a stage are stacked by where they leave their source, not by a hard-coded stage order. A fixed per-pair order would break for the next skipped stage.

## 2026-11-05 - Sankey Shows Every Exit

- **Accepted is a status again** - Offer needs an exit that is not Reject. The status came back after commit 3ab3748 dropped it; the old decision in this log still holds.
- **Exits are one stacked column** - Accepted, Rejected, Skipped and Open sit in a single column, so a skip from Scrape does not cross every stage. Their labels go to the right of each bar, because a header label would collide.
- **Open comes from the last status, not from the moves** - a job that stops at Interview has no move out, so the Open link is counted once per job from its final logged status. Counting from the moves would show an Interview that was passed through and left, not one that stopped.
- **Scrape replaces Untriaged on the chart only** - the empty status keeps its name in the table and the filters. The chart label is the only change.

## 2026-11-05 - Flow Counts Jobs, Not Log Lines

- **Undo cancels the move it reverses** - a job sent to Skipped and then back to Untriaged was counted twice from Scrape (100 jobs, 103 Scrape exits). A move back to the stage just left cancels the move before it. The log keeps every line; only the chart reads the cancelled path.
- **Square-root band widths** - Skipped held 97 of 100 jobs and flattened the active stages into hairlines. Widths use sqrt(count), so the largest band is about 6 times the smallest instead of 32 times. Labels still show the raw count.

## 2026-11-05 - One Branch Order at Every Node

- **Branches sort by the node at the other end, on both sides** - the outgoing and incoming stacks used different rules (link order and source height), so bands at a node crossed. Each node now orders all its branches by the centre of the node at the other end. Ties on the shared centre line go to the shorter span, so a skip band sits outside the stage it passes.
- **Long-band counts sit near the target** - a count placed 32% along a skip band landed on the pipeline stages. Skip bands now carry their count at 85%, and counts that still overlap move down one row.

## 2026-11-05 - Pending Is a Count, Not an Outcome

- **No Open node** - the Open exit came from the "(and hanging)" case in the flow examples, but a job that stops mid-pipeline has no exit, so it is shown as a pending count on its stage label.
- **Outcome order top to bottom: Accepted, Rejected, Skipped.**
- **Known limit: no segment inside a flow** - Skipped holds most jobs and its band spans nearly the full plot height between Scrape and the outcome column, so any stage bar between them lies inside it. Not fixed; the options are in the chat summary, pending a decision.

## 2026-11-05 - Spine Layout: Exits Rise Above the Pipeline

- **Scrape and outcomes hang from the top; the pipeline sits on a baseline.** Exits leave high and rise past the stages. A band that passes over a stage is the only reason a stage moves, and it moves down by the overlap plus a clearance.
- **Only the passed stage moves, not the baseline.** Moving the baseline moved both ends of a skip band together, so the overlap never closed. Pushing the passed stage down closes it in one step.
- **Pending shows as a second label line** under the count, so the header row stays readable.

## 2026-11-05 - Skipped Sits at the Bottom

- **Outcomes stack on the baseline, Skipped lowest.** The stack hung from the top, which put Skipped first. Accepted, Rejected, Skipped now run top to bottom on the same baseline as the pipeline.
- **Any overlap moves the stage down.** The checker ignored a band whose centre sat below a stage's centre, so a band could run under a stage's lower half. Every overlap now counts.

- **Status Log Keeps Forward Steps** - `status_log.jsonl` holds forward steps only. A backward move (an undo, or a drop onto an earlier stage) cuts that job's steps after the last arrival at the stage it returns to, and writes no line. Reason: the flows must balance with the pending count, and a log of every back-and-forth made the saved history disagree with the board. Trade-off: the back-and-forth record is gone. The file was compacted once; the pre-change copy is `status_log.jsonl.bak` in the profile folder.

- **Sankey Ports And Channels** - Progress leaves a stage from its top and drops from its bottom, so the middle of the stage is free for pending jobs. Progress sits in the top 35% of the canvas and drops in the bottom 35%. Reason: a wide drop band would otherwise cut through the progress stages, and sorting ports by destination keeps bands from crossing at the node. Trade-off: a stage with many pending jobs gets a tall empty middle, and a stage whose outgoing sqrt sum exceeds its incoming band still leaves an empty influx.

- **Archive Holds Accepted And Rejected; Statistics Loses The Pipeline Bars** - Accepted is an end state like Rejected, so the Applications archive section is titled Archive and the page subtitle counts accepted and rejected jobs. The Statistics pipeline bars repeated the Flow Sankey, so they are gone. The 187 never-moved jobs stay out of the Sankey and show as a "Not yet reviewed" summary card. Sankey node and link colours match the status chips (Offer grey, Accepted green). The Sankey node already grows to the larger of its incoming and outgoing weight; filling the incoming band to that height would need variable-width bands and is not done.

- **Job Titles Save And Load Are Per Profile** - The Job titles list had one shared `keywords.txt` in the repo root and an "Import from" button that copied it into any profile. Each profile now has its own `data/{profile}/keywords.txt`, written by a save icon and read by a load icon. Load replaces the titles, as the old import did. The root `keywords.txt` stays as a template for the CLI `--job ./keywords.txt` only; the web app no longer reads it.

## 2026-11-12 - Resume Text Editing (reverses part of Resume Library and Review)

- **Edit the text, keep the import** - the Resume page can edit a resume as Markdown text. The earlier rule "the app does not edit resumes" and "the app never edits a resume from a model reply" no longer holds. The user wanted to tailor wording and apply suggestions without leaving the app. The imported file is never changed. Only `text.txt` changes, and `meta.json` gets `edited: true`.
- **Small scope** - no version tree, no headless browser, no structured form. A job-specific copy is "Save as new tag", which fits the one-tag, one-resume rule. A UI/UX expert proposed snapshots, branches, Playwright PDF export and a three-column layout. These were rejected as too heavy for one user. The reason for dropping LaTeX still applies to a headless Chromium. Revisit after real use.
- **PDF through the browser** - the preview is a light page with a print style (A4, one column, Arial). The user prints to PDF. Trade-off: the result depends on the browser print dialog.
- **Apply is explicit and exact** - a suggested line replaces the original only when that text appears once. A missing or repeated line gives an error and changes nothing. The model never writes to a resume by itself. The user presses Apply.
- **Edits show as a changed resume** - saving raises the version and the hash, so the existing "Submitted with this resume" warning fires. The editor says so and offers "Save as new tag" to keep the old text.

## 2026-11-13 - Refactor Before The Next Features

- **Type scale tokens, split stylesheet** - 109 literal `font-size` values became `--text-*` tokens, and the 3,800-line `globals.css` became 16 files imported in the original order. Reason: new features touch CSS, and one file with literal sizes made every change a search. Trade-off: the cascade now depends on import order in `globals.css`.
- **Chip is shared; Popover and Tabs are not** - the jobs filters and the resume tag bar used the same toggle chip with two copies of the CSS, so they share `Chip`. Resume tag chips changed slightly in look (padding, weight, panel background). The popovers and the New resume tabs each have one real use with different behaviour, so a shared version would only add props.
- **Pages split by role** - a page owns state and layout. Hooks own polling and saving (Scrape). Components own one view each (Applications, Resume). `ResumeDetailHead` owns rename, fork and delete state, and the page remounts it with `key={tag}` to reset that state when the viewed resume changes.
- **Test fixtures stay per file** - each test file builds jobs with its own defaults, so a shared factory would not shrink them. The full run takes 31 s.

## 2026-11-13 - PDF Import Structure And Model Conversion

- **Heuristic first, model second** - `structurePdf` reads font size and position and costs nothing, so it runs on every PDF import. It returns null when it finds no heading and no bullet, and the import keeps plain text as before. The model step is a retry the user starts, because it sends the resume to a third party.
- **Conversion lives in the editor, not the import** - the button works on any resume text, shows the size first, and puts the reply in the editor as an unsaved change. Back with the discard prompt undoes it. The route is `/api/resume-convert`; a route under `/api/resumes/` would hide a resume tagged `convert`.
- **One model transport** - `callModel` in `lib/analysis.ts` holds the Anthropic and OpenAI-compatible calls. The fit analysis and the conversion share it.

## 2026-11-13 - Resume Fork Graph

- **Parent in `meta.json`, no guessing** - a fork stores its parent tag at creation. Older resumes show as roots. A text-similarity guess would draw edges the user never made.
- **Rename follows, delete detaches** - a renamed parent updates its children. A deleted parent clears `parent` on its children, so a new resume that reuses the tag does not adopt them.
- **Forks only** - the graph shows forks, not versions of one tag. Versions stay a number in the table.

## 2026-11-13 - Sankey Endpoint Rule

- **Height from the endpoints** - the arriving end of a band is sqrt(count). A stage is as tall as its arrivals, and its leaving ends are scaled to fill it. Heights resolve in one pass with no max rule. Pending jobs no longer show as an empty middle.

## 2026-11-13 - New Means Newly Seen In The Latest Crawl

- **One definition** - New replaces the 3-day and 14-day windows. A job is New when its `first_seen_at` equals the newest `last_seen_at` in the data. The rule needs no clock, so a New job stays New until the next crawl.
- **A crawl that finds nothing new** shows no New jobs.

## 2026-11-13 - Jobs Is The Inbox, Applications Is The Pipeline

- **Roles** - Jobs triages untriaged jobs. Applications holds the jobs the user committed to, Shortlisted and later. The Applications table view stays (Kanban, Table, Gantt). The user did not ask to remove it. Both tables end in a visible Action column.
- **One table** - `JobsTable` serves Jobs. Tracked rows there carry the next-stage button and the status menu.
