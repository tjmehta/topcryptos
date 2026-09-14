# TopCryptos algorithm research status

Updated 2026-09-14 UTC. Active objective: identify useful algorithms by viewed interval, optimize realized gains, and evaluate predicted sell zones. Native Daily/Hourly now have Coin Outlook for opened/starred coins: observed levels and direction plus historical returns under Past outcomes. The user-rejected manual UTC planner has been removed from the rankings page. Descriptive rank-crossing Radar is also implemented. Breakouts now uses the user's Coinbase/Kraken USD markets. Automatic native exit recommendations and financial backtests for these new exchange universes remain unresolved. See [product learnings](PRODUCT_LEARNINGS.md). No trade or production deployment was performed. There is no validated automatic per-interval winner; the negative selection results remain part of the delivered evidence.

## Evidence and current decisions

| Question | Current evidence | Decision |
|---|---|---|
| Can we improve the current seven-day ranking? | Exact 2026 CMC replay: signed Momentum improves mover hits and mean seven-day-hold return against corrected Classic; only eight signal dates | Promising candidate, exposed as an option; not a universal automatic winner |
| Does choosing method and hold from recent results improve a sequential strategy? | Three causal selectors, 156 evaluations; joint selection loses versus cash in all 12 views; aligning mature training dates does not rescue it | Reject this tested automatic selector |
| Are fixed holds useful? | Several short-view 30-day policies gain in the longer positive-signal venue panel; phase sensitivity is substantial | Retain fixed-hold baselines; no universal sell multiplier |
| Do simple ATR/resistance take-profit and stop brackets improve gains? | Only 11/192 later-period comparisons beat paired fixed holds; none wins in each year 2023–2025 | Reject unconditional adoption of these brackets |
| Can we predict reaching a resistance-based target? | Raw logistic model lowers Brier error 7.3% against a same-holding historical baseline. Causal offset calibration improves pooled error further but worsens raw predictions in 2023 and 2024 | Retain a research candidate; calibration stability remains unproven |
| Can a learned selector identify profitable early exits? | Geometry Ridge improves 12/96 pooled comparisons; adding market state improves 4/96. Same-holding historical mean always chooses fixed holding | Reject broad automatic adoption; one narrow state-model cell needs separate confirmation |
| Do indicator-based rankings improve gains? | The sampled grid identified breakout/H30 candidates. Daily replay confirms seven-view Breakout beats ordinary Momentum in 32/32 paired starts and matched-count Momentum in 26/32; it captures fewer total movers | Retain a gains-oriented breakout candidate; daily and matched-allocation evidence supersedes the broad sampled-calendar shortlist |
| Can yearly training select the new method and hold reliably? | Expanded six-method annual chooser loses capital in 11/12 views; the remaining positive view fails best-cohort-removal stress | Reject this automatic mapping; preserve descriptive fixed candidates separately |
| Do sell zones help the daily breakout strategy? | Seven-view Breakout median wealth: FixedH 1.591×, ATR 1.205×, resistance 1.187× on identical entry paths. Brackets improve the worst phase but reduce median gains | Prefer the tested 30-day fixed hold for this gains-oriented candidate; show level exits as a distinct downside tradeoff |
| Do target probabilities transfer to daily entries? | Resistance Brier 0.21955 versus historical baseline 0.25295; beats baseline in every method/view/year population. Probabilities remain overconfident, especially in 2025 | Retain verified target-reach estimates with date/horizon and calibration evidence; do not turn them directly into sell instructions |
| Should interval Cumulative or Hybrid become the default? | Exact CMC replay: both fail daily gates and pass hourly gates; hourly advantage is sensitive to missing prices. Longer venue study: both lose to Breakout later-period daily means in all 12 views | Both are normal Daily/Hourly options; keep Classic as default |

The studies use different explicit universes and signal definitions. Do not splice current CMC signed-product outcomes and positive-only Binance results into one performance claim. All prior outcomes have been viewed; new retrospective runs are not untouched holdouts.

## Dated records

- [Coin Outlook state outcomes](coin-outlook/2026-09-14/README.md), [financial foundation](coin-outlook/2026-09-14/FINANCIAL_FOUNDATION.md), [local UI and validation](coin-outlook/2026-09-14/APP_INTEGRATION.md).
- [Rank-crossing Radar](radar-velocity/2026-09-14/README.md), [110-day reconstructed earlier-era replication](radar-velocity/2026-09-14/earlier-era/README.md). No broad velocity advantage or calibrated rank probabilities established.

- [Native holding comparisons and independent verification](native-exits/2026-09-14/README.md).
- [Coinbase/Kraken public candle integration and live checks](us-exchanges/2026-09-14/README.md).

- [Cumulative/Hybrid definitions, backtests and default decision](cumulative/2026-09-13/README.md), [independent verification](cumulative/2026-09-13/verification-report.json).
- [Exact product changes and before/after CMC replay](interval-algorithms/2026-09-13/README.md), [implementation chronology](interval-algorithms/2026-09-13/NOTES.md).
- [Longer fixed holding horizons](holding-horizons/README.md).
- [Trading libraries, installation and independent arithmetic](trading-libraries/2026-09-13/README.md).
- [Adaptive algorithm/holding policy and start-date sensitivity](adaptive-policy/2026-09-13/README.md).
- [Paired ATR/resistance exit experiments](sell-zones/2026-09-13/README.md).
- [Sell-zone probability forecasts and calibration evidence](sell-zone-forecast/2026-09-13/README.md).
- [Causal probability calibration with yearly reliability](sell-zone-calibration/2026-09-13/README.md).
- [Learned conditional exits versus paired fixed holding](conditional-exits/2026-09-13/README.md).
- [Indicator algorithm grid and chronological selector](indicator-algorithms/2026-09-13/README.md), [all interval candidates](indicator-algorithms/2026-09-13/interval-candidates.md).
- [Daily schedules, paired sell levels and target probabilities](daily-breakouts/2026-09-13/README.md), [matched-allocation ranking comparison](daily-breakouts/2026-09-13/README-exposure.md).

## Delivered research and application result

- [Algorithm recommendations](ALGORITHM_RECOMMENDATIONS.md) consolidates all 12 daily views, returns versus mover breadth, hold horizons, level exits, prediction meaning and dated evidence.
- [Reusable ranking/outlook tools](outlook/2026-09-13/README.md) provide verified historical inference and full-universe ranking. The initial Python interface has 14 boundary tests, 148 outlook cases over all 74 historical fits, 216 universe comparisons and 10,908 eligibility/score checks.
- [Original application integration](outlook/2026-09-13/APP_INTEGRATION.md) records the September 13 Binance prototype and formula parity. The September 14 Coinbase/Kraken integration supersedes its live provider and model-display behavior; price-level formulas remain, but unsupported probabilities and training metrics are suppressed.
- The TypeScript port matches 36 historical complete-universe rankings (all 12 views and three methods) and 148 complete outlooks. Two current September fits were exported from fully mature historical labels; their latest training outcome is February 1, 2026 and current-period calibration is unavailable.
- The current screen uses a rolling-volume roster, which differs from the frozen annual research universe. It displays entry-time reference estimates calculated now, not purported predictions issued at a past entry open. Historical performance is not attached to this live universe.

## Evidence boundaries retained

The automatic selectors tested so far failed to establish a reliable per-interval mapping. Seven-view Breakout/H30 remains a gains-oriented research candidate, while Momentum is the mover-discovery comparator. ATR/resistance targets remain reference scenarios because unconditional adoption reduced median gains for the main breakout candidate. Current Classic/signed/hourly and general annual-hold evidence retain their separate data constraints. No unsupported market-cap-rank prediction or probability is fabricated.

Research tools, exchange selection and native holding comparisons are implemented locally. The user's request for supported automatic native exit recommendations is not complete. Deployment, trading, Coinbase/Kraken walk-forward evaluation and ongoing model refresh have not been performed.
