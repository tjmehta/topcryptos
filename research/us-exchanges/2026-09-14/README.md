# Coinbase and Kraken live market inputs — 2026-09-14 UTC

User correction: TopCryptos must serve their Coinbase and Kraken trading workflow. Binance was selected for convenient OHLC research access, but that did not establish that its market universe was suitable for the user. Existing Binance backtests remain evidence about those historical Binance strategies, not validation of the user's exchanges.

## What changed

`modules/exchangeOhlc.ts` supplies separate Coinbase and Kraken snapshots to the existing pure OHLC algorithms. Daily and Hourly's saved CMC data is unaffected. No account credentials, private endpoints, trading calls or new dependencies are used.

- **Coinbase:** active USD spot intersection of Exchange products and public Advanced products. Excludes disabled, view-only, cancel-only, post-only, limit-only, auction, stablecoin and fiat products. Sorts on public `approximate_quote_24h_volume`; fixes at most 50 markets before candle eligibility. Advanced pagination follows cursors, rejects cycles, and is bounded to five pages of 1,000 products. Exchange's daily candles supply actual first-trade open/high/low/last-trade close and base volume.
- **Kraken:** spot currency AssetPairs with `country_code=US`, active USD markets only. Excludes stablecoins, fiat and dark-pool suffixes; the currency catalogue excludes tokenized assets. Uses the internal pair identity for data requests, with XBT shown as BTC and XDG as DOGE. Roster turnover is rolling ticker VWAP × base volume, with 50 markets fixed before historical eligibility.
- **USD only:** no implicit conversion between USD and USDT, no fallback to a different exchange, and no duplicate base across quote currencies. Missing/ineligible markets do not get silently replaced with lower-volume candidates.

Public listing and country filtering do not verify a particular account or state's ability to trade a market. This implementation does not import the full CMC universe, make a CMC-to-exchange identity join, or pool venues into one ranking.

## Measurement and validation limits

Coinbase does not provide quote turnover in this candle response. `quote_volume` passed to the scorer is explicitly **close × base volume**, an estimate. This affects lagged dollar-liquidity eligibility and VolumeBreakout's volume factor. Kraken turnover is reconstructed as **reported VWAP × base volume**, subject to the precision of its rounded fields. Both conventions are exposed as `volume_method` and `volume_description` metadata.

No fitted Binance target probabilities should be displayed as Coinbase/Kraken forecasts. Existing formula price levels can be computed on these candles, but they are not validated profitable exits on the new venues. A future exchange-specific historical evaluation must acquire frozen roster/identity history, actual prices and applicable costs, then test rankings, holdings and targets prospectively. Today's live roster is not a survivorship-safe historical universe.

## Time and execution semantics

The signal date is UTC today minus two days; history contains completed bars through that signal. The reference entry is today's actual opening trade price, held separately from all features. Later highs, lows and closes cannot enter signal scoring or target geometry.

The opening price is a dated reference, not a currently executable quote or a fill from the user's portfolio. Missing dates remain missing. Any missing raw date from signal through entry produces `identity-gap` rather than a made-up fill. Missing entry and zero-activity entry candles return explicit reasons. A present zero-volume intervening candle is retained as a complete observation, consistent with the prior acquisition rules. Duplicate dates, invalid prices, future timestamps, mismatched Kraken response identities, API errors and malformed responses fail the complete load.

## Operations and observations

At most four candles are in flight per venue. Starts are spaced by 150 ms to bound request rate as well as concurrency. Coinbase's first live run with concurrency alone hit HTTP 429 because responses were fast; this was corrected before final smoke verification. Rate-limit or parse failures stop allocation, drain already-started work, fail the complete result, and permit a later retry without caching the error. No partial roster or stale fallback is served.

The complete snapshot is cached ten minutes per process, deduplicated across concurrent callers, and invalidated at UTC midnight. A fetch crossing midnight fails and drains before a new load can begin. Multiple server instances or other traffic on a shared IP can still encounter upstream limits.

## Verification

Run provider regression tests:

```sh
npm test -- --runInBand modules/__tests__/exchangeOhlc.test.ts
```

The 15 tests cover USD and status filters, aliases and identity, top-50 formation, volume conventions, completed-bar isolation, future-value perturbations, gaps, inactive/missing entry, malformed candles, duplicate dates, invalid time units, rate spacing, concurrency, shared cache, UTC rollover, complete failure/drain/retry, pagination cycles, and US-filtered Kraken requests. Typecheck passed after integration with the route's new source metadata.

Read-only live replay:

```sh
node research/us-exchanges/2026-09-14/smoke.cjs
```

Recorded in [live-smoke.json](./live-smoke.json), at **2026-09-14 04:48 UTC**:

| Exchange | Requested/returned markets | Eligible at view 7 | Positive Breakout selections at view 7 | Load time |
| --- | ---: | ---: | ---: | ---: |
| Coinbase | 50 / 50 | 41 | 0 | 8.1 s |
| Kraken (US catalogue) | 50 / 50 | 31 | 0 | 7.8 s |

Both snapshots used signal **2026-09-12** and entry **2026-09-14**. The default seven-observation Breakout had no positive signal on either venue. That is a valid screen outcome, not missing data or a failed backtest. Views 3 and 4 each selected one market on both exchanges; Kraken view 5 also selected one. The artifact contains each market's actual history count, last signal date and entry availability, plus all twelve view checks. This smoke is functional verification, **not** a new return backtest.

## Official documentation reviewed

- [Coinbase Exchange products](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-all-known-trading-pairs): product identity and normal-trading flags.
- [Coinbase public Advanced products](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/public/list-public-products): public spot catalogue, approximate quote volume and cursor pagination.
- [Coinbase Exchange candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles): daily granularity, up to 300 candles, absent intervals without ticks, first/last-trade price semantics.
- [Coinbase rate limits](https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits): public 10 requests/sec per IP, bursts to 15, HTTP 429.
- [Kraken AssetPairs](https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs): USD identity, currency asset class, active status, `country_code` filter.
- [Kraken ticker](https://docs.kraken.com/api-reference/market-data/get-ticker-information): rolling 24-hour volume/VWAP fields; UTC-day and rolling fields are distinct.
- [Kraken OHLC](https://docs.kraken.com/api-reference/market-data/get-ohlc-data): daily interval 1440, at most 720 recent candles, current uncommitted candle included.

## Application verification — 2026-09-14 04:59 UTC

The live route returned ten Momentum/14 signals for each exchange, from 50 loaded markets (41 eligible Coinbase, 31 eligible Kraken). [integration-check.json](integration-check.json) records dates, source measurements and assertions that probabilities and validation metrics remain null. API execution copy describes hypothetical rules, and the UI labels entry as the UTC day open and the 30-day exit as a reference.

Browser exchange switching replaced Coinbase rankings with Kraken rankings and updated the URL. The 375px and 1280px Kraken layouts had no horizontal page overflow. See [design record](../../../DESIGN_REVIEW.md). Full Jest: 185 tests; final affected suites: 26 tests; typecheck and production build passed. These checks validate implementation and data loading, not profitability or exchange-specific strategy performance.
