# Sell-zone probability evaluation — 2026-09-13

The resistance-target model improves reachability prediction over a historical baseline that already knows the holding period. The ATR-only target model does not improve that stronger baseline overall. Neither result establishes profitable exits.

## What is predicted

At the delayed entry open, predict whether a future daily high reaches a frozen target before the 14/30/60/90-day deadline. Targets come from signal-time ATR and prior resistance; entry, target distance, stop distance, ATR fraction, prior resistance distance and holding horizon are known when the prediction is issued. Close-confirmed delayed exits are evaluated separately. A touched target need not be an executable sale or occur before the stop.

Run: 2026-09-13T19:55:30.662514+00:00 to 2026-09-13T19:55:32.334862+00:00. There are 66 monthly expanding fits and 7,800 predictions. Each policy has 3,900 forecasts across 36 distinct entry dates in 2023–2025. Multiple holds share a price path; these are not 7,800 independent events.

The model is fixed L2 logistic regression using training-only scaling. A monthly fit sees only outcomes whose full hard holding window ended before that month. Models are separate by target policy. The source population is the union of positive Momentum/TrendQuality selections across viewed intervals in the annual Binance cohorts, not current CMC rankings or every eligible coin.

## Prediction error against a meaningful baseline

Brier score is mean squared probability error; lower is better. The stronger baseline uses only prior mature outcomes for the same policy and holding horizon. It was added as a post-result diagnostic without refitting the model.

| Policy | Period | Known outcomes | Model Brier | Same-hold historical Brier | Improvement |
|---|---|---:|---:|---:|---:|
| SMAATRBracket | all | 3894 | 0.2302 | 0.2290 | -0.0011 |
| SMAATRBracket | 2023 | 1324 | 0.2335 | 0.2351 | +0.0016 |
| SMAATRBracket | 2024 | 1342 | 0.2306 | 0.2325 | +0.0019 |
| SMAATRBracket | 2025 | 1228 | 0.2261 | 0.2188 | -0.0073 |
| ResistanceSMAATR | all | 3896 | 0.2221 | 0.2397 | +0.0176 |
| ResistanceSMAATR | 2023 | 1324 | 0.2242 | 0.2375 | +0.0132 |
| ResistanceSMAATR | 2024 | 1344 | 0.2071 | 0.2321 | +0.0250 |
| ResistanceSMAATR | 2025 | 1228 | 0.2363 | 0.2505 | +0.0141 |

ResistanceSMAATR reduces Brier error by approximately **7.3%** versus the same-holding baseline overall, with positive differences in each of 2023, 2024 and 2025. This is descriptive retrospective improvement, not statistical significance or untouched prospective validation. ATR-only loses its apparent advantage once the comparator knows the horizon.

## Calibration remains imperfect

| Target | Average model probability | Actual known-label hit rate | Unknown labels |
|---|---:|---:|---:|
| SMAATRBracket | 48.4% | 40.2% | 6 |
| ResistanceSMAATR | 60.7% | 53.5% | 4 |

Both models overpredict average target reachability. Ten-bin reliability and horizon-specific scores remain in `summary.json`; no retrospective recalibration was performed. Known hits on incomplete paths remain labeled while incomplete no-hit paths remain unknown, so these metrics are conditional on observed labels. Do not turn a raw 70% model output into a confident user-facing probability yet.

## Verification and next step

Independent review found no feature-causality, duplicate-handling or training-maturity blocker. Selftests verify future-label/exit-price changes cannot alter features and exclude boundary-day maturities. The independent stdlib verifier matched all 66 training counts/base rates/cutoffs, all 7,800 predictions from saved coefficients, every source feature/label and every reported Brier score. Source, runner, protocol and prediction hashes match. The underlying ATR and resistance levels were separately rebuilt from raw CSV for all 1,885 distinct identity/signal cases.

This provides a concrete prediction component worth further validation. It does not rescue the tested automatic level exits, which generally reduced returns. Next work should evaluate calibrated probabilities using only mature prior forecasts, and test whether a conditional exit decision improves realized gains versus holding. Preserve the fixed baselines and negative unconditional-exit results.

Artifacts: [protocol](protocol.md), [runner](run.py), [predictions](predictions.json.gz), [summary](summary.json), [independent verifier](verify.py), [stronger-baseline results](verification.json). Runners refuse overwrites. Use the isolated trading-libraries Python environment for model fitting; verification uses Python stdlib.
