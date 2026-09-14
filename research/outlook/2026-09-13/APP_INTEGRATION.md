# OHLC app integration — September 13, 2026 UTC

The user requested both the verified research interface and integration of OHLC rankings and target outlooks into TopCryptos. The app adds `/breakouts`, reachable from the Daily and Hourly navigation, and `/api/rankings/ohlc`. This is an experimental current venue screen; no trading or deployment is part of this change.

## Data and population

The provider reads Binance's anonymous [market-data-only REST endpoint](https://github.com/binance/binance-spot-api-docs/blob/master/market-data-only.md), `https://data-api.binance.vision`. This is separate from the historical archive used in the local research. No archive ZIPs are served by the app.

The live universe is up to 50 currently trading Spot USDT pairs ordered by current rolling 24-hour quote volume, using the research's explicit stable-base exclusions and structured leveraged-product exclusions. It is selected when the screen is fetched. **It is not the fixed prior-December annual universe from the backtests, nor a historical point-in-time universe at the signal or entry open.** The API and UI retain the universe selection timestamp and disclose this population difference. No historical portfolio return is attached to a current screen as its expected performance.

Formation uses complete daily OHLC bars through UTC today minus two days. The actual UTC-today entry open is read independently; an absent valid open produces no entry-based outlook. The current day's high/low/close are never used in the signal or level geometry. Every rank request uses one shared signal date. Insufficient 60-day history, missing daily bars, or inadequate lagged quote volume makes an instrument ineligible. A failed or malformed provider response fails the complete screen rather than silently ranking a smaller universe.

Four concurrent upstream requests and a ten-minute in-memory cache bound repeated work. The cache is keyed by UTC day and concurrent callers share the same load. There is no persistent archive, provider credential, upstream trading call, or automatic order. The dated input screen is explicitly a current calculation with past entry references; it is not a claim that these predictions or the current roster existed at that past open.

## Algorithms, exits and inference

`modules/ohlcAlgorithms.ts` implements the verified Python rank/outlook rules in the application's TypeScript runtime, without a Python subprocess. Supported views are 3/4/5/6/7/10/14/21/30/45/60/90 daily observations; supported algorithms are Momentum, Breakout and VolumeBreakout. Positive scores select at most ten pairs, each corresponding to a 10% slot, with unused slots unallocated. The exact formulas, eligibility and target-event definitions are documented in [the reusable interface](README.md).

H30 is a primary research candidate only for seven-observation Breakout. Other method/view combinations display it as an evaluated reference, not a validated optimal sell period. ATR/resistance levels are scenarios; there is no automatic sale at a target touch. The actual tested alternative exit needed a closing-price confirmation and filled two days later, capped by H30.

The server imports `modules/data/ohlc-models.json`. It contains the unchanged 74 historical fits plus two newly trained September 2026 fits. `export-current-model.py` uses only known full-H30 outcomes whose deadlines precede the requested cutoff. The September fits use 52,017 / 52,020 observations with the latest training deadline **2026-02-01**. Cutoff, latest training outcome, actual creation time and current-period calibration status remain separate. No September performance claim is made from the 2023–2025 metrics.

The model estimates a daily high reaching the target before the hard deadline, including paths that already hit a stop or sold. It does not estimate target-before-stop, executed profit, return from the current quote, or future market-cap rank. An exact entry-month fit is required. When the month advances beyond the exported fits, prices and levels remain available but probabilities are null until a new dated fit is exported and reviewed.

## Verification record

- The original Python interface passed 14 boundary tests, 148 historical outlooks over all 74 fits, 216 full-universe rankings and 10,908 eligibility/score comparisons.
- The current-fit export independently checked 104,278 scalar probabilities with maximum absolute difference below 2.23e-16; [current-model-export.json](current-model-export.json) records hashes and checks.
- Final application checks passed: **19 suites, 149 tests, 11 snapshots**, typecheck and production build. The TypeScript core matches **36 historical universe rankings and 148 complete outlooks**. Nine provider tests cover parsing, continuity, incomplete responses, concurrency, cache and retry; six API tests and thirteen UI tests cover end-to-end presentation boundaries.
- Live provider verification returned **50/50 instruments and 50 entry opens** at 21:16:42 UTC, with signal date September 11 and entry reference September 13. Desktop and 390px mobile browser checks confirmed current output, algorithm/window navigation, H30 reference labels, and no horizontal overflow.
- [app-verification.json](app-verification.json) records these results and implementation hashes. [Desktop](browser/topcryptos-ohlc-desktop.png) and [mobile](browser/topcryptos-ohlc-mobile.png) screenshots preserve the observed screens. The current displayed estimates are not completed forward backtests.

## Reproduction

```sh
npm test -- --runInBand
npm run typecheck
NODE_ENV=production npm run build
USE_FS_CACHE=true npm run dev
```

Visit `/breakouts?d=7&algo=Breakout`. The new OHLC path needs no Binance API key. Existing CMC application configuration remains required by the wider app's existing routes/build. The Python research environment and library lock are documented in [Trading libraries](../../trading-libraries/2026-09-13/README.md).

## Follow-up: empty local Daily/Hourly charts

On September 13 the user reported an empty chart at `dev.local:3038`. Browser inspection reproduced zero drawn paths on the default Daily/10 and Hourly/6 views. The local CMC snapshot cache stopped at September 11 04:12 UTC; the current quote came from the CoinGecko fallback with slug IDs, so it could not join the numeric CMC historical IDs. Freshness eligibility correctly excluded the stale series.

Refreshed the local cache using the existing seed script (`--days 9 --hours 24`), writing 33 public-feed snapshots. Then fixed the shared CMC local reader: under `USE_FS_CACHE=true`, a non-cron live request first uses a native CMC snapshot at most one hour old. It searches adjacent rounded-hour keys and validates actual quote time, including the rounded-up key used by live snapshots after :30. Future, stale, invalid or non-CMC snapshots are not reused. Production and cron requests retain their upstream behavior. Snapshot refresh remains an explicit local-development operation, not an automatic collector.

Eight regression cases cover rounded-up keys, latest actual quote selection, stale/future/invalid/other-provider data, production and cron paths. Browser checks after the fix showed 30 responsive chart paths and no empty-history message on both default Daily and Hourly pages. The scoring thresholds and historical algorithm definitions were unchanged.
