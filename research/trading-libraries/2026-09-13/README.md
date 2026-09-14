# Trading algorithm libraries — 2026-09-13

The user asked for trading algorithm libraries to evaluate strategies on data already available. Installed VectorBT 1.1.0 and TA-Lib 0.7.1 in `.cache/trading-libs-venv` with Python 3.12. The application dependency files are unchanged.

## Selected tools

| Library/repo | Role for TopCryptos | Status |
|---|---|---|
| [VectorBT](https://github.com/polakowo/vectorbt) | Batch strategy, parameter, interval and exit comparisons; explicit order/fill/cost simulation | Installed; local research |
| [TA-Lib](https://github.com/TA-Lib/ta-lib-python) | Tested indicator implementations: rate of change, EMA, RSI, MACD, ATR and others | Installed |
| [Freqtrade strategies](https://github.com/freqtrade/freqtrade-strategies) | Concrete example strategy implementations to study and translate into explicitly tested candidates | Reviewed; not installed or treated as proven profitable |
| [Freqtrade](https://github.com/freqtrade/freqtrade) | Crypto strategy framework, backtesting and lookahead/recursive checks | Useful larger alternative; not needed for current exact-scorer replay |
| [backtesting.py](https://github.com/kernc/backtesting.py) | Compact event-driven strategy experiments | Considered; VectorBT better matches the intended batch comparisons |
| [NautilusTrader](https://github.com/nautechsystems/nautilus_trader) / [LEAN](https://github.com/QuantConnect/Lean) | More extensive event-driven execution simulation | Considered; larger integration than this research task needs |

These are implementation tools, not evidence that an included indicator or example strategy improves returns. Indicators become strategies only after entry, exit, ranking, allocation and timing rules are specified.

VectorBT is source-available under [Apache 2.0 plus Commons Clause](https://github.com/polakowo/vectorbt/blob/master/LICENSE.md), not an unrestricted Apache-only library. This installation is for local research. TA-Lib's Python wrapper uses BSD-2-Clause. Consult the actual license before incorporating a research engine into a commercial service.

## Reproduce and use

```sh
python3.12 -m venv .cache/trading-libs-venv
.cache/trading-libs-venv/bin/python -m pip install -r research/trading-libraries/2026-09-13/requirements.lock.txt
.cache/trading-libs-venv/bin/python research/trading-libraries/2026-09-13/check.py
```

The check refuses to overwrite `evaluation.json`; preserve it and use a new dated run directory for another execution. The lock records the complete installed environment. Initial resolution selected Plotly 7.0.0, whose removed `scattermapbox` template field broke VectorBT import. Pinning Plotly 5.24.1 fixed the dependency mismatch; the final lock records this pin.

## Verification and evaluation scope

`check.py` verifies the existing compressed ledger hash, then gives every known saved outcome to VectorBT as an independent unit-capital buy/sell round trip. It compares the engine's result with saved 0/50/100-bps-per-side net returns and verifies two filled orders per round trip. This checks execution arithmetic; it does not independently regenerate rankings, verify historical quote publication timing, or turn overlapping cohorts into a capital-constrained portfolio. The earlier [raw-cache verifier](../../interval-algorithms/2026-09-13/verify.py) separately checks entry/exit prices.

TA-Lib runs ROC7, EMA21, RSI14 and ATR14 on the saved 2024 BTC cohort, requiring unique consecutive daily bars and one identity segment. Prefix checks verify that adding future observations leaves earlier indicator values unchanged; ROC is also checked against direct price ratios. This is indicator integration verification, not a backtest proving an RSI/EMA/ATR strategy profitable.

The paired evaluation covers every saved Momentum/Trend-quality cell versus **current corrected Classic**, with identical decision/entry/exit dates within each comparison. It reports return differences, period wins, median differences, earlier/later chronological halves, omission of the single best paired period, 100bps cost stress, total-loss missing-exit stress, and big-mover hit-count differences. Both native and common-input comparisons are preserved.

All differences are retrospective and were examined after viewing the original results. The chronological halves are descriptive stability checks, not trained walk-forward validation or untouched holdouts. No Sharpe, compounded wealth, significance test, or automatic per-interval winner claim is made from overlapping cohort returns. Adjacent view settings often have different signal dates, so comparing their aggregate means is not a controlled parameter perturbation.

The broader search also inspected ML4T agent skills and skfolio validation tooling. They were not installed: the user's clarified need is trading algorithm libraries, and the existing scorer/ledger should remain the reference for exact product parity.

## Completed checks and concrete findings

Run: 2026-09-13T19:44:17.271793+00:00 to 2026-09-13T19:44:29.364169+00:00. VectorBT matched all 58,862 known round trips separately at 0, 50 and 100bps per side, maximum absolute error below 9e-16. TA-Lib prefix-invariance checks passed on 486 saved daily BTC bars, and ROC7 matched direct price ratios. Package dependency validation passed.

All 272 candidate/current-Classic comparison cells are in [evaluation.json](evaluation.json). Selected seven-day-hold comparisons below use native caller behavior and modeled 50bps per side. Each row compares methods on the same dates, but the two view rows have different dates.

| View / candidate | Dates | Return advantage over corrected Classic | Winning dates | Additional +20% hits | Advantage without best paired date | Later-half advantage |
|---|---:|---:|---:|---:|---:|---:|
| 7 / momentum | 8 | +5.80 pp | 6 | +10 | +4.53 pp | +6.39 pp |
| 6 / trend-quality | 8 | +0.72 pp | 4 | +7 | -2.19 pp | +5.01 pp |

Seven-day Momentum is the clearest candidate for further strategy evaluation in this local snapshot study: its advantage survives removing its best paired date, increasing modeled costs and total-loss marking of missing exits. Corrected Classic had 22/80 +20% hits and +11.86% mean net return; Momentum had 32/80 and +17.66%. Eight dates and selection after a broad historical search do not establish a production winner or recommended sell timeline. This fixed seven-day hold must not be inferred for every view.

Six-day Trend quality looks better against the old buggy scorer than against current Classic: the current-baseline advantage is only +0.72 pp, and turns negative when its best paired date is removed. It is not an equally strong improvement candidate. The earlier promising-results commentary used the old baseline; this comparison sharpens that conclusion.
