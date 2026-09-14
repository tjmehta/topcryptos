# Coin outlook UX proposal

Recorded September 14, 2026 UTC. Update 06:14 UTC: the watch-strip → inline/bottom-sheet interaction is implemented locally. The forecast-horizon/probability interaction below remains a proposal; current evidence only supports descriptive outcomes and observed levels. See [implementation record](coin-outlook/2026-09-14/APP_INTEGRATION.md).

## User need

The user questioned the calendar-based Exit timing panel. Their intent is to select a viewed interval, discover strong coins with our algorithms, then understand future return/rank potential, price levels and the time over which those outcomes might happen. Starring could expose further coin-specific information. A manual date calculator answers too little of that question.

## Proposed interaction

Rankings
- Change algorithm/view → recompute current discovery ranking.
- Star → preserve existing chart highlighting and pin the coin in a compact watch strip.
- Open a coin or pinned item → Coin outlook, retaining current algorithm/view context.
[ discovery score, current market-cap rank, observed price change ]

Coin outlook
- Choose forecast horizon → show the corresponding supported event probabilities.
- Expand Evidence → sample support, covered dates, validation and assumptions.
- Optionally enter an actual entry price/time → position-relative context, not required for discovery.
- Close → return to the same chart/table position; star status persists.
[ selected-history context; future return thresholds; market-cap-rank milestone; observed trend/volatility; supported price zones; as-of time and source ]

Desktop: detail panel adjacent to or below the chart, above the long ranking list. Mobile: tap the compact pinned strip to open a bottom sheet. Do not bury details after 100 coin rows or force a modal to open on every star.

## Forecast semantics

- Viewed history forms the signal. Forecast horizon measures the subsequent outcome; a 7-day view does not imply a 7-day hold or a fixed multiplier.
- Primary event reflects the user's goal: future price gains, such as reaching +20% within a stated horizon. Secondary event: reaching an explicit market-cap-rank threshold within that horizon. Neither is an executed return.
- Market-cap rank and our algorithm score/rank must have separate labels. Market-cap-rank improvement can occur while price falls. Our algorithm rank changes with the scoring universe and hidden-coin exclusions. Exchange filtering only changes the display.
- Distinguish touching an event at any saved observation from ending the horizon above the threshold. With snapshots, describe observed reaches; do not imply detection of every intraday touch.
- Show only future horizons with adequate mature outcomes and calibrated validation. Never fill a mockup with fabricated probabilities. Insufficient support is an explicit state.
- ATR requires appropriate OHLC bars. Native CMC snapshots do not establish intraday high/low; exchange candles require verified coin identity and horizon coverage. Any extra indicator warmup must be separate from the selected scoring window.
- A ranking score remains discovery strength. Do not add a user's entry price, star state, or arbitrary exit levels to it. A future expected-return score is a separate candidate that needs its own replay before adoption.

## Evidence and delivery limits

Existing native evidence describes top-ten baskets on matching entry dates, not calibrated per-coin rank or return probabilities. Existing Binance target forecasts do not validate CMC or Coinbase/Kraken outcomes. Prior tested automatic selectors and generic bracket exits did not establish a universally better policy. A richer UI does not resolve those research limits.

Required evaluation: point-in-time universes, chronological training/evaluation, overlapping-label separation, mature outcome accounting, missing/delisted coin handling, base-rate comparisons and calibration by horizon. The current limited CMC history may not support useful percentages, especially at long horizons or for narrowly conditioned setups.

General exit-planning reference: [Fidelity, exit strategies](https://www.fidelity.com/learning-center/trading-investing/trading/exit-strategies) describes condition-based exits and time-based reassessment. This is background, not validation of a TopCryptos policy.

## Follow-up: ranks as resistance

The user clarified that they had understood market-cap ranks as possible resistance levels and expected empirical analysis to inform the product. A [dated diagnostic](rank-levels/2026-09-14/README.md) now tests approach/cross behavior using our CMC history. Independent SQL membership and Decimal outcome verification passed for 4,793 records and 72 cells. It does not establish special resistance at 50/100, and shows why reaching and holding a rank must be separate outcomes. In seven-observation windows, 27.0% of observed rank improvements coincided with flat/falling prices. This supports showing rank and price outcomes together; it does not supply calibrated individual-coin probabilities.
