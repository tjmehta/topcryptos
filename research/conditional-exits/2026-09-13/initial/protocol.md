# Conditional sell-policy evaluation — 2026-09-13

Previous goal turn: progress. It completed sequential method/hold selection, paired level exits and target-probability evaluation. This extension asks whether entry-known information can identify when a level exit will produce higher realized gains than holding. Protocol written before fitting these models or viewing their outputs; the underlying constituent outcomes have already been inspected.

## Target and fixed model

Use the unchanged sell-zones outcomes: FixedH, SMAATRBracket and ResistanceSMAATR. For each alternative, predict its 50bps-per-side net-return difference from FixedH on the exact same entry, hard horizon and coin. Fit only pairs whose two exits are known, without winsorizing or clipping the target; missing outcomes are not ground truth. Preserve all missing outcomes and source ten-slot denominators during evaluation under both saved marking conventions. Explicitly report that known-pair training can be selection-biased.

Two fixed challengers: standardized Ridge(alpha=10), and standardized Ridge(alpha=10) with additional signal-state features. The geometry-only model uses target/entry−1, stop/entry−1, frozen SMAATR14/entry, prior20-resistance/entry−1, log(1+H). The state model adds signal-close returns over 1/7/21 elapsed days, population standard deviation of 20 daily log returns, current quote volume / preceding-20-day median quote volume, and the same annual cohort's BTC 21-day signal return. Source features require complete consecutive bars; no price or membership from after the signal enters these state values. Geometry uses actual entry open known when the decision is issued. Missing features cause a FixedH fallback, not deletion of an evaluation slot.

Monthly expanding training; evaluation entries 2023–2025. Only outcomes whose full hard horizon ended strictly before the forecast month may train either model, even when a level policy exited early. Deduplicate identity/signal/H outcome keys across methods and viewed intervals. Fit candidates separately, pooling H14/30/60/90 with H as a feature; at least 200 known pairs are required. Scale using training data only. No hyperparameter, threshold, loss, feature or window search beyond these two declared models.

At entry select the candidate with largest predicted advantage only when it is positive; otherwise choose FixedH. Ties use the declared candidate order (SMAATRBracket, ResistanceSMAATR). Baselines: always FixedH, always each level policy, and a causal historical-mean-delta chooser using mature known pairs for that exact H (minimum 50 pairs). The mean chooser also falls back to FixedH when no positive mean is available. Later outcomes must never influence policy choice or substitute constituents.

## Evaluation

Project unique predicted choices back into the unchanged source selected cohorts, both positive-signal methods and all 12 viewed intervals. Keep all source slots and same entry dates. Each selected position executes the chosen frozen policy, then holds its proceeds as cash through the common hard deadline; no early-sale reinvestment. This primary comparison measures return capture on identical entries and capital slots. It is not a sequential portfolio, and overlapping cohorts must not be compounded or annualized.

Report per view/method/H and year, full 2023–2025: mean net returns under both marks, paired difference versus fixed, paired date wins, median date difference, omission of the single best paired date, choice counts, known/missing counts and duration of known exits. All results are retained. No outcome-selected best configuration is installed. Gains must improve beyond the same-H mean chooser, survive missing-price assumptions and date/year sensitivity before being considered a promising model.

## Verification

Hash-check source exit ledger and normalized price panel against their manifests. Assert only past state bars are accessed, known-pair labels mature strictly before monthly cutoffs, training-only preprocessing, one choice per immutable event, and all positions remain in evaluation. Test future-bar/label perturbation invariance, conservative FixedH fallback, exact paired targets, and source-cohort accounting. Save fits/choices/cohort ledgers, hashes, package versions and UTC dates; refuse overwrite. Independently reconstruct choices and aggregate returns from saved predictions and source outcomes.

This is retrospective walk-forward evaluation informed by prior studies. It concerns positive-signal Binance cohorts and daily close-confirmed exits with two-day fills. It does not validate current signed Classic/CMC rankings, intraday stop execution, hourly outcomes, one-year holds, or production-ready predictions.
