# jobspy-cli — Feature Roadmap

## Status

| # | Feature | Status |
|---|---------|--------|
| 1 | Parallel scraping | Done |
| 2 | Incremental upsert across runs | Done |
| 3 | Output filtering | Done |
| 4 | Job scoring + sort | Deferred — after semantic CV/JD matching |
| 5 | Application tracker | Superseded — web app owns this |
| 6 | Cover letter / gap analysis via Claude API | Planned — web app, Resume page |
| 7 | Daily scheduled run + digest | Planned — web app, Scrape page |
| 8 | Web UI | In progress — Next.js, see SPEC.md |
| 9 | Semantic job search | Planned — web app, after Resume page |

---

## Web App Build Order

The web app is the active workstream. See `.agents/SPEC.md` for the full architecture.

### Phase 1 — Foundation

1. **Lib layer** (`web/lib/`)
   - `csv.ts` — read/write `data/{profile}/jobs.csv` as typed objects
   - `profile.ts` — list profiles, resolve active profile from cookie, create profile
   - `config.ts` — read/write `data/{profile}/scrape_config.json`
   - `scrape-status.ts` — read/write `data/{profile}/scrape_status.json`

2. **Profile page + cookie** (`web/app/profile/`)
   - Create and switch profiles
   - Session cookie stores active profile name

3. **Navbar + layout** (`web/app/layout.tsx`)
   - Links: Scrape / Jobs / Applications / Resume / Profile
   - Active profile chip

### Phase 2 — Core pages

4. **Jobs page** (`web/app/jobs/`)
   - Read `jobs.csv`, render table
   - "Shortlist" button — sets `status=shortlisted`, `status_updated_at=now`

5. **Scrape page** (`web/app/scrape/`)
   - Config form pre-filled from `scrape_config.json`
   - "Run scrape" button — `POST /api/scrape/run`
   - Progress polling — `GET /api/scrape/status` every 5s
   - Diff summary on completion
   - Scrape history

6. **Applications page** (`web/app/applications/`)
   - Filter: `status != ""`
   - Views: table, kanban (grouped by status), Gantt, statistics

### Phase 3 — Resume + AI features

7. **Resume page** (`web/app/resume/`)
   - CV upload (PDF or Markdown) → `data/{profile}/cv.pdf`
   - CV preview inline

8. **Gap analysis** — Claude API
   - Requires `description` column populated (LinkedIn fetch description)
   - Prompt: cover letter + gap analysis per job vs CV

9. **Semantic search** — sentence-transformers
   - Embed job descriptions
   - Rank by cosine similarity to CV or query

10. **Job scoring** — after semantic matching
    - Score = recency + salary + seniority fit + remote + semantic similarity
    - `score` column added to CSV, CSV sorted descending

---

## Python Engine — Remaining Work

| Item | Notes |
|------|-------|
| `scrape_status.json` writer | Python subprocess writes status on start/end/error |
| `--fetch_description` flag | Removes `description` from BLACKLIST; needed for gap analysis |
| `--save_path` as absolute path | Web app will pass an absolute path; CLI default stays `./jobs.csv` |

---

## Known Constraints

- Glassdoor works on python-jobspy 1.4.1 (three live probes on 2026-11-05); Cloudflare can still block it
- ZipRecruiter returns 403 from this IP — geo-block, not a code issue
- Concurrent scrape runs against the same profile are not supported
- Job scoring deferred until semantic CV/JD matching is available

---

## Application Flow Sankey (2026-11-05)

Goal: show how applications move between stages, from the status log, as a Sankey on the Statistics page.

Decisions:

- Forward-only links. Rank: Untriaged, Shortlisted, Applied, Interview, Offer, Rejected. A backward move is not drawn; a note says so.
- Skipped is excluded. It is an archive action, not a stage.
- `d3-sankey` for layout, rendered as an inline SVG like the Gantt.
- The Statistics page fetches `/api/jobs/log` next to `/api/jobs`. A failed log fetch leaves the card with its empty state and does not fail the page.

Steps, each its own commit:

1. `web/lib/sankey.ts` - `buildSankey(entries)`: forward-only link counts, node list in rank order, skip unknown or self links. Tests first.
2. Layout function with a capped pixel width per move, so the bands stay thin and the chart height follows the counts. Tests first.
3. `web/components/sankey-chart.tsx` - SVG nodes, links and labels; empty state. Tests first.
4. Wire the Flow section into the Statistics page. Tests first.
5. Gate: `tsc`, `pnpm test`, `pnpm lint`, `pnpm build`; update SPEC, DESIGN-DECISIONS, HANDOFF. - Done 2026-11-05.
