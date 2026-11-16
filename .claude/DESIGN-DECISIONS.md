# Design Decisions

Durable, append-only record of design choices for jobspy-cli. Each entry records what was decided and why, so decisions survive handoff rotation.

For full UI conventions and page specs, see `.claude/SPEC.md`.

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
