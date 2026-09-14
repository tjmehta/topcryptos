# Frozen protocol: external BTC/ETH monthly timing validation

Written before downloading the study data or calculating any outcome. This is a retrospective, fixed-rule timing study on two large surviving assets. It is not a top-500 ranking backtest, a point-in-time cross-sectional universe, or prospective validation.

## Question and scope

Test whether simple trailing **1, 3, 6, and 12 calendar-month** positive-price-return signals reduce drawdown or improve net wealth versus buy-and-hold for BTC and ETH, both individually and as a fixed ensemble. Use all available eligible history and report the final 24 completed monthly holding periods separately. Do not optimize a regime rule, thresholds, horizons, weights, costs, start date, or asset selection after seeing outcomes.

BTC and ETH are deliberately a minimum feasible external check: they have long, liquid Binance histories and true daily OHLC data. They were selected retrospectively and are major survivors. Results cannot establish performance for historical global top-500 coins, inactive coins, newly listed coins, or a point-in-time tradable universe.

## Source and immutable input rules

Use only Binance's official public archive at `https://data.binance.vision/`:

- `BTCUSDT`, daily Spot klines, monthly ZIP objects beginning 2017-08.
- `ETHUSDT`, daily Spot klines, monthly ZIP objects beginning 2017-08.
- Deterministic object pattern: `data/spot/monthly/klines/{SYMBOL}/1d/{SYMBOL}-1d-{YYYY-MM}.zip`.
- Download adjacent `.CHECKSUM` objects and require SHA-256 equality before parsing.
- Stop at the latest complete archive month common to both symbols when the run occurs. Never use a partial current-month daily archive.
- Preserve raw ZIPs and checksum files only under `research/algorithm-comparison/external-data/` and never overwrite an existing object with different bytes.
- Record source URLs, archive SHA-256 values, downloaded byte sizes, and the runner/protocol SHA-256 values in output.
- Total download must remain below 30 MB. No API key, account, package install, production application endpoint, or project cache is allowed.

Binance Spot kline CSV fields are fixed as: open time, open, high, low, close, volume, close time, quote-asset volume, trade count, taker-buy base volume, taker-buy quote volume, ignore. Parse prices as decimal numbers only after retaining their source strings in validation metadata.

Binance documents a Spot archive timestamp-unit change on 2025-01-01: earlier values are milliseconds and later values are microseconds. Normalize each timestamp by magnitude and verify that the normalized UTC dates and bar durations are plausible.

## Input validation

For each symbol:

1. Require exactly 12 CSV fields per non-empty row and finite, strictly positive OHLC values.
2. Require `high >= max(open, close)`, `low <= min(open, close)`, and `low <= high`.
3. Normalize milliseconds/microseconds to UTC milliseconds. Require unique, strictly increasing open timestamps after sorting; report source-order violations and duplicate timestamps rather than silently choosing a row.
4. Require one daily bar per UTC calendar date in the retained span. Report missing dates, extra dates, and any gap exceeding one day. Do not synthesize prices.
5. Require each bar's normalized close time to be after its open and approximately one day later (allowing the archive's inclusive final micro/millisecond convention).
6. Verify the documented unit split: rows before 2025 use millisecond-scale timestamps and rows from 2025 onward use microsecond-scale timestamps. Report exceptions.
7. Report the first/last observation, count, gaps, duplicates, archive months, and archive/checksum failures for each symbol.
8. Use only the common sequence of complete monthly holding periods for combined BTC/ETH summaries. Individual summaries may begin at each asset's own first eligible signal, but no asset is expected to differ here.

## Signal dates and calendar clamp

A decision date is the final available daily bar in each UTC calendar month. A horizon `h` in `{1,3,6,12}` uses:

- current price: that decision month's final daily **close**;
- reference month: exactly `h` calendar months earlier, with year/month arithmetic;
- reference price: the final available daily close inside that reference calendar month.

This is the calendar-month clamp: compare month-end observations by calendar identity rather than subtracting a fixed number of days. If either required month has no observation, the signal is unavailable; do not reach into a neighboring month.

Signal `h` is 1 when `current_close / reference_close - 1 > 0`, otherwise 0. Equality and valid zero return map to cash. No volatility scaling, neutral band, look-ahead filter, or missing-value imputation is allowed.

## Strategies and execution

For each asset, predeclare six strategies:

- `timing_1m`, `timing_3m`, `timing_6m`, `timing_12m`: asset weight is the corresponding binary signal.
- `ensemble`: equal fixed vote, asset weight = `(signal_1m + signal_3m + signal_6m + signal_12m) / 4`, hence one of 0, 0.25, 0.5, 0.75, 1.
- `buy_hold`: asset weight 1 throughout the comparable period.

The comparable start is the first decision at which all four signals exist. The decision uses that month-end close. Entry or rebalance occurs at the **next daily open**, which is present in Binance daily OHLC. The weight remains fixed until the next month's post-decision daily open. Holding periods are non-overlapping open-to-open intervals. A period is omitted unless both execution opens exist.

Cash earns 0%. No leverage, shorting, borrowing, staking, tax, spread, slippage, market impact, funding, or stablecoin depeg model is included.

For prior post-return asset weight `w_prev_drift` and target weight `w_target`, traded notional as a fraction of pre-trade wealth is `abs(w_target - w_prev_drift)`, where `w_prev_drift` is the prior target weight drifted by the realized asset return relative to cash. The first allocation starts from cash. Cost is `cost_rate * traded_notional` for cost rates 10, 50, and 100 bps **per side**. Thus a full buy and later full sale each incur one side; there is no blanket round-trip charge every month. Gross results use zero cost.

Portfolio evolution for a holding period first applies the month's asset/cash return at the existing target weight, then charges the next rebalance cost against pre-trade wealth at the next open. For reporting final wealth, charge a final liquidation from the drifted asset weight to cash at the last execution open. Apply the same convention to buy-and-hold. Report turnover as the sum of absolute traded-notional fractions, including initial entry and final liquidation, and average exposure as time-weighted target weight across monthly holding periods.

## Outcomes

For each symbol, strategy, and cost scenario (gross, 10, 50, 100 bps per side), report:

- start/end execution timestamps and completed monthly periods;
- terminal wealth from 1.0 and cumulative return;
- CAGR using actual elapsed days;
- maximum drawdown from the execution-date wealth path;
- annualized volatility from monthly portfolio returns using `sqrt(12)` (descriptive, no IID inference);
- average target exposure;
- total traded-notional turnover and average monthly turnover;
- per-calendar-year return, maximum drawdown, exposure, and turnover;
- the same metrics for the chronological final 24 completed holding periods, re-indexed to wealth 1.0 while preserving the strategy state and charging costs only for trades actually occurring inside that slice; disclose this slice is fixed evaluation, not a prospective holdout.

Also report monthly gross asset return, each signal, target weights, trades, costs, and wealth paths in machine-readable output.

## Exposure/beta interpretation

Any timing strategy with average exposure below 1 mechanically has lower market beta and may show smaller drawdowns simply by holding cash. Report exposure and compare wealth/drawdown jointly; do not label lower volatility or drawdown as alpha. No regression alpha is claimed from two highly selected assets.

## Regime description only

Label each holding period using the **lagged, decision-time BTC 12-calendar-month return**: `positive_12m` if greater than zero, otherwise `nonpositive_12m`. Summarize subsequent strategy and asset returns by label. This label is descriptive and is not optimized, not a current-cycle high/low detector, and not added as another trading rule. Cycle peaks and troughs are not treated as knowable in real time.

## Inference and interpretation limits

Do not run IID daily t-tests. A simple month-block bootstrap may be added only if implementation remains small, but it is optional and cannot repair survivor selection or retrospective asset choice.

The final interpretation must state:

- BTC and ETH were selected with hindsight and survived; this is a regime/timing sanity check only.
- Binance `BTCUSDT` and `ETHUSDT` histories start in 2017 and omit earlier market regimes and other venues.
- USDT quote returns are not USD risk-free excess returns and cash is idealized at zero interest.
- Exchange archives preserve old pair files better than current-symbol APIs, but archive discoverability is not a point-in-time listing-status feed and does not supply delisting returns for a global universe.
- Split/token migrations, renamed symbols, redenominations, forks, exchange delistings, and inaccessible markets require explicit identity/event handling in any future multi-asset study.
- Current-symbol selection creates survivorship bias; requiring 12 months of history additionally creates listing-age/seasoning bias and excludes young assets precisely when they may have extreme returns.
- All-time retrospective results and the final-24-month slice are not prospective validation. No production ranking claim follows from this study.
