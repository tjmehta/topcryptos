# Topcryptos algorithm evidence review

Research date: 2026-09-11. Production scoring source at commit `cf78194`.

This is a research assessment, not a production algorithm change or a claim of investment profitability. Three Claudex sessions in the Topcryptos Herdr workspace separately handled primary literature, historical experiments, and mathematical/source verification. The coordinating session independently reran all 16 synthetic checks.

## Conclusions before interpreting the backtest

1. **OpenClaw's mathematical criticisms are substantially correct.** Coverage adjustment cancels the coin-specific observed duration. Summed acceleration telescopes on regular grids to a difference between the first and last interval velocities. Neither fact establishes inferior predictive performance by itself.
2. **Return-only is a defensible descriptive baseline, not a proven investment winner.** It directly answers “which coins gained most over the same window?” Predictive performance depends on the universe, horizon, period, execution, and costs.
3. **There are implementation correctness issues to resolve independently of algorithm preference.** The rank acceleration's orientation rewards accelerating deterioration. Hourly filtering uses local calendar dates, not the exact cutoff. Floating-point acceleration residuals can receive material percentile weight.
4. **Multiple named views could be useful if they answer different questions.** Clear definitions and data-quality disclosure matter more than a collection of optimised weights.

## Mathematical/source verification

Executable checks: `TZ=UTC node research/algorithm-audit/synthetic-audit.cjs`.

The runner uses the installed TypeScript compiler to execute the actual production modules in memory. It does not rewrite the scorer. Tests establish behavior, not how often an issue occurs in real data.

| Claim | Verdict and qualification |
| --- | --- |
| Coverage-adjusted velocity is more than return | With positive finite durations, `(return / observedSpan) * (observedSpan / sharedSpan) = return / sharedSpan`. Eligible coins are ordered by observed endpoint return, even when observed spans differ. The eligibility gate still matters. |
| Acceleration captures the entire path | On equal intervals `h`, `sum((v[i] - v[i-1]) / h) = (v[last] - v[first]) / h`. This depends on the first/last interval velocities, not solely the full-window price endpoints. Unequal intervals prevent general cancellation. |
| Span coverage ensures complete history | False. Three quotes with a very long interior gap can be eligible. The gate does not check interior density, unique timestamps, or endpoint freshness. |
| Hiding is a display-only operation | False. Hidden coins leave percentile pools but still help establish ranks and the shared span. They remain in scored output. Exchange filtering, unlike hiding, happens after scoring. |
| Positive rank acceleration means improvement | False for the implemented numeric orientation. Ranks `4,3,1` have negative acceleration; ranks `1,2,4` have positive acceleration. The positive weight therefore rewards accelerating deterioration. |
| Hourly windows use an exact time cutoff | False. The caller calculates an hourly cutoff but the scoring filter compares local calendar dates. A faithful backtest must disclose its own input-window construction. |
| Zero acceleration always contributes zero | False numerically. Constant percentage growth can leave a tiny nonzero floating-point residual. Sign-separated percentile ranking can assign that residual a material weight. |

Additional checks cover ordering, duplicate timestamps, market-cap ties, supply-driven rank crossings, and client deduplication compressing reconstructed ranks. Raw market-cap changes have no direct final-score weight; they affect the rank component through crossings. These mechanisms do not establish manipulation by any particular asset.

## Primary literature: support and counterevidence

### Crypto momentum is horizon- and universe-dependent

- **Liu, Tsyvinski & Wu, [Common Risk Factors in Cryptocurrency, May 2019 working-paper version](https://www.nber.org/system/files/working_papers/w25882/w25882.pdf).** The retrieved version studies 1,707 coins during 2014–2018, excludes sub-$1m capitalizations, and reports weekly momentum from formation periods of one to four weeks. This justifies a return-momentum benchmark. It does not validate hourly top-500 selection, executable long-only returns, or the current acceleration weights. The working-paper and later published versions must not be conflated.
- **Grobys & Sapkota, [Cryptocurrencies and Momentum, 2019](https://osuva.uwasa.fi/server/api/core/bitstreams/ffee5cb1-92a8-443e-a117-cbaacd8a1028/content).** The restricted 143-coin proof-of-work cohort over 2014–2018 does not show significant untrimmed monthly cross-sectional momentum. Cohort selection and monthly horizons prevent using this as a universal refutation of weekly or hourly momentum.
- **Grobys et al., [Cryptocurrency Momentum Has (Not) Its Moments, 2025](https://link.springer.com/article/10.1007/s11408-025-00474-9).** The annually selected top-30 universe over 2016–2023 shows insignificant full-sample gross momentum. Removing a severe long–short loss materially improves apparent results. This is a warning against ex-post deletion of crashes, not an implementable risk-control rule. Unrecoverable missing observations remain a selection concern.
- **Grobys, Sandretto & Äijö, [On Survivor Cryptocurrency Momentum, 2026](https://osuva.uwasa.fi/server/api/core/bitstreams/2a766d58-9fd3-44b8-b1a3-14a048a0b653/content).** January 2017–August 2024 evidence compares persistent survivors with a rotating universe. Cost assumptions weaken trimmed results' significance. Knowing which assets survive through the final date is itself hindsight; the survivor cohort is diagnostic, not an implementable point-in-time universe.
- **Zaremba et al., [Up or Down? Short-Term Reversal, Momentum, and Liquidity Effects in Cryptocurrency Markets, 2021](https://www.sciencedirect.com/science/article/pii/S1057521921002349).** Abstract/highlights describe daily reversal in the broader sample but daily momentum among larger, more tradable coins. The full cost and delisting treatment was not accessible, so treat this as directional counterevidence rather than verified net profitability.
- **Wen et al., [Intraday Return Predictability in the Cryptocurrency Markets: Momentum, Reversal, or Both, 2022](https://www.sciencedirect.com/science/article/pii/S1062940822000833).** Publisher-preview evidence reports both effects, varying with jumps, liquidity, and conditions. Bitcoin's sample spans March 2013–May 2020; other-coin sample periods differ. This is not direct evidence for a top-500 trailing-hour screener.

### Path quality and risk views have different purposes

- **Da, Gurun & Warachka, [Frog in the Pan: Continuous Information and Momentum](https://academicweb.nd.edu/~zda/Frog.pdf).** US-equity research finds return-path continuity informative conditional on similar past returns. Its continuity measure uses the proportions of positive/negative daily returns, not the log-price regression slope multiplied by R² in our exploratory comparison. Asset class, sampling interval, and formation horizon differ materially. This motivates a hypothesis; it does not validate a crypto “trend quality” formula.
- **Cederburg et al., [On the Performance of Volatility-Managed Portfolios](https://www.lehigh.edu/~xuy219/research/COWY.pdf).** Evidence across 103 equity strategies does not support universal improvement from volatility management. Real-time results can underperform ex-post combinations. Scaling an entire portfolio is also different from ranking individual coins by return divided by volatility.
- **Moskowitz, Ooi & Pedersen, [Time Series Momentum](https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum).** Evidence from 58 liquid futures/forwards and approximately annual signals concerns each asset's own return direction. That is not the same as cross-sectional coin ranking or short-horizon acceleration. The coordinating session consulted the research summary, not a full replication.

### Data and backtest safeguards

- **van Breugel, Kutz & Brunton, [Numerical Differentiation of Noisy Data](https://pmc.ncbi.nlm.nih.gov/articles/PMC7899139/).** Finite differences amplify measurement noise. This supports caution about derivative estimates; the paper does not establish a financial prediction result or specifically validate our treatment of irregular samples.
- **Cong et al., [Crypto Wash Trading](https://www.nber.org/papers/w30783).** The abstract reports widespread fabricated volume in the sampled unregulated exchanges. It does not establish that every exchange or today's universe has the same rate. Reported volume is not sufficient evidence of executable liquidity.
- **CoinMarketCap, [Liquidity Score methodology explainer](https://coinmarketcap.com/academy/article/an-in-depth-look-at-coinmarketcaps-newly-improved-liquidity-score-for-finding-the-best-crypto-exchanges).** The 2020 explainer distinguishes reported volume from simulated execution slippage across buy/sell order sizes. Historical aggregate snapshots cannot reconstruct venue-specific depth or slippage.
- **CoinMarketCap, [Market capitalization definition](https://coinmarketcap.com/academy/glossary/market-capitalization-market-cap-mcap).** Market cap is price times circulating supply. Supply changes can affect relative cap ranks without an equivalent investor return. Market cap does not establish executable bids or depth.
- **Bailey et al., [The Probability of Backtest Overfitting](https://scholarworks.wmich.edu/math_pubs/42/).** Trying many configurations and selecting a historical winner creates selection bias. A small predefined experiment is preferable to weight optimisation here. Chronological holdouts and explicit outcome separation are useful safeguards, not proof against every form of overfitting.

Reading disclosure: the research worker read the full short 2019 Grobys–Sapkota paper and the available 2025 article body, targeted methods/results of the other accessible PDFs, and only abstracts/previews where access was limited. The coordinating session separately checked the numerical-differentiation, wash-trading, overfitting and provider-methodology sources. No independent paper replication was performed.

## Possible names, not shipped features

| View | Question it answers | Status |
| --- | --- | --- |
| Price Momentum | Which eligible coins gained most over comparable endpoints? | Clear descriptive baseline; no promise of future returns. |
| Trend Consistency | Which gains came through a steadier path rather than one jump? | Define the exact proxy; not interchangeable with the published continuity measure. |
| Volatility-Adjusted Momentum | Which gains were large relative to observed variability? | Short histories, stale prices, and pegged assets require special care. |
| Classic | What does the existing 70/20/10 blend rank highest? | Keep unchanged as a research comparator; do not call known correctness issues a desirable style. |

Liquidity/data quality should primarily be disclosed or filtered explicitly rather than buried in arbitrary blended weights. Correctness repairs should be evaluated separately from adding algorithm choices. The current product is a screener; a strategy claim needs point-in-time availability, entry/exit prices, costs, capacity and a much more complete universe.

## Historical experiment

See `algorithm-comparison/` for the separately reproducible local-cache experiment, its fixed formulas, period-by-period results, and data-adequacy caveats. Numerical conclusions must be read with its missing-forward-price coverage and chronological holdout definitions. Local caches cannot establish true trade-time publication availability or prices after every universe exit.

Independent verification (`algorithm-audit/verify-local-comparison.cjs`) reproduced formulas, sort directions, shared universes, outcomes, scenario arithmetic and chronological partitions across 166 decisions / 73,888 coin-decision records; actual production-scorer parity was sampled on 15 decisions. Source/cache/protocol/runner hashes matched after the author's output refresh. **However, 24 decisions contain 4,226 eligible quotes one minute after their recorded decision time, including selected holdings.** These are retrospective snapshot-aligned associations with within-snapshot timing leakage, not strictly as-of backtest performance. A valid predictive follow-up needs an explicit common information cutoff and executable entry rule; moving a timestamp alone cannot establish either.

The modern holdout contains only 22 daily and 2 weekly decisions. The January 28, 2021 source is a wrong-universe page (ranks 1300–1800 despite a start=1 filename); old-era aggregates are diagnostic only. No robust investment winner can be selected from this experiment. The README prominently records the independent review qualifications; formulas and frozen numerical outputs were not retuned.

No production code, weights, UI, commits, or deployments were changed for this research.
