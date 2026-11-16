# jobspy-cli web app

The web interface for jobspy-cli. It is a [Next.js](https://nextjs.org) app (App Router, TypeScript, Tailwind CSS). It runs the Python scraper as a subprocess and keeps all data in flat files under `../data/<profile>/`.

This app has no login and no database. Run it on your own computer only.

## Getting started

Install Node.js and pnpm (the pnpm version is pinned in `package.json`). Then:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Create a profile on the Profile page first.

The scraper needs the Python environment. From the repository root, run `uv sync` once.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start the development server |
| `pnpm build` | Make a production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run the Vitest unit tests |

## Pages

Profile, Resume, Scrape, Jobs, Applications (Kanban, Table and Gantt views), Archived and Statistics.

## Data and tests

- Data folder: `../data/<profile>/`. Set `JOBSPY_DATA_DIR` to use a different folder.
- Tests are in `tests/`. They use a temporary data folder through `JOBSPY_DATA_DIR`. They never touch the real `data/` folder.

## More information

- Spec, data model and API routes: [`../.agents/SPEC.md`](../.agents/SPEC.md)
- Design decisions: [`../.agents/DESIGN-DECISIONS.md`](../.agents/DESIGN-DECISIONS.md)
- This version of Next.js has breaking changes. Read [`AGENTS.md`](AGENTS.md) before you use a Next.js API you do not know.
