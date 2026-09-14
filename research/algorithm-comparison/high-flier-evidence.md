# High-flier discovery and exhaustion: focused primary-source review

Research question: identify rising cryptocurrencies early across a coin universe, then issue useful exhaustion/exit warnings. Do not substitute BTC long/cash exposure timing or claim that ex-post peak labels are online forecasts.

The source-review worker reports reading the substantive full texts below. This is a literature review, not independent replication of their datasets. It informed candidate selection before the new cross-coin outcomes were computed. None validates Topcryptos' exact production acceleration weights.

## 1. Fičura — Impact of Size and Volume on Cryptocurrency Momentum and Reversal

Primary full text: https://quantitative.cz/wp-content/uploads/2023/09/impact_of_size_and_volume_on_cryptocurrency_momentum_and_reversal.pdf

- June 2017–December 2022 CoinMarketCap history; initial 18,352 coins including discontinued assets, 4,614 retained after a $100,000 market-cap screen and other exclusions.
- Weekly sorts/one-week forward holding, conventional return and proximity to trailing intraday highs across 1/2/4/12/26-week formation windows.
- Large/liquid group: at least $50m market cap and $5m prior-week dollar volume. Reported one-week momentum long–short spread +1.36%/week; proximity-to-high spread +2.68%/week.
- Small/illiquid groups show the opposite: reported one-week conventional spread -3.91%, proximity-to-high -3.67%.
- Retrospective portfolio sorts and robustness, not a frozen prospective test. No full trading-cost/executable-fill model. Part of conventional momentum's benefit comes from shorting losers, which is not a long-only high-flier product.
- Read scope reported: pages 1–20, including methods, results, conclusion and initial appendices.

Implication: recent-high proximity is a justified challenger, but liquidity changes the interpretation. It is not evidence that every small-coin breakout continues.

## 2. Bianchi, Babiak & Dickerson — Trading Volume and Liquidity Provision in Cryptocurrency Markets

Primary author/repository copy: https://eprints.lancs.ac.uk/id/eprint/172093/1/Babiak_Trading_Volume.pdf

- March 2017–March 2022; more than 300 pairs/179,023 pair-days, CryptoCompare OHLCV and CoinGecko caps.
- Dynamic monthly liquidity-selected top 100 with at least 365 trading days; no end-of-sample survival requirement.
- Daily signals and next-day returns. Abnormal log volume versus trailing 30 days, with 60-day sensitivity.
- Low-volume prior losers outperform winners strongly; reversal weakens at higher volume and concentrates in smaller/less-liquid assets.
- Reported equal-weight low-volume reversal about 1.22–1.26%/day, high-volume about 0.54%. Value-weight high-volume reversal is insignificant and slightly negative.
- Explicit 30bps long/40bps short cost assumptions sharply reduce or erase significance; a Binance implementation can turn negative after fees.
- Read scope reported: pages 1–25, covering methods, core results, implementation tests and conclusion.

Implication: volume is conditional information. 'High volume is bullish' is not supported as a universal rule. Low-volume pumps in illiquid coins deserve fragility scrutiny.

## 3. Grobys et al. — Cryptocurrency Momentum Has (Not) Its Moments

Peer-reviewed open-access source: https://osuva.uwasa.fi/server/api/core/bitstreams/994474fd-8d6c-4669-9f43-98836145cad6/content

- 2016–2023, 416 weeks; annually selected prior-year-end top 30, 89 unique coins; approximately 30-day formation with one-day skip, weekly long–short holding.
- Raw mean about +0.90%/week, insignificant. Later sample August 2020–December 2023 about -0.19%/week.
- A -255.28% long–short week followed a roughly 1,400% rise in shorted Mindol. This is a short-leg loss, not a possible unlevered long-only loss.
- Expanded-universe/value-weight/other-changes robustness becomes negative; it does not isolate universe size alone.
- Missing histories and extreme observations matter; no full transaction-cost adjustment for the main crypto portfolios.
- Read scope reported: complete article and appendices, approximately 30 pages.

Implication: show coin/date concentration and tail outcomes. Do not select a high-flier model from a mean dominated by one token or anomalous candle, or trim inconvenient events to create a winner.

## 4. Zarattini, Pagani & Barbon — Catching Crypto Trends

Working paper, not peer reviewed; retrieved PDF is dated April 9, 2025: https://concretumgroup.com/wp-content/uploads/2026/02/Catching-Crypto-Trends.pdf

- Authors describe a survivorship-inclusive database of 21,616 cryptocurrencies, January 2010–March 2025.
- Long breakout at an upper Donchian boundary; initial stop at channel midpoint; trailing stop is the maximum of previous stop and current midpoint, so it cannot move down.
- Nine lookbacks from 5 to 360 days; equal ensemble; separate volatility sizing can reach 200% exposure.
- More defensible dynamic portfolio selects lagged-volume-ranked eligible assets monthly, with at least 365-day seasoning and trailing liquidity gates. One other analysis uses full-history volume and explicitly suffers selection bias.
- Reported dynamic top-20 performance is attractive (about 18% CAGR, 1.57 Sharpe, 11% drawdown), but there is no identified frozen independent holdout. Baseline 10bps transaction cost does not settle next-executable-price timing, slippage or impact.
- Read scope reported: complete 36-page paper including appendices.

Implication: a causal, ratcheting exit is a useful baseline design—not proof that exact peaks can be predicted. We are not replicating this nine-horizon leveraged/volatility-sized system; the current experiment uses a smaller independently frozen candidate set.

## 5. Kaminski & Lo — When Do Stop-Loss Rules Stop Losses?

Peer-reviewed primary reference: https://doi.org/10.1016/j.finmar.2013.07.001

- Theoretical and non-crypto futures study; daily S&P and Treasury futures, 1993–2011.
- Stops can help with sufficiently persistent returns/regimes and hurt under mean reversion; under their random-walk assumptions, stopping lowers expected return.
- Broad retrospective threshold/frequency sweep; empirical costs set to zero. Not a test of optimal altcoin trailing stops.
- Read scope reported: author-copy pages 1–20, covering substantive theory and empirical analysis.

Implication: same-entry paired comparisons are essential. Lower drawdown or closer retrospective peak timing does not alone establish a better exit.

## Peak-model caution, not a substitute research objective

Two open-access Bitcoin bubble papers illustrate why episode-conditioned peak forecasts are not sufficient evidence for Topcryptos:

- Gerlach, Demos & Sornette: https://pmc.ncbi.nlm.nih.gov/articles/PMC6689597/
- Wheatley et al.: https://pmc.ncbi.nlm.nih.gov/articles/PMC6599809/

The reviewed exercises use retrospectively selected bubbles, parameter-dependent labels and/or critical-time intervals. They do not supply complete false-positive/false-negative rates across all ordinary dates, nor a validated multi-coin executable exit system. Hourly inputs in one paper do not establish hourly altcoin prediction. Full methods/results/limitations were reported read by the research worker.

## Translation into the new experiment

- Separate discovery from exits.
- Five fixed discovery candidates: short return baselines, prior-high breakout, short-vs-prior acceleration, volume-confirmed breakout.
- Four paired exits on identical entries: fixed holding period, close trailing exit, ratcheting ATR chandelier, EMA trend break.
- Real signal-to-fill delay, unit-capital fees, missing outcomes and token-identity controls.
- Grade high-flier hits, missed runners, false alerts, MFE/MAE, early detection, actual exit return, before-exit giveback and post-exit missed upside separately.
- Daily highs can grade opportunities; they cannot be assumed fills. Daily results do not validate intraday peak warnings.

See `high-flier-protocol.md` for exact formulas and frozen thresholds. These thresholds are experimental specifications, not values established as optimal by the literature. Product language should remain 'continuation candidate', 'fragility warning' or 'trailing exit triggered' until validated, not 'peak predicted'.
