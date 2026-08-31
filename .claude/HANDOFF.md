# Handoff — jobspy-cli 10-feature plan (session 5 wrap-up)

**Date:** 2026-09-01
**Branch:** `main`
**Status:** Steps 1–6 complete. Step 7 rejected (model lock-in). Steps 8–9 skipped. Step 10 (scheduler) blocked on permission.

---

## What was completed

**All of Steps 1–6** fully implemented and verified:

| Step | Feature | Status |
|------|---------|--------|
| 1 | Scrape status counts (parse log) | ✅ Done |
| 2 | CV file serving (`/api/resume/file`) | ✅ Done |
| 3 | Job detail drawer (right panel) | ✅ Done |
| 4 | Export CSV (`/api/jobs/export`) | ✅ Done |
| 5 | Scrape history (20-run table) | ✅ Done |
| 6 | Keywords.txt import button | ✅ Done |
| 7 | Gap analysis (Claude API) | ❌ Rejected |
| 8 | Job scoring | ⊘ Skipped |
| 9 | Semantic job search | ⊘ Skipped (see research below) |
| 10 | Scrape scheduler | ⧗ Blocked |

All 65 Python tests pass. `pnpm build` is clean.

---

## Why Steps 7–9 Were Skipped

User directive: "I don't want to be locked in a single model."

- **Step 7 (Gap analysis)** required hardcoding `ANTHROPIC_API_KEY` and committing to Claude Haiku. Rejected.
- **Step 8 & 9** depend on Step 7 → skipped in sequence.

---

## Research: Semantic Search Alternative

**Instead of Claude:** Use local `sentence-transformers` + `multi-qa-MiniLM-L6-cos-v1`.

**Why this model:**
- **Purpose:** Asymmetric search (short query → long passages). Perfect for job search.
- **Performance:** ~5–15 ms per query after embedding cache.
- **Cost:** Zero. Fully local. MIT license.
- **Size:** 80 MB, 384-dim.

**Implementation pattern:**
1. Add `sentence-transformers` to Python via `uv add`.
2. Create `search.py` CLI (mirroring `scraper.py` + `main.py` pattern).
   - Encodes `jobs.csv` once to `data/{profile}/job_embeddings.npz`.
   - On query: encode query string, cosine-rank, emit `jobId[]` JSON.
3. Next.js route `web/app/api/jobs/search/route.ts` spawns subprocess (same `run/route.ts` pattern).
4. Jobs page: search bar toggles text filter (instant) ↔ semantic search (Enter/button).

**Zero API calls. Zero credentials. No model lock-in.**

---

## Current Task: Step 10 — Scrape Scheduler

### What It Does

Schedule scrapes via cron (e.g., daily 8 AM). Schedule stored in `scrape_config.json` as `schedule: string | null`.

### Blocked On

Permission to run in `web/`:
```bash
pnpm add node-cron
pnpm add -D @types/node-cron
```

### Files to Create/Modify

| File | Action |
|------|--------|
| `web/lib/config.ts` | Add `schedule: string \| null` field |
| `web/lib/scheduler.ts` | Create: `Map<profile, CronJob>` registry |
| `web/instrumentation.ts` | Create: Next.js startup hook |
| `web/app/api/scrape/config` (PUT) | Re-register cron on schedule change |
| `web/app/scrape/page.tsx` | Schedule selector UI (Off / 8 AM / midnight / Monday / Custom) |
| `web/app/globals.css` | Schedule control styles |

### Todo Checklist

```
[in_progress] Install node-cron + types
[pending] Add schedule field to ScrapeConfig
[pending] Create scheduler.ts registry
[pending] Create instrumentation.ts hook
[pending] Wire PUT route to re-register
[pending] Add schedule UI to scrape page
[pending] pnpm build green
```

---

## Key References

- **Plan:** `.claude/plans/all-of-them-sequentially-lexical-whistle.md` (all 10 steps)
- **Spec:** `.claude/SPEC.md` (architecture, API routes, data model)
- **Design log:** `.claude/DESIGN-DECISIONS.md` (append-only decisions)
- **Recent commits:** `b972f6a` (stats page) … `8ee4bbe` (toast inline)

---

## How to Pick Up

**Next session:**
1. Request permission for `pnpm add node-cron @types/node-cron`.
2. Follow Step 10 checklist (config.ts → scheduler.ts → instrumentation.ts → wire PUT → UI).
3. Verify with `pnpm build` and smoke test schedule on dev server.
4. If bandwidth: scope out Step 9 (semantic search via sentence-transformers).

**Principle:** No hard dependency on a single API provider. Embeddings should be pluggable (SBERT, Hugging Face, OpenAI Embedding, transformers.js).

---

## Suggested Skills

- `asd-ste100` — always-on for all text output
- `test-driven-development` — when implementing Step 10 / Step 9
