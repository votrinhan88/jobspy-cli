# Design Decisions

Durable, append-only record of design choices for jobspy-cli. Each entry records what was decided and why, so decisions survive handoff rotation.

For full UI conventions and page specs, see `.claude/SPEC.md`.

## 2026-08-27 — Profile UX

- **Toast** — `position: fixed` pill, bottom-center, no layout shift; spring-in, fade+sink out over 1 s after 9 s. Persisted across reload via `sessionStorage` key `profile_notif`.
- **No `window.confirm`** — destructive actions use inline row confirmation instead: click the action, then "Yes / Cancel" in the same row.
- **Auto-switch on create** — creating a profile immediately activates it.
- **Active-profile fallback on delete** — the server picks the next alphabetical profile, or clears the cookie if none remain; the client reloads.
- **Profile chip in nav** — inline on the Profile nav row, right-aligned; no footer chip.
