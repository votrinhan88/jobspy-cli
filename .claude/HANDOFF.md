# Handoff — jobspy-cli web app (session 2 wrap-up)

**Date:** 2026-08-27  
**Repo:** `c:\Users\votrinhan88\Desktop\jobspy-cli`  
**Branch:** `main`  
**Next session goal:** Continue feature work — Statistics page, or Jobs/Applications polish.

---

## What was done this session

All changes committed as `cde9026`.

| File | What changed |
|------|-------------|
| `web/app/profile/page.tsx` | Toast fixed overlay pill; `notifFading` fade-out; inline delete confirm; auto-switch on create; active-profile fallback on delete |
| `web/app/api/profiles/[name]/route.ts` | DELETE auto-switches to next profile or clears cookie; returns `{ name, newActive }` |
| `web/components/nav.tsx` | Active profile chip inline on Profile nav row (right-aligned); sidebar footer removed |
| `web/app/globals.css` | Toast → fixed pill; sidebar 180 px; `.btn-danger`; `.sidebar-link` flex |
| `.claude/SPEC.md` | UI Conventions section added; Profile page and DELETE route documented |
| `.claude/skills/handoff/skill.md` | Updated output path to `.claude/HANDOFF.md` |

---

## Decisions made

- **Toast** — `position: fixed` pill, no layout shift, spring-in, fade+sink out after 9 s, persisted across reload via `sessionStorage`.
- **No `window.confirm`** — inline row confirmation for all destructive actions.
- **Auto-switch on create** — creating a profile immediately activates it.
- **Active-profile fallback on delete** — server picks next alphabetical profile or clears cookie; client reloads.
- **Profile chip in nav** — inline on the Profile row, right-aligned.

---

## How to pick up

1. Run `cd web && pnpm dev`.
2. Read `.claude/SPEC.md` for all current decisions.
3. Next: Statistics page (`web/app/statistics/page.tsx` is a stub), or Jobs/Applications UX polish.

---

## Suggested skills

- `.claude/skills/design/SKILL.md` — new page layout work
- `.claude/skills/asd-ste100/skill.md` — always-on for all text output
