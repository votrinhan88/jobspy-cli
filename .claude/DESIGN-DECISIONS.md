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
