# Topcryptos: high-flier discovery and exhaustion exits

## Verdict

The frozen 2020–2025 venue-cohort experiment completed successfully. It supports a distinction between **broad momentum discovery** and **more selective breakout alerts**, but does not establish a universally superior ranking algorithm or a reliable peak detector.

**Recommended direction:** keep momentum as the broad research baseline; consider breakout/volume confirmation as a separately labeled experimental signal, not a proven replacement or a newly validated blended score. Treat the tested exits as risk-control alternatives with explicit missed-upside costs, not “the top is in” predictions. No production changes were made.

Status: **completed and independently verified within the stated scope.** Dataset integrity and structural checks passed; all 30 frozen synthetic tests passed. A separate read-only reviewer confirmed primary discovery counts/denominators, same-entry exit accounting, signal-date block attribution, the primary exit bootstrap interval, and deterministic score/entry/exit examples reconstructed from panel and raw CSV rows. No frozen-artifact failure was found. Secondary tables below were extracted by the coordinator from the unchanged summary; the verification scope is detailed below and is not a claim that every trade was independently reimplemented.

## What was tested

- Six annual cohorts, 2020–2025: 50 Binance Spot USDT raw pairs selected per year using the preceding December's volume and availability, not future survival.
- 143,175 daily rows; 143,160 complete and 15 partial terminal. Eleven selected memberships have 71 missing-month records, retained explicitly.
- Daily signal eligibility requires 60 consecutive complete bars and preceding-20-day median daily quote turnover of at least 1 million USDT.
- Five fixed discovery methods: positive 7-day return, positive 21-day return, a close above the prior 20 daily highs, positive 3-day acceleration with positive 7-day return, and the breakout additionally requiring 1.5× preceding-20-day median volume.
- Signals after close t enter at scheduled open t+2. Exit triggers after close d fill at open d+2. No fills at highs, closes, stop thresholds or retrospective peaks.
- A high-flier means a subsequent daily high at least 20% above entry within seven days, or 50% within 30 days. These are opportunity labels, **not realized trading returns**. Daily bars cannot determine exact intraday peak timing or ordering.
- Cooldown episodes suppress another executable alert for the same method/symbol until 30 calendar days after entry. These avoid counting every daily appearance as a new discovery; they are not statistically independent market events.
- Development: 2020–2022. Reserved retrospective evaluation: 2023–2025. This was predeclared retrospective research informed by prior work, not prospective validation or a pristine holdout.

## 1. Finding high-fliers

### Cooldown-filtered episodes, all six years

Rates below are known hits divided by all executable episodes, retaining unknown paths in the denominator. Different methods produce different episode ledgers; these are not same-entry strategy comparisons.

| Method | Episodes | +20% within 7d: hits / rate | +50% within 30d: hits / rate |
|---|---:|---:|---:|
| Return7 | 2,240 | 459 / 20.5% | 432 / 19.3% |
| Return21 | 1,522 | 347 / 22.8% | 314 / 20.6% |
| Acceleration3 | 2,517 | 536 / 21.3% | 459 / 18.2% |
| Breakout20 | 1,392 | 358 / 25.7% | 332 / 23.9% |
| VolumeBreakout20 | 1,294 | 347 / 26.8% | 324 / 25.0% |

The breakout variants were more selective and had higher hit rates, but fewer successful episodes than Return7. Acceleration3 produced the most successful seven-day episodes in this table, while its 30-day hit rate was lower than Return7's. Return21 led the repeated daily-slot hit counts, not these episode hit counts. There is no single winner across those objectives.

VolumeBreakout20's 26.8% seven-day hit rate also means approximately 73.2% did **not** reach the specified +20% threshold. That is not equivalent to a 73.2% trading-loss rate.

### Reserved 2023–2025 episode results

| Method | Episodes | +20% within 7d | +50% within 30d |
|---|---:|---:|---:|
| Return7 | 1,153 | 17.0% | 15.0% |
| Return21 | 775 | 19.4% | 13.9% |
| Acceleration3 | 1,291 | 16.2% | 13.6% |
| Breakout20 | 692 | 18.8% | 18.4% |
| VolumeBreakout20 | 635 | 19.7% | 20.2% |

The full-sample precision advantage weakened in later years, particularly at seven days. VolumeBreakout20 and Return21 had very similar seven-day episode hit rates in this period. These secondary comparisons were not separately validated as winning hypotheses.

### Predeclared primary discovery test: Breakout20 versus Return7

The primary metric was successful daily selections per ten available slots, counting unused slots as unused. Across 2,192 decision dates:

- Return7: 3,994 seven-day hits / 17,368 daily alerts; **1.822 hits per ten slots**.
- Breakout20: 1,134 / 3,949; **0.517 hits per ten slots**.
- Difference, Breakout20 minus Return7: **−1.305 hits per ten slots**, 95% moving-block interval **[−1.479, −1.126]**.

Thus Breakout20 failed to improve the predeclared broad-discovery metric. Its daily alert precision was higher: 28.7% versus 23.0%. The corresponding known-path universe base rate was 19.2%; conditional lifts were about 1.50× and 1.20×. These are pooled daily comparisons, not episode base rates or proof of a within-date ranking advantage independent of market timing.

The 3,994 versus 1,134 counts are repeated coin-date hits, **not unique coins or distinct runs**. The episode comparison is 459 versus 358 successful alerts.

Unknown daily paths: Return7 22/63 and Breakout20 4/13 at seven/30 days. Episode unknowns are smaller; at seven days Return7 has two and Breakout20 zero. Missing paths remain in explicit bounds rather than being dropped.

## 2. Exits: downside control is not peak detection

All policies use the same 2,240 executable Return7 episodes. Each is an independent unit-capital round trip, with a 30-day hard exit. Fees below are 50 basis points on each side. Unknown exit counts differ, so the descriptive means are conditional on each policy's known exits; the primary paired comparison uses common known pairs and explicit missing scenarios.

| Exit | Known exits | Mean net return | Median net return | 10th-percentile net return | Median holding time |
|---|---:|---:|---:|---:|---:|
| Fixed30 | 2,234 | +4.50% | −4.33% | −33.53% | 30 days |
| Trail15 | 2,238 | +2.22% | −7.31% | −21.64% | 15 days |
| Chandelier3ATR | 2,237 | +3.92% | −7.57% | −24.90% | 18 days |
| EMA10Break | 2,238 | +2.80% | −4.26% | −17.08% | 7 days |

The 10th percentile is a cutoff, **not the average of the worst decile**. Positive means alongside negative medians indicate skew; they are not evidence that a typical trade was profitable. These overlapping trades do not form a portfolio wealth curve.

### Primary exit comparison

Trail15 minus Fixed30, at 50bps per side:

- 2,234 complete pairs: **−2.28 percentage points**, 95% moving-block interval **[−5.71, +0.94] pp**.
- All 2,240 entries, unknown exits assigned zero gross return before fees: −2.27 pp, interval [−5.70, +0.94].
- Unknown exits assigned total gross loss before fees: −2.10 pp, interval [−5.61, +1.20].

The intervals include zero. There is no demonstrated net-return improvement from Trail15. Its 10th-percentile outcome is less severe, but its mean and median return are lower.

Of Trail15's 1,714 early exits, 1,710 had evaluable complete post-exit paths. **1,091/1,710 = 63.8%** were followed by a daily high at least 10% above the exit fill within the original 30-day horizon. Four early post-exit paths were unknown; hard exits are not part of this denominator.

Mean pre-exit giveback was 24.56 percentage points of entry capital for Trail15 versus 29.65 for Fixed30. However, total opportunity shortfall including subsequent missed upside was 31.96 versus 29.65 points. These hindsight path grades do not assume the high could actually have been sold.

Chandelier3ATR's evaluable premature-exit rate was 57.0%; EMA10Break's was 61.7%. EMA10Break held for a median seven days. Neither establishes dependable peak calling. Their comparisons are secondary and exploratory.

**Reporting correction:** the frozen summary's `loss_frequency_known_conditional` is computed from gross returns (`high-flier-runner.py:1593`), not net 50bps returns. Do not put that field under a net-loss heading. The original numerical output is preserved unchanged.

### Regime stability

Mean net returns for Fixed30 / Trail15:

- 2020: +15.76% / +12.06%
- 2021: +16.61% / +5.51%
- 2022: −9.40% / −6.03%
- 2023: +4.73% / +4.50%
- 2024: +6.13% / +3.92%
- 2025: −6.82% / −6.17%

Reserved 2023–2025 means were +1.38% for Fixed30, +0.77% for Trail15, +0.35% for Chandelier3ATR and +1.02% for EMA10Break. Stops helped relative to holding in some declining years but not consistently. No adaptive regime-switching rule was tested; hindsight identification of favorable years cannot justify one.

Both primary confidence intervals use 1,000 full-calendar 30-day moving-block replicates, seed 20260912. These account for local dependence, not all annual-cohort or market-wide dependence. No p-values or significance claims for the secondary comparisons are supplied.

## What this means for a v2

1. **Separate discovery from exit warnings.** Do not hide both objectives in one unexplained acceleration blend.
2. **Keep simple momentum baselines visible.** Return7 and Return21 are useful comparators, not a proven universal replacement for Classic. This dataset has no market-cap ranks and cannot exactly backtest Classic.
3. **Prototype breakout/volume confirmation only as experimental.** The selective signal has a plausible precision-versus-coverage role. Combining it with momentum into a new ranking, union, badge system or weighted strategy has not been backtested here.
4. **Do not ship a “peak detected” claim.** The studied exits can be labeled trend/risk warnings with explicit false/early-exit limitations, not top predictions.
5. **Keep correctness repairs separate from predictive claims.** Earlier scoring audits found reproducible issues, but fixing those does not establish that a replacement predicts winners.

A future prospective paper-alert log could test a chosen product behavior without changing these historical results. It would be a new experiment, not permission to optimize these thresholds on this dataset. No additional research round or production implementation has been started.

## Material limitations

- This is a fixed annual venue-pair cohort, not global top-500 coverage or exhaustive early discovery. New within-year listings and less-liquid runners can be excluded by design.
- AUDUSDT, a fiat pair, was selected in 2023. It contributed 88 daily alerts and 12 episodes across methods, including 28/3 for Return7 and 7/3 for Breakout20. It was not removed after outcomes.
- Replacement LUNA inherited the annual raw-symbol slot after its own warmup: 104 daily alerts and 15 episodes across methods, including 42/4 for Return7 and 2/2 for Breakout20. Old/new price segments were not stitched. This is not a canonical-asset cohort.
- The source-linked identity registry is bounded, not exhaustive. Archived availability is not proof of contemporaneous publication timing or a complete historical exchange registry.
- Lagged turnover is not order-book depth. Fees do not model slippage, capacity, outages or guaranteed fills. Positive-activity opens are execution proxies.
- MFE labels use daily highs and do not establish that the threshold was capturable after intervening downside. Exact intraday peak ordering is unavailable.
- This experiment grades seven/30-day opportunities and exits capped at 30 days. It does not validate multi-month holding, cycle-start selection or an all-time return signal.
- Source data are research-only under the recorded licensing scope; no production data integration or raw-archive redistribution is authorized by this report.

## Independent empirical verification

A separate read-only reviewer verified the immutable result/summary hashes before and after checking, without an empirical rerun or changing the code or data. Confirmed items included:

- Return7/Breakout20 daily slots, alerts, known hits, unknown paths, precision definitions and universe base rates.
- The 2,240 Return7 episodes and 459 versus 358 cooldown-episode seven-day hits.
- Fixed30/Trail15 mean net returns, p10 cutoffs, 2,234 common pairs, exact fees, and the 1,091/1,710 evaluable premature-exit denominator.
- Independently reproduced primary exit block CI: [−5.71347, +0.93825] percentage points.
- All declared calendar/block assignments by signal date. Independently computed block-specific paired CIs were development [−11.3757, +2.0615] pp and reserved retrospective [−3.1046, +1.9938] pp; neither excludes zero.
- Deterministic reconstruction of eligibility/rank, scores, delayed entries and all four exits for DASHUSDT (early exits), WAVESUSDT (hard exit), and BNXUSDT (identity/missing-data case), plus XMRUSDT's first executable breakout alert. Fifteen representative normalized rows matched source ZIP CSV rows exactly.

The reviewer separately calculated **net** 50bps loss rates: Fixed30 **57.12%**, Trail15 **64.66%**. These differ from the frozen summary's gross loss rates, 55.82% and 63.09%, respectively. This is a reporting clarification, not a correction to the preserved numeric artifacts.

Return7 discovery concentration: the top ten symbols accounted for 21.58% of daily hits and 21.57% of episode hits; the largest episode-hit contributor was NEARUSDT (14 of 459). This measures hit concentration, not profit concentration or statistical independence.

## Reproducibility and evidence

- Protocol: `high-flier-protocol.md`
- Data protocol: `high-flier-data-protocol.md`
- Primary-source review: `high-flier-evidence.md`
- Audit/recovery history: `high-flier-pre-outcome-audit.md`
- Run: `python3 -B research/algorithm-comparison/high-flier-runner.py --run-id frozen-20260913-v1` (already executed; refuses to overwrite existing artifacts).
- Results: `high-flier-results-frozen-20260913-v1.json.gz`, SHA-256 `54c3197473d5aa5e33879a923053a0b9cc97ff4878434c24f75dea981acdbb35`.
- Summary: `high-flier-summary-frozen-20260913-v1.json`, SHA-256 `79404c94affe9c155d64cee28811f1bb18fac1cd0de84ec6f8ce17b154f09a5a`.
- Runner: `4a371b5f30db80fa8c0475727a9e59ea0bba47c5216a63630f9bddda0f50eeb7`.
- Manifest: `7264db85e95a076d587115ace6a1b3a1a8c07a2a645447166103279585f28dc2`.

The empirical run exited successfully in about 2m05s with measured maximum RSS 538,000 KiB under a 2 GiB address-space limit. Production files were not changed; no commits, installs or deployments were performed.
