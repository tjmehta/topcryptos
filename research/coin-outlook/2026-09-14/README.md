# Native coin-state due diligence — 2026-09-14 UTC

The four proposed labels can summarize observed price/rank paths. **This study does not validate them as buy, wait, hold, or sell advice.** In particular, “extended” did not consistently mean a bad next entry, and “building” did not consistently mean positive future returns. All exported recommendations remain null.

## Fixed rules and source

[Protocol](protocol.md) fixes the requested rules before this replay: fading first, then extended, building, mixed; insufficient inputs unavailable. The only inputs to the state are the selected interval's known prices and market-cap ranks. No future observations enter classification. “Extended” means the final log-price change dominates earlier changes by the specified fixed thresholds; it does not estimate valuation, overbought conditions, or a reversal probability. “Building” means price rose, market-cap rank improved, and the last observed price did not decline. Market-cap rank is not a trading recommendation.

The replay uses our actual five native CMC methods and their frozen September 13 selections. It recovers exact normalized quote arrays through the pinned scorer and checks every selected ID remains eligible; 3,240 Classic selection scores match the frozen scores. The other methods retain the previously verified original selection ledgers. This is not the Binance candle study or a Coinbase/Kraken-filtered replay.

324 unique mode/view/signal windows produce 16,200 selected-coin classifications across methods: 75 fading, 1,235 extended, 9,895 building, 4,995 mixed, and zero unavailable. These are repeated coin/date/method selections, not 16,200 independent assets or market events. The output has 917 nonempty state/method/view/hold cells from 4,645 original cohorts. Empty states are omitted; study metadata preserves the full view/hold grids.

## Observed outcomes

The examples below use the original fixed reference holds, not optimized exits. “Later” means the chronologically later half of the cell's available signal dates. It is a retrospective split and does not supply fresh out-of-sample validation.

| Classic reference | State | Later active dates | Known selected outcomes | Median known net | 10th-percentile known net | Known realized +20% outcomes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 10-day view, 7-day hold | Extended | 4 | 15 | +5.96% | −22.86% | 3/15 |
| 10-day view, 7-day hold | Building | 4 | 19 | −8.59% | −17.75% | 4/19 |
| 6-hour view, 3-hour hold | Extended | 26 | 119 | −1.44% | −5.67% | 1/119 |
| 6-hour view, 3-hour hold | Building | 26 | 126 | −1.03% | −5.51% | 2/126 |

All table returns include 0.5% cost on each side. The hourly Building row additionally has three selected positions with missing exits, excluded from its known-outcome distribution and explicitly marked in the basket sensitivity. Repeated coins and overlapping hourly holding periods reduce the independence of the sample.

For Classic at the 10-day view/7-day hold, the later Extended subset returned +6.83% of the original ten-slot basket capital versus +2.54% for all selections. Its +4.29 percentage-point paired advantage remained +1.05 points after removing its best paired date, but that comparison has only four dates. It does not establish that a currently extended coin is a good purchase.

For Classic at the 6-hour view/3-hour hold, the later Extended subset lost 0.36% of total basket capital versus a 1.98% loss for all selections, under missing-exit total-loss marks. Most capital was left uninvested. Beating a more heavily invested losing basket is not evidence of positive returns or a coin-level profit probability.

These examples show why a single green/red label would overstate what was established. Some state/interval/hold cells have positive returns; others lose money. A working classifier and correctly computed backtest are necessary but do not themselves justify actionable advice. Fading is especially sparse in native top-ten selections. There was no prespecified predictive-adoption gate in this study, no threshold tuning, no calibrated model, and no recommendation was promoted.

## Arithmetic and interpretation

Each state subset keeps members of the original top ten in their original 10% capital slots; all other slots stay cash. Dates with no members also stay cash and remain in the comparison. The baseline is the full original selected basket on exactly the same dates. Selected counts, active dates, distinct coin counts and known/missing outcome denominators are exported alongside means.

Missing entries stay cash. Missing exits use total-loss marks for primary net means and zero-gross marks for sensitivity. Both 0.5% and 1% costs per side are available. These are assumed transaction costs rather than the user's exact exchange tier or a liquidity model. Neither subset nor baseline means are compounded capital performance.

Known-position medians and interpolated tenth percentiles use only known entries/exits, at both fee levels. `realizedGain20Known50` counts final net gains of at least 20%; `sampledTouch20` is a separate gross path-touch label and never an assumed sale fill. `unknownNoTouch20` keeps incomplete paths without an observed touch visible. No frequency is a calibrated probability for today's coin.

Each horizon uses its original maturity dates. Therefore **do not compare the exported means across different holds as though they shared a formation-date sample**, and do not choose the maximum as the best exit. The earlier native-exit export separately supports matched-date holding comparisons.

## Artifacts and verification

- [App evidence artifact](../../../modules/data/coin-outlook-evidence.json): dated provenance, descriptive cells, no recommendations. Approximately 1.49MB; use server-side selection or lazy delivery rather than adding the full research table to the initial client bundle.
- [Classification traces](classification-traces.json.gz): selected coin ID, method/view/signal, state, and exact chronological time/price/rank inputs. Useful for direct application-helper parity checks.
- [State ledger](state-ledger.json.gz): original outcome records plus state labels; original fields are unchanged.
- [Independent verification](verification.json): Python reclassifies all traces, checks source observations precede the signal, checks every output against the untouched original ledger, and independently reconstructs all counts, medians, quantiles and paired returns using Decimal arithmetic.
- [Runner summary](run-summary.json): replay counts and source warnings. Warnings are the scorer's original sparse/unscoreable-universe diagnostics, not errors in selected-coin computation.

```sh
node research/coin-outlook/2026-09-14/run.cjs
python3 research/coin-outlook/2026-09-14/verify.py
```

Both commands modify only this study's generated files and its dedicated app artifact. The scorer and prior studies remain unchanged. Current scorer, inputs, outcome ledger, protocol and runner hashes are pinned. Learned lesson: descriptive path labels, market-cap-rank forecasts, realized returns, and execution/exit advice are different claims and need separate evidence.
