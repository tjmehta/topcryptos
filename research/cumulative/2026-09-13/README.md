# Cumulative and Hybrid — September 13, 2026 UTC

The user requested plain algorithm options without an Experimental tag, retaining Classic, and making Cumulative the default only if backtests support it. They clarified that Cumulative should describe strength **within the selected interval**, with a hybrid acceptable if it performs better.

## Exact meaning

- **Momentum** already measures endpoint price return over the selected window. Compounding the successive returns would reproduce this same result.
- **Cumulative** measures the average log-price gain sustained through that window. Integrate `log(price / first observed price)` with trapezoids weighted by actual elapsed quote time, then divide by the full requested window duration. Missing edge coverage adds no area. Existing coverage, cadence, gap and freshness eligibility still apply.
- **Hybrid** is a fixed 50/50 blend of the existing signed percentile Momentum score and the signed percentile Cumulative score. Normalize the components separately among the same eligible visible population before combining them. There is no weight search or outcome-trained parameter.
- **Trend quality** remains the direction and consistency of the fitted log-price slope. Classic remains an available weighted price/rank algorithm.

An early rise that holds and a final-observation spike can have identical endpoint returns but different Cumulative values. For equally spaced prices `[100, 200, 200]` versus `[100, 100, 200]`, the time-average log gains are `0.75 × log(2)` and `0.25 × log(2)`. Normalization translates their relative strength into the app's score scale; it does not turn the score into a predicted return or probability.

A rise that later fades can still have positive Cumulative strength, including when its endpoint return is negative. This is intentional and must be included in loss/hit evaluation. Integrating past gains does not itself prove better early discovery or future returns.

## Numerical review before the final runs

Independent review found that cancellation in the mathematically zero-area path `[100, 200, 100, 50, 100]` produced tiny negative floating-point dust, which signed percentiles could amplify. The final helper reuses the existing relative roundoff guard: an absolute accumulated area no larger than `32 × Number.EPSILON × sum(abs(trapezoid contributions))` becomes zero before division. Scaled versions remain zero; a real small positive gain remains positive. This is a numerical correction to the fixed formula, not an outcome-selected strategy variant.

The final replay pins `modules/processRankings.ts` SHA-256 `208a534f4dff743833c7cc3d263bb6341c5338f9e62546b49bb223d8a6aa33aa`.

## Comparison scopes

The [CMC protocol](cmc-protocol.md) compares the actual app's five algorithms on the same snapshots, next-snapshot entries, holds, ten-slot allocations, costs and missing-data scenarios. The default-adoption diagnostic was fixed before outcomes: later-date gains versus both current Classic and Momentum, cost stress, removal of the best paired date, majority date wins, and breadth across supported views. Daily and Hourly are evaluated separately. The short CMC history supports retrospective diagnostics, not a claim of general multi-regime superiority.

The [venue protocol](venue-protocol.md) evaluates the price-only Cumulative/Hybrid signals on the longer fixed annual Binance cohorts, using complete daily OHLC history, existing liquidity eligibility, H30, delayed entry and 32 capital starting phases. It compares positive-only Momentum and Breakout baselines and an explicitly labeled signed Momentum count-matched diagnostic. This population cannot validate Classic's market-cap-rank inputs or the current rolling-volume app universe.

Existing data and prior study outcomes have been viewed. These new retrospective studies are not untouched holdouts. Frozen prior ledgers, runner files and algorithm definitions remain intact. No Cumulative/Hybrid target probabilities are inferred from forecast metrics for other methods.

## Application delivery

Daily and Hourly expose Classic, Momentum, Trend quality, Cumulative and Hybrid as normal algorithm options. URLs use `algo=cumulative` and `algo=hybrid`. Experimental labels were removed from these menus/descriptions and the separate Breakouts heading/metadata; factual data and model-support descriptions remain. **Classic remains the default in both modes.** Neither candidate met the global promotion criterion, which requires both mode gates.

Scalar tests cover known integrals, scale invariance, elapsed-time weighting, sampling invariance, cancellation, actual small gains, normalized hybrid blending and future-prefix invariance. Existing signed-loss, flat-price and insufficient-history cases cover both new algorithms. All 163 tests and 11 snapshots pass across 20 suites; TypeScript and the production build pass.


## Results and default decision

The exact [CMC replay](cmc-notes.md) captured 166 cache files: 71 daily observations from July 4 through September 12, 2026 and six separate hourly blocks. It evaluated 4,645 cohorts across the supported view/hold grid. These overlapping retrospective observations are not independent trials or an untouched holdout.

| Predeclared comparison | Cumulative | Hybrid |
|---|---|---|
| Daily, view 10 / hold 7 days | Fails promotion gate | Fails promotion gate |
| Hourly, view 6 / hold 3 hours | Passes promotion gate | Passes promotion gate |
| One default across both modes | Fails | Fails |

At the daily primary comparison, the later four signal dates average net returns of **2.538% Classic, 0.456% Cumulative and 3.670% Hybrid**, with 50bps per side and missing exits marked total loss. Hybrid's 1.132 percentage-point advantage over Classic turns into a 0.179-point deficit after removing its best paired date; it wins only two of four later dates. Cumulative loses to Classic and Momentum. Breadth also fails: Cumulative improves both baselines in only 1/8 supported views and Hybrid in 3/8.

Hourly is more promising but fragile. Across 26 later signals concentrated on just September 5 and September 13, Hybrid's conservative net mean is **−0.662%**, versus Classic **−1.976%** and Cumulative **−0.784%**. Both candidates pass the predeclared hourly gate. However, Classic has three missing exits and Hybrid none: valuing missing exits at zero gross return instead of total loss shrinks Hybrid's Classic advantage from **1.313 to 0.171 percentage points**, and removing its best paired date then reverses that advantage. All three net means remain negative under this cost setting. We retain the formal pass without promoting an hourly default from this small, sensitive sample.

The longer [venue study](venue-README.md) uses a different population and positive-score selection. During 2023–2025, both new methods lose to Breakout's mean daily returns across **all 12 viewed intervals**. At view 7 with H30 and 50bps per side, median terminal wealth across 32 starting phases is **0.435× Cumulative, 0.388× Hybrid and 1.591× Breakout**. Earlier 2020–2022 mean-return comparisons reverse, showing substantial period sensitivity. This does not test Classic and is not combined with CMC returns.

**Decision:** deliver Cumulative and Hybrid as selectable interval-specific scores; preserve Classic as the Daily/Hourly default and the existing OHLC methods. There is no newly supported automatic interval selector, holding rule or Cumulative/Hybrid forecast probability.

## Independent verification

Verification completed **2026-09-13 at 22:21:26 UTC** and [passed](verification-report.json). A separate implementation imported no app or backtest scorer. It reconstructed **795,730 CMC scores**, all **46,450 positions**, all four promotion gates and the complete grid without omitted or duplicate evaluations. Venue checks covered **12,510 raw cumulative calculations**, **52,272 selection orderings** and **9,216 capital scenarios**. Reproduce with `node research/cumulative/2026-09-13/verification.cjs`.

Daily Cumulative and Hourly Hybrid were checked on `dev.local:3038`, each rendering 30 chart lines without an empty state or Experimental tag; [browser evidence](browser/) is retained. Local cache freshness still requires the existing explicit seed procedure when snapshots become stale.

Frozen inputs, source hashes, protocols, ledgers and summaries remain alongside these notes. Detailed [CMC notes](cmc-notes.md), [venue notes](venue-README.md) and the [independent report](verification-report.json) preserve dates, cost assumptions, missing-price sensitivity and limitations.
