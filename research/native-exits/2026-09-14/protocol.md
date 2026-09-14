# Native algorithm exit evidence — 2026-09-14 UTC

This is a descriptive export of the completed 2026-09-13 exact CMC replay, not another algorithm search. Earlier results have been examined. No return maximum is selected or presented as an automatic exit recommendation.

Use the five exact native methods, original selected-coin lists and full hold grids. Daily holds are 1/7/14/30/60/90/365 saved daily steps; hourly holds are 1/3/6/12/24 saved hourly steps. Entry is the first saved snapshot after the signal; exit is H saved steps after entry, inside the same contiguous block. Snapshot timing is approximate, not an exchange fill guarantee.

For each mode/view, admit holding windows with at least six mature signal dates in each method, using availability only. Intersect their exact signal/entry dates across all admitted holds and all five methods. Every displayed return in that configuration then uses those same dates. Require at least six common dates; otherwise suppress return comparisons. Six is a display-support threshold, not proof of reliable performance. Preserve counts for sparse and unavailable horizons without displaying their unmatched means. One admitted horizon is a reference with no alternative comparison. Weekly daily signals and overlapping hourly positions are not independent trades.

Use ten fixed slots per signal, even when fewer assets were selected. A missing entry stays cash; a missing exit is valued at total loss for the primary mean. Also expose the alternative of zero gross return at missing exits, with both 0.5% and 1% costs on each side. Known-loss counts use only known entry/exit outcomes and the 0.5% cost. Means describe equally weighted top-ten baskets across formation dates, not a compounded portfolio, executable exchange returns, or individual-coin probabilities.

The CMC universe has not been filtered or validated against Coinbase or Kraken availability. Applying an exchange filter in the app changes the tested basket. No Binance evidence or forecast model is used here. No stop, target or automatic exit recommendation has been validated for these five native methods.

Pin frozen source hashes and current scorer hash. Recompute every ledger position and basket fee return directly from gross outcomes without using the original grading helpers. A separate Python verifier reconstructs matching sets and all exported metrics from the frozen ledger and checks the generated artifact. Preserve the dated artifact and verification results; no frozen source files are modified.
