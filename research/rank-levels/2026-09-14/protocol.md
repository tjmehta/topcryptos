# Rank milestone diagnostic

Recorded September 14, 2026 UTC before running this diagnostic. Retrospective exploration on previously examined CMC history, not an untouched holdout or a calibrated forecast model.

Question: do round market-cap ranks 50 and 100 exhibit distinctive continuation/reversal behavior, and does rank improvement reliably mean price gains?

Use the frozen native CMC daily input blocks from September 13. Preserve recorded numeric asset IDs and provider ranks. No sorting current market caps to reconstruct ranks; no exchange population substitution. Admit positive prices/ranks and USD quotes no more than one hour old or ahead of the saved decision. Include the original population, including stablecoins; this is a rank behavior diagnostic, not an investable portfolio.

Viewed histories: 3, 7 and 14 daily observations. Signal requires all viewed observations, an improving endpoint rank and a positive endpoint price return. At each mature signal date examine:
- Approach: current rank is strictly outside boundary B but at most B + ceil(0.1B).
- Cross: previous saved rank > B and current rank <= B.

Primary boundaries 50 and 100; neighboring 40/60 and 80/120 provide descriptive comparisons. They are not matched or randomized controls and cannot identify a causal round-number effect.

Future horizons 7/14 saved days after the signal. Report observed entry into top B, any later observed fall outside B, end-horizon rank position, and endpoint price direction from signal. Missing future rank paths are unknown for a no-touch claim. A recorded touch remains a known touch despite another missing observation. Report count bounds, unique coins and dates, rather than calibrated percentages for today's coin.

Separately model next-snapshot price entry and exit H saved days afterward, requiring both dates inside the block. Fee return = exit/entry * (1-0.005)/(1+0.005) - 1. Missing entry remains cash; missing exit is a total loss. Report a zero-gross missing-exit sensitivity too. These are overlapping equal-weight event returns, not a compounded strategy. Save every event; no outcome-driven event thinning or best cell selection.

Also count all complete-window cases where rank improved but price fell or was flat, independent of the positive-price event gate. Results are descriptive; short coverage, repeat events, changing supply/ranking eligibility and cross-asset dependence prevent treating these counts as future coin-specific probabilities or validated sell levels.
