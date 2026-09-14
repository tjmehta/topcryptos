# Native coin-state replay — 2026-09-14 UTC

This is a fixed-rule descriptive study requested after examining earlier algorithm results. It is not untouched validation. No thresholds are optimized and no state is automatically promoted to buy, sell, hold, target-price, or probability guidance.

Use the exact frozen CMC inputs, signal windows, native eligibility, five algorithms and top-ten selection ledgers from September 13. Re-run the pinned current scorer to recover its normalized, chronological eligible quote arrays and assert the original selected Classic scores match and every method’s selected IDs remain eligible. Other methods retain their frozen independently verified selection/score ledgers; normalized quote arrays are shared across algorithms. Each input snapshot precedes its signal, individual quotes never exceed signal time, and the original scorer's quote normalization, density, coverage and freshness rules apply. No exchange availability filter is substituted.

For an eligible selected coin, require at least three positive finite prices, increasing finite timestamps and valid positive market-cap ranks. Define adjacent log returns as differences of log prices. Classify in this order:

1. `fading`: final price below first price and final price below preceding price.
2. `extended`: positive window return, positive final log return, at least six quotes, final log return greater than twice the median absolute preceding adjacent log returns (exclude the final return), and final log return at least half the total window log return.
3. `building`: positive window return, final market-cap rank lower than first rank, and final price at least preceding price.
4. Otherwise `mixed`. Invalid or insufficient inputs are `unavailable`.

Each state retains only its members of the original top ten, preserving ten equal capital slots. Excluded selections and missing entries stay cash. Compare against the same-date original full top-ten basket. Include dates with no state members as cash and explicitly report active-date and unique-coin support; do not reweight a sparse subset to full investment.

Keep every feasible original holding horizon and every method/view combination. Within each cell, split distinct signal dates chronologically at floor(n/2). Report all and later-half outcomes, total-loss and zero-gross missing-exit marks at 0.5% and 1% costs each side, and paired later-half differences with removal of the single best paired date. Later halves are descriptive; overlapping hourly positions and repeated coins are not independent observations. Means from different holding horizons use different maturity windows and must not be ranked as an optimized holding recommendation.

State labels describe information visible at signal time. A positive state-subset advantage may reflect holding more cash during a losing market; it does not establish positive returns per invested dollar or predictive coin-level guidance. Missing observations remain explicit. Recompute fee returns independently from frozen gross outcomes, and verify classification and exported arithmetic with an independent Python script. No source study/scorer files are modified.

Known-position distributions include median and interpolated tenth-percentile net returns at both costs, with known-outcome denominator. Realized +20% counts use known final net returns at 0.5% costs; sampled +20% touches are separate gross path labels, never assumed sale fills. Unknown paths without an observed touch remain explicit. These descriptive distributions are not calibrated forecasts for a current coin.
