# Algorithm and holding-policy evaluation — 2026-09-13

Previous goal turn: progress. Trading libraries were installed and independently reproduced saved trade arithmetic. This extension tests actual algorithm/holding choices instead of selecting the largest cell in a retrospective table. This protocol is written before running this extension; earlier datasets and constituent results have been viewed.

## Fixed design

Reuse the unchanged, hash-verified `holding-horizons/cohorts.json.gz` ledger. It contains two positive-price signal methods (Momentum and TrendQuality), all 12 daily view settings, and independently graded fixed exits. It is not an exact current signed-product/Classic replay. The preserved annual universe, delayed entry, missing-price and fees conventions remain in force.

Evaluate 2023–2025 decisions with 2020 onward training. At each scheduled signal, training may use only records whose scheduled exit is strictly before that signal date. Each candidate uses its most recent 24 mature cohorts, with at least 12 required. Signals are January 1 plus 28*k days, k=0..11. They are common across views except the source's recorded insufficient-history skips. Dates are never shuffled. Training uses hypothetical shadow outcomes for all fixed candidates, not only previously executed trades.

Candidates per view: two algorithms × fixed holds 7,14,30,60,90 days. The one-year source ledger only grades three early-year dates; it is not substituted into this uniform decision calendar. Year-hold evidence remains separate and cannot be claimed as evaluated by this selector.

Three adaptive policies: (a) select method for a fixed 14-day hold; (b) select holding period for Momentum; (c) select method and holding period. Selection objective is average log cohort return under the source's missing-exit-total-loss convention, divided by calendar days until capital can next be deployed on the fixed signal schedule. This explicitly includes entry delay and idle time between scheduled signals. It optimizes a historical growth-rate estimate, not gross return or captured hindsight highs. Deterministic ties favor Momentum, then shorter holds. The selector may choose cash if the best mature candidate has nonpositive estimated growth. Cold-start behavior is cash.

Replay each adaptive policy and all ten fixed policies separately with a single shared unit of capital per view/policy: after selecting a cohort, skip subsequent signals through its scheduled exit, then redeploy at the next eligible signal. Never overlap fully invested cohorts or rerank constituents after entry. Outcomes retain ten equal capital slots and unfilled slots as cash. Simulation starts 2023-01-01; the fixed accounting cutoff is 2026-03-01 to include the final scheduled exits. No new positions originate after 2025. Output terminal wealth under both missing-exit marks, completed trades, elapsed holding days, cash/occupied signal counts and drawdown at exit checkpoints. This is not daily/intraday drawdown. Fees are 50bps each side inherited from the ledger; slippage/capacity remain unmodeled.

Before each selected adaptive trade, record an empirical net-cohort-return forecast using only that candidate's mature training sample: mean, median and 20th/80th percentiles. Evaluate realized cohort-return interval coverage and absolute error. These are portfolio-cohort predictions, not calibrated coin prices or sell levels. Evaluate a fixed Momentum14 historical-mean forecast on its own identical decision calendar as a forecasting comparator where mature history exists. No forecast calibration or thresholds are fitted to evaluation outcomes.

## Interpretation and verification

This is retrospective walk-forward policy evaluation after prior data inspection, not an untouched holdout. Twelve views, three selectors and ten fixed policies are all reported; no favorable-only subset. Different holds lead to different actual deployment dates, so terminal wealth comparisons reflect complete policy behavior. Source outcome dates are fixed by schedule, not by availability or future membership. Unknown exits are sensitivity marks, not observed fills.

Checks must reject source hash mismatches, keep training exits strictly before decisions, prevent capital overlap, match selected records exactly, preserve choices when non-mature outcomes are perturbed, and reconcile compounded terminal wealth with executed cohort returns. Save protocol/runner/input hashes, versions and UTC run dates; refuse overwrite. Do not install an automatic production policy based on this experiment alone.
