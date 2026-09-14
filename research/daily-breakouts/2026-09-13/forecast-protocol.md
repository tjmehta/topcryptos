# Daily-entry target probability validation — 2026-09-13

Freeze the already-tested logistic target-reach model architecture on the new daily-entry sample, before evaluating these forecast results. Earlier monthly-entry forecast outcomes are known. This is retrospective transfer validation, not an untouched holdout.

Use daily exit-ledger unique identity/signal/H30 outcomes. Fit separate models for SMAATRBracket and ResistanceSMAATR. Features and model are unchanged from sell-zone-forecast/2026-09-13/run.py: target/entry−1, stop/entry−1, SMAATR14/entry, prior20-resistance/entry−1, log(1+H); training-only StandardScaler and LogisticRegression(C=1, lbfgs, max_iter=1000). H is constant here. Missing features suppress a forecast, not a selected trading slot.

The prediction is issued at the actual entry open, when its target and stop geometry are known. Its label is any complete daily bar high reaching the frozen target by the hard deadline, regardless of an earlier stop or actual sale. Observed hits remain known even with another path gap; no-hit labels require a complete path. This is explicitly not a probability of a profitable trade or target-before-stop.

At each entry month from January 2023 through January 2026, fit using all unique source events whose full hard deadline is strictly earlier than the month start and whose labels are known. Require 200 examples and both labels. Test only signals dated in 2023–2025, preserving late-December signals entering January 2026. Training may use earlier annual source cohorts. Do not train on early-exit dates or labels that matured within the current month.

The causal baseline is the Laplace-smoothed mature target-hit frequency for that same policy and H30. No parameter, probability-threshold, calibration or model search is performed. Evaluate pooled unique-event and each method/view populations separately; deduplicate repeated event keys within a population. Save all coefficients, scaler values, source dates, monthly training support, targets/stops, raw probabilities, labels and baseline probabilities.

Report Brier score, log loss, empirical hit rate, average probability, ten-bin reliability, missing forecasts and distinct entry dates for all evaluation years and pooled. Report the later observed results as evidence of whether forecast accuracy transfers to daily breakout entries. A better probability score is not evidence that executing a target sale improves returns; paired exit and capital experiments answer that separately.

Hash-check the exit ledger and the frozen forecast helper before reading results. Independently reconstruct training eligibility/counts/scalers, probabilities from saved coefficients, feature arithmetic, labels and all summary metrics. Retain dates and reproducible immutable outputs. No production forecast or trading threshold is installed automatically.
