# Reusable algorithm and target outlook tools — 2026-09-13

This is the callable research interface to the backtested ranking formulas and monthly target models. It ranks a supplied daily OHLC universe and calculates an entry-time target outlook with exact signal, entry, model and sale-deadline dates. It does not fetch market data, train during inference, choose an outcome-winning interval automatically, or place orders.

For the practical algorithm/holding decisions and all interval comparisons, read [Algorithm recommendations](../../ALGORITHM_RECOMMENDATIONS.md). Seven-view Breakout/H30 is the strongest gains-oriented example; it finds fewer movers than the matched Momentum comparator. The tested ATR/resistance exits reduced its median gains, so their levels are reference scenarios rather than automatic take-profit instructions.

## Run the historical example

From the repository root:

```sh
.cache/trading-libs-venv/bin/python research/outlook/2026-09-13/outlook.py outlook \
  --input research/outlook/2026-09-13/example-input.json
```

The example was selected by date, not by profitable outcome: the earliest 2024 BTCUSDT Breakout/view7 selection. It supplies 60 complete bars through **2024-01-01**, entry open **2024-01-03** at **44,946.91**, and no later bars or exit labels. H30 ends **2024-02-02**. Its frozen reference target is approximately **49,200.14** and stop **42,111.42**. The January 2024 resistance model assigns approximately **64.19%** to a daily high reaching that target before the deadline; the separate ATR model assigns **57.52%**. These are different fitted models of policy labels and can disagree even when their numeric targets coincide. Do not average them into a confidence interval.

These are historical USDT-quoted venue prices and historical model estimates, not today's BTC outlook. Each selected fit used only labels whose hard deadlines were before its January 1, 2024 cutoff. The bundled 2023–2025 validation metrics are explicitly retrospective context and never an input to the probability calculation.

## Ranking a supplied universe

`rank` accepts a JSON object with shared `signal_date`, `view_observations`, `interval_unit: "day"`, `algorithm`, and an `instruments` list. Each instrument provides `instrument_key`, `cohort_member`, optional `symbol`, and `bars`. The three supported research methods are `Momentum`, `Breakout` and `VolumeBreakout`.

All instruments use the same comparison date and window. Positive scores sort descending, with immutable identity as the tie-break; at most ten are selected, each assigned 10%, and unused slots remain cash. Ineligible instruments remain visible in `universe_assessments`. This ranks only the supplied universe; it cannot establish that the caller supplied the complete historical membership.

For a one-instrument interface example, this wraps the bundled BTC record as a universe; it is not a meaningful cross-coin ranking:

```sh
python3 - <<'PY' | .cache/trading-libs-venv/bin/python research/outlook/2026-09-13/outlook.py rank
import json
from pathlib import Path
x = json.loads(Path('research/outlook/2026-09-13/example-input.json').read_text())
print(json.dumps({
    'signal_date': x['signal_date'], 'view_observations': 7,
    'interval_unit': 'day', 'algorithm': 'Breakout', 'instruments': [x],
}))
PY
```

## Input and support rules

- Views are 3/4/5/6/7/10/14/21/30/45/60/90 daily observations. N observations cover N−1 elapsed close-return days.
- Each bar supplies its date, the same annual `instrument_key`, complete status, positive consistent OHLC prices and nonnegative quote volume. Duplicate past dates and mixed identities are rejected. Future bars are ignored before their prices are inspected.
- The exact existing scoring eligibility requires 60 complete consecutive days, a complete viewed window, explicit cohort membership, and median quote volume of at least 1 million over the preceding 20 days. The caller supplies membership; the tool does not infer it from returns.
- An outlook additionally requires actual entry date and known entry price. Entry must be signal+2 days. A single-coin outlook establishes qualification, not top-ten membership; use `rank` on the full supplied universe for selection.
- Daily target probabilities support H30 only. Other holds return `unsupported-horizon`; they are not substituted with a 30-day probability. Hourly inputs are rejected. The wider backtest grid remains available in the research reports.
- Nonqualifying or ineligible inputs do not receive a probability. An eligible request without the exact entry-month fit retains its price geometry but receives `no-exact-month-model` and a null probability. The bundled fits run from January 2023 through January 2026; a September 2026 request does not silently use a January model.
- Models describe a daily high reaching a reference target by H30, including paths with an earlier stop or sale. They do not forecast target-before-stop, executed profit, an exact sale price, or market-cap rank.

The fixed H30 plan is labeled a research candidate for seven-view Breakout and an evaluated reference for other method/view combinations. There is no validated automatic mapping choosing the best method or holding period for a new interval. Targets remain reference levels; `automatic_level_exit` is false.

## Reproducibility

[build-bundle.py](build-bundle.py) exports all **74 fitted models and 296 validation rows** unchanged from the independently verified daily study. [model-bundle.json](model-bundle.json) contains coefficients, scalers, training dates, support and metrics. [bundle-manifest.json](bundle-manifest.json) records source and export hashes. The exporter refuses overwrite. The CLI verifies its bundle and frozen helper hashes, uses the existing exact scorer/level/feature functions, and evaluates saved coefficients directly.

The example JSON contains only signal-time history and the actual entry open. No provider credentials or future realized outcomes are included. Existing application modes remain Classic/Momentum/TrendQuality on CMC snapshots; that price-only input model cannot reproduce these OHLC breakout and ATR rules.

Independent verification passed at **2026-09-13 21:02:17 UTC**: **14 boundary tests, 148 historical outlooks covering all 74 saved fits, 216 full-universe rankings, and 10,908 eligibility/score comparisons**. See [outlook-verification.json](outlook-verification.json). Run boundary tests with `.cache/trading-libs-venv/bin/python -m unittest discover -s research/outlook/2026-09-13 -p test_outlook.py`. The historical verifier is `verify.py`; it refuses to overwrite its dated report. Initial verification and code before the transitive helper hash guard are preserved under `initial/`.
