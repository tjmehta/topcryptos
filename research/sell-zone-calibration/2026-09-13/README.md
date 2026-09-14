# Sell-zone probability calibration — 2026-09-13

The fixed calibration experiment improved pooled probability error, but it made predictions worse than the raw model in 2023 and 2024 for both target policies. Most improvement came from 2025. This is evidence against treating a pooled calibration improvement as a stable automatic winner.

The resistance-target model remains useful as a research candidate: calibrated probabilities beat the same-holding historical baseline in every one of the 12 year/holding cells. That does not establish profitable selling decisions. The label is **a daily high reaching a target before a deadline**, including events where a stop would have happened first.

## Run and support

Protocol frozen before outputs; run from **2026-09-13T20:03:13.821875+00:00** to **2026-09-13T20:03:17.588606+00:00**. Independent verification completed **2026-09-13T20:05:00.152540+00:00**. Earlier research and 2023–2025 raw model outcomes were already examined, so this is retrospective evaluation, not an untouched holdout.

- Replayed 14,200 genuine monthly prequential base forecasts, including 6,400 before 2023, through 124 base fits.
- All 7,800 evaluation raw probabilities exactly reproduce the original frozen forecast ledger; maximum difference **0**.
- Calibration trains on earlier prequential predictions only after the full hard-horizon exit date has passed. It never uses in-sample base probabilities or early sell dates to admit labels.
- There were eight raw-fallback fits during warmup, because fewer than 200 mature calibration predictions were available. All evaluation forecasts have enough support: 3,104–6,854 mature predictions, depending on policy and month. Counts include overlapping holds and are not independent samples.
- Evaluation has 3,900 events per policy and only **36 distinct entry dates**. Six bracket labels and four resistance labels are unknown; these remain in the ledger and are excluded from score calculations.
- A single fitted intercept offset per policy/month changes the overall probability level, with slope fixed at one. No tuning grid or separate per-horizon calibrator was used.

## Outcomes

Lower Brier score is better. Every row compares exactly the same known-label events. The baseline knows the holding period and uses only mature historical outcomes of that policy and holding.

| Target policy / year | Raw model | Calibrated | Holding baseline |
|---|---:|---:|---:|
| SMA/ATR bracket, all | 0.230155 | 0.226454 | 0.229034 |
| SMA/ATR bracket, 2023 | 0.233459 | 0.236675 | 0.235060 |
| SMA/ATR bracket, 2024 | 0.230646 | 0.236620 | 0.232499 |
| SMA/ATR bracket, 2025 | 0.226057 | 0.204326 | 0.218751 |
| Resistance, all | 0.222142 | 0.219675 | 0.239728 |
| Resistance, 2023 | 0.224242 | 0.225902 | 0.237474 |
| Resistance, 2024 | 0.207094 | 0.214900 | 0.232133 |
| Resistance, 2025 | 0.236347 | 0.218188 | 0.250469 |

Resistance calibration lowers pooled Brier by **1.11%** relative to raw and **8.36%** relative to the holding baseline. Its average forecast falls from 60.68% to 52.45%, compared with 53.49% observed target hits. That close aggregate match conceals drift: in 2025, calibrated predictions still average 53.71% against 45.11% observed hits. In 2023 and 2024, calibration underpredicts the observed hit rate and worsens raw Brier. Bracket calibration has the same year pattern.

| Resistance holding days, all years | Raw model | Calibrated | Holding baseline |
|---|---:|---:|---:|
| 14 | 0.209521 | 0.202295 | 0.237132 |
| 30 | 0.235122 | 0.233832 | 0.252052 |
| 60 | 0.226219 | 0.225741 | 0.241254 |
| 90 | 0.217704 | 0.216833 | 0.228473 |

All four pooled holding rows improve, yet only **5/12 resistance year/holding cells** improve on raw predictions. All **12/12** beat the same-holding baseline. Bracket calibration improves raw predictions in **6/12** cells and beats the baseline in **7/12**. These comparisons are descriptive; no probability thresholds, sell triggers, or interval winners were selected from them.

## Files and reproduction

- [protocol.md](protocol.md): choices fixed before this run.
- [run.py](run.py): original-model replay, monthly offset calibration, future-label/boundary/early-exit perturbation tests, metrics and provenance.
- [predictions.json.gz](predictions.json.gz): schema version 1 with `fits` and `forecasts`. Fits include base-model/scaler coefficients, monthly cutoffs, calibration offset/support/status and holding baselines. Forecasts preserve source event identity, entry, hard exit, entry-known features, target-reach label, raw/calibrated/baseline probabilities and fit ID. Pre-2023 rows are warmup; evaluation rows have `entry >= "2023-01-01"`.
- [summary.json](summary.json): source/runner/protocol/output SHA-256 hashes, UTC dates, package versions, support and all **40 policy/year/holding cells**, including ten-bin reliability and log loss for all three predictors.
- [verify.py](verify.py) and [verification.json](verification.json): standard-library independent source/maturity/membership, offset score-equation, probability, baseline and all metric/reliability arithmetic checks; all 14,200 forecasts and 124 fits passed.

```sh
.cache/trading-libs-venv/bin/python research/sell-zone-calibration/2026-09-13/run.py
.cache/trading-libs-venv/bin/python research/sell-zone-calibration/2026-09-13/verify.py
```

Both scripts refuse to overwrite completed outputs. Preserve this directory and use a new dated/run directory for an additional experiment. Original sell-zone and forecast files were left untouched. No application dependency or production behavior changed.

This closes the specified calibration experiment. Conditional sell-policy value, current production forecasts, hourly predictions, and market-cap rank forecasts remain separate, unproven requirements of the broader research goal.
