# Sell-zone reachability prediction — 2026-09-13

Written before fitting this model or viewing its results. Uses the separately specified level-exit experiment's unchanged outcomes. Earlier price-strategy outcomes and datasets have been inspected; evaluation is retrospective, not an untouched holdout.

## Prediction target

At the scheduled entry open, predict whether any complete daily bar's high reaches the frozen target before the hard-horizon exit open. This is target reachability, not a claim of execution at that price, target before stop, intraday ordering, or profit from the exit policy. Same-day ambiguity prevents a daily-high-based first-barrier execution claim.

Use SMAATRBracket and ResistanceSMAATR. Deduplicate identical identity/signal/holding/policy outcomes across views/methods before model fitting. Train each policy separately; horizons 14/30/60/90 are pooled with holding time as a feature. Rows for different holds may overlap; the unit count is not independent sample support.

Features known at entry: target distance / entry price, stop distance / entry price, frozen SMAATR14 / entry price, frozen prior-20-bar resistance / entry minus one, and log(1+holding days). No future prices, realized duration, actual exit reason, target label, or future universe membership enter features. Standardize using the training sample only. Fixed L2 logistic regression, C=1, lbfgs, max_iter=1000; no parameter search or class weighting.

Monthly expanding training snapshots from January 2023 through December 2025. Admit only rows whose common hard-horizon end is strictly before the first day of that forecast month, even if the simulated exit occurred early. Minimum 200 labeled training rows and both label classes are required. Unknown target reachability is excluded from fitting and evaluation but counted explicitly. This yields conditional known-label performance and does not resolve nonrandom missingness. Forecasts are generated for every feature-valid current event even when its eventual label is unknown.

Compare with the training-only empirical target-hit rate, smoothed as (hits+1)/(count+2), on the exact same evaluation events. Preserve probabilities, labels, features, training cutoff/count and distinct training signal dates. Assess Brier score, logarithmic loss, 10-bin reliability, mean prediction/observed hit rate, and per-year and per-horizon performance. No AUC-based winner selection, extra tuning, or retrospective recalibration. Positive improvement means baseline Brier minus model Brier >0, descriptive only.

## Checks and boundary

Verify source ledger hash. Assert all training hard exits precede the forecast month; features positive/finitely defined and free of future fields. Deduplicate source selections. Verify monthwise base-rate arithmetic, recompute metrics independently, and test that changing future labels cannot change fitted features or that month's training membership. Save model settings, package versions, runner/protocol/source hashes and UTC timestamps; refuse overwrite.

The output is a tested reachability estimator for these historical positive-signal venue cohorts and known-label cases. It is not yet a current TopCryptos production forecast, hourly model, or market-cap rank predictor. A model that fails the base-rate comparison should remain a research result rather than be presented as useful prediction.
