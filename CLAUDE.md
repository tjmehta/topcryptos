# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

**topcryptos** (package name `cryptovisualize`) — a Next.js site that ranks and visualizes
top-performing cryptocurrencies over a trailing window. It scores each coin from the
velocity/acceleration of its price, market cap, and market-cap rank, then renders a D3
"spaghetti" chart of rank-over-time alongside a sortable table.

Scores are **signed percentile ranks** of coverage-adjusted velocity (70%) plus price/rank
acceleration sums (20%/10%) — see `processRankings.ts`. Coins without enough history in
the window (`MIN_QUOTES_TO_SCORE`, `MIN_COVERAGE_TO_SCORE`) get `NAN_SCORE`, sort last,
and render as a "New" badge instead of a rank — a newly listed coin's 4-hour pump must
not outrank coins measured over the full window.

- `/` — daily rankings (3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90 days)
- `/hourly` — same view on an hourly window

Both pages are thin wrappers over `components/RankingsView.tsx`.

## Stack

Next.js 16 (Pages Router, Turbopack) · React 19 · TypeScript 5 (`strict: false`,
`strictNullChecks: true`) · Tailwind 4 · shadcn/ui · TanStack Table · D3 v7 · RxJS 7 ·
Jest 30 · Node 22.

## Architecture

```
Vercel Cron (hourly)              Web request
       |                               |
cmc.listings({hourlyCron})   pages/api/rankings/{daily,hourly}.ts
       |                               |  fan out N days/hours in parallel
       v                               v
   S3 / FS store  <-------------  cached snapshots (read-only path)
                                       |
                                 modules/topCryptos.ts (browser fetch, chunked)
                                       |
                                 modules/processRankings.ts (RxJS scoring)
                                       |
                              RankingsChart (D3) + RankingsTable (TanStack)
```

**The web app never calls upstream APIs for historical data.** It only reads snapshots the
cron previously wrote. A miss on a given bucket silently drops that data point
(`.filter((v) => v != null)`), so the chart renders with fewer points rather than erroring.

### Files that matter

| Path | Role |
| --- | --- |
| `modules/uiTypes.ts` | Wire types (`Listings`, `RankingsResponse`). **Runtime-import-free on purpose** — see the note in the file. |
| `modules/coinmarketcap.ts` | CMC client + store-backed cache. Primary source. |
| `modules/coingecko.ts` | CoinGecko client + `toCMCListing()` shim. Only when `USE_COINGECKO_API=true`. |
| `modules/cache.ts` | `cache(opts, task)` wrapper + `cacheKey(name, opts)`. |
| `modules/S3Store.ts` / `modules/FSStore.ts` | Snapshot persistence, selected by `USE_FS_CACHE`. |
| `modules/processRankings.ts` | Scoring engine. RxJS: quotes → grouped → pairwise velocities → accelerations → score. |
| `modules/exchangeMap.ts` | Pure exchange↔coin join logic (CMC ids ↔ CoinGecko slugs). |
| `modules/exchangeStore.ts` | Persistence + the client-facing projection (`toClientMap`). |
| `modules/coingeckoExchanges.ts` | CoinGecko exchange/ticker client with 429 backoff. |
| `components/RankingsView.tsx` | The whole page: fetching, state, controls, layout. |
| `components/RankingsTable.tsx` | TanStack Table + shadcn table. |
| `components/RankingsChart.tsx` | Score → stroke width + opacity; selected lines go yellow. |
| `components/D3Chart.tsx` | Responsive SVG host (ResizeObserver). |
| `cron/crons/` | Legacy DigitalOcean cron. Superseded by Vercel Cron. |

## Commands

```bash
npm run dev         # next dev
npm run build       # next build  (see NODE_ENV gotcha below)
npm test            # jest — 63 tests, all green
npm run typecheck   # tsc --noEmit
npm run build-cron  # tsc for the legacy DigitalOcean cron only
```

### Local development without production credentials

`CMC_API_KEY` and the `AWS_S3_*` vars are legacy **Encrypted** Vercel variables — write-only,
so `vercel env pull` returns empty strings for them and nothing that touches the data path
will start. To work around that, seed the FS cache from the public production API:

```bash
node scripts/seedLocalCache.mjs --days 30 --hours 12
USE_FS_CACHE=true npm run dev
```

`.env.local` then only needs inert placeholder values (`env-var`'s `.required()` just checks
for non-empty). The seeded `.cache/` is gitignored.

### ⚠️ NODE_ENV gotcha

This machine's `~/.zshenv` exports `NODE_ENV=development` globally. That makes
`next build` fail with the misleading error *"`<Html>` should not be imported outside of
pages/_document"* — nothing is wrong with the code. Build with:

```bash
NODE_ENV=production npm run build
```

Vercel is unaffected (it sets `production` itself). `next build --debug-prerender` also
sidesteps it, and is the way to unmask any *genuine* prerender error, since Next reports all
of them as that same `<Html>` message.

## Environment

Read at **module load time** via `env-var`, so a missing one throws on import:

| Var | Required | Notes |
| --- | --- | --- |
| `CMC_API_KEY` | yes | Currently the **free Basic plan** — 15k credits/mo, 50/min. |
| `CACHE_STORE_DIR` | yes | Required even in S3 mode |
| `AWS_S3_*` (4 vars) | yes | All `.required()` in `S3Store.ts`, which `coinmarketcap.ts` imports unconditionally — needed even when `USE_FS_CACHE=true` |
| `CRON_SECRET` | prod | Cron routes require `Authorization: Bearer $CRON_SECRET` |
| `USE_FS_CACHE` | no | `true` → local `.cache/` instead of S3 |
| `USE_COINGECKO_API` | no | `true` → prefer CoinGecko |
| `CG_API_KEY` | no | Free CoinGecko **Demo** key. Unset works, just converges slower. |
| `CG_TOP_EXCHANGES` / `CG_EXCHANGES_PER_RUN` / `CG_TICKER_PAGES` | no | Exchange-map cron tuning |

## Deployment

- **Web**: Vercel, project `offln/topcryptos` → https://topcryptos.io
- **Cron**: Vercel Cron via `vercel.json` → `/api/cron/hourly-listings` at `5 * * * *` (UTC).
  Crons run on **production deployments only**.

  The schedule must stay in the `:00`–`:29` window. Snapshots are keyed by
  `roundToHour(last_updated)`, which floors below `:30` and ceils at or above it, so a job
  running at `:35` would file into the *next* hour.

- **Cron**: `/api/cron/exchange-map` at `35 * * * *` — rebuilds the exchange filter's map.

  ```bash
  vercel crons ls
  vercel crons run /api/cron/hourly-listings   # Vercel injects the secret
  vercel crons run /api/cron/exchange-map
  ```

- **Legacy**: `cron/crons/` + `Dockerfile-cron` are the old DigitalOcean container. Safe to
  delete once DO is decommissioned.

## Known rough edges

- **Local dev: live listings fall back to CoinGecko and their ids don't join.** With the
  placeholder `CMC_API_KEY`, the live (no-date) fetch fails over to CoinGecko, whose shim
  emits slug string ids (`"bitcoin"`) while cron snapshots carry CMC numeric ids. Every
  coin then splits into two groups client-side; single-quote groups get dropped, so coins
  can be missing or mis-scored **only in local dev**. Production uses CMC for both paths.

- **1MB response cap.** `topCryptos.getDailyRankings` issues 10 parallel requests of 9 days
  each rather than one 90-day request (commit `70908cf`), and both cached readers blank
  `tags` on every listing. Don't collapse these back into one request.
- **`hourlyCron` is part of the cache key.** Snapshots are written under keys containing
  `"hourlyCron":"true"` (it leaks from the fetch opts into `cacheKey`). Any new read path
  must include the flag or it silently never matches — this was a live bug that left
  `/hourly` blank for years while the data sat in S3. Don't "clean it up" out of the key
  without migrating every existing S3 object. `modules/__tests__/cache.test.ts` guards this.
- **`compareDates` uses local date parts** (`getFullYear`/`getMonth`/`getDate`), so day
  windowing depends on the viewer's timezone — a 23:00 UTC snapshot lands on the next day
  for anyone east of UTC. Jest pins `TZ=UTC` so tests are deterministic. Not yet fixed.
- **`.cache/` has 414 pre-existing tracked files (~137MB)** from 2020–2021, committed before
  the directory was gitignored. Still tracked; removing them is a separate decision.
- **The exchange map converges over several cron runs, by design.** Keyless CoinGecko
  hard-429s after ~3 calls, so `/api/cron/exchange-map` refreshes only the two most overdue
  exchanges per run and merges into stored state; a 20-exchange map takes ~10 hourly runs to
  fill in. Setting `CG_API_KEY` to a free Demo key (30 req/min) and raising
  `CG_EXCHANGES_PER_RUN` / `CG_TICKER_PAGES` converges it much faster with no code change.
  - `roster` is persisted separately from `exchanges` on purpose. `buildExchangeMap` drops
    exchanges that resolved to no coins, so storing the built list as the roster would
    permanently shrink it to whatever had data on the first run.
  - CMC cannot back this filter: its market-pairs endpoints are 403 on the free plan, and
    `exchange/assets` (which *is* allowed) reports custody holdings rather than listings — it
    covers only ~69% of the top 500 and returns nothing at all for Kraken.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
