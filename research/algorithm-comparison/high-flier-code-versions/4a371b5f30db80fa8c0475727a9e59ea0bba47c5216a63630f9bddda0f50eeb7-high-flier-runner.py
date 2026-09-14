#!/usr/bin/env python3
"""Isolated, predeclared high-flier discovery and exit research runner.

The empirical CLI refuses to read panel rows unless its manifest explicitly records a
frozen protocol and SHA-256 hashes for every input. Importing this file is side-effect
free so synthetic tests can exercise the causal primitives before the data freeze.
"""

from __future__ import annotations

import argparse
import csv
import dataclasses
import datetime as dt
import gzip
import hashlib
import io
import json
import math
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, Sequence


RUNNER_VERSION = "1.0.0"
SCHEMA_VERSION = "high-flier-data-v1"
RESULTS_SCHEMA_VERSION = "high-flier-results-v1"
SUMMARY_SCHEMA_VERSION = "high-flier-summary-v1"
MIN_HISTORY = 60
VOLUME_LOOKBACK = 20
MIN_MEDIAN_QUOTE_VOLUME = 1_000_000.0
MAX_ALERTS = 10
EPISODE_COOLDOWN_DAYS = 30
ENTRY_DELAY_DAYS = 2
HARD_EXIT_DAYS = 30
EXIT_DELAY_DAYS = 2
BOOTSTRAP_BLOCK_DAYS = 30
BOOTSTRAP_REPLICATES = 1_000
BOOTSTRAP_SEED = 20260912
FEE_BPS = (0, 10, 50, 100)
METHODS = (
    "Return7",
    "Return21",
    "Breakout20",
    "Acceleration3",
    "VolumeBreakout20",
)
EXIT_RULES = ("Fixed30", "Trail15", "Chandelier3ATR", "EMA10Break")
HORIZONS = (7, 30)
ABSOLUTE_THRESHOLDS = {7: 0.20, 30: 0.50}


class ProtocolError(ValueError):
    """Raised when frozen input or causal-study invariants are violated."""


@dataclasses.dataclass(frozen=True, slots=True)
class Bar:
    symbol: str
    date: dt.date
    open: float
    high: float
    low: float
    close: float
    quote_volume: float
    cohort_member: bool
    cohort_year: int = 0
    reporting_block: str = "synthetic"
    instrument_id: str = "synthetic"
    identity_segment_id: str = "synthetic"
    base_volume: float = 1.0
    trade_count: int = 1
    bar_status: str = "valid"
    scheduled_midnight_open: bool = True


@dataclasses.dataclass(frozen=True, slots=True)
class Grade:
    horizon: int
    entry_date: dt.date
    entry_status: str
    path_status: str
    endpoint_status: str
    entry_open: float | None
    mfe: float | None
    mae: float | None
    endpoint_return: float | None
    absolute_hit: bool | None
    first_threshold_date: dt.date | None
    first_peak_date: dt.date | None


@dataclasses.dataclass(frozen=True, slots=True)
class ExitOutcome:
    rule: str
    status: str
    trigger_date: dt.date | None
    scheduled_exit_date: dt.date
    exit_date: dt.date | None
    exit_open: float | None
    gross_return: float | None
    holding_days: int | None
    early_exit: bool | None
    mfe_before_exit: float | None
    mae_before_exit: float | None
    full_mfe_30: float | None
    full_mae_30: float | None
    profit_given_back: float | None
    total_opportunity_shortfall: float | None
    peak_capture_ratio: float | None
    exit_minus_peak_days: int | None
    premature_10pct_status: bool | None


def parse_date(value: str) -> dt.date:
    try:
        parsed = dt.date.fromisoformat(value)
    except ValueError as exc:
        raise ProtocolError(f"invalid ISO date: {value!r}") from exc
    if parsed.isoformat() != value:
        raise ProtocolError(f"date must be canonical YYYY-MM-DD: {value!r}")
    return parsed


def date_range(start: dt.date, end: dt.date) -> Iterator[dt.date]:
    current = start
    while current <= end:
        yield current
        current += dt.timedelta(days=1)


def finite_positive(value: float) -> bool:
    return math.isfinite(value) and value > 0.0


def bar_status_parts(status: str) -> tuple[str, frozenset[str]]:
    parts = tuple(part for part in status.split("|") if part)
    if not parts:
        raise ProtocolError("bar_status must not be empty")
    status_class = "complete" if parts[0] == "valid" else parts[0]
    if status_class not in {"complete", "partial_terminal", "invalid"}:
        raise ProtocolError(f"unknown bar_status class: {parts[0]!r}")
    return status_class, frozenset(parts[1:])


def bar_status_class(bar: Bar) -> str:
    return bar_status_parts(bar.bar_status)[0]


def bar_status_flags(bar: Bar) -> frozenset[str]:
    return bar_status_parts(bar.bar_status)[1]


def bar_is_complete(bar: Bar) -> bool:
    return bar_status_class(bar) == "complete"


def bar_open_is_executable(bar: Bar) -> bool:
    """Allow complete or partial-terminal opens only with actual trading activity."""
    return (
        bar.scheduled_midnight_open
        and finite_positive(bar.open)
        and bar.trade_count > 0
        and bar.base_volume > 0.0
        and bar.quote_volume > 0.0
        and bar_status_class(bar) in {"complete", "partial_terminal"}
    )


def validate_bar(bar: Bar) -> None:
    if not bar.symbol or bar.symbol != bar.symbol.strip():
        raise ProtocolError(f"invalid symbol {bar.symbol!r}")
    if not bar.instrument_id or not bar.identity_segment_id:
        raise ProtocolError(f"{bar.symbol} {bar.date}: identity fields are required")
    numeric = (
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.base_volume,
        bar.quote_volume,
    )
    if not all(math.isfinite(value) for value in numeric):
        raise ProtocolError(f"{bar.symbol} {bar.date}: numeric fields must be finite")
    if bar_is_complete(bar) and bar.trade_count < 0:
        raise ProtocolError(f"{bar.symbol} {bar.date}: complete trade_count must be nonnegative")
    if bar_is_complete(bar):
        prices = (bar.open, bar.high, bar.low, bar.close)
        if not all(finite_positive(value) for value in prices):
            raise ProtocolError(
                f"{bar.symbol} {bar.date}: valid bar OHLC must be positive finite"
            )
        if bar.high < max(bar.open, bar.close) or bar.low > min(bar.open, bar.close):
            raise ProtocolError(f"{bar.symbol} {bar.date}: invalid high/low ordering")
        if bar.low > bar.high:
            raise ProtocolError(f"{bar.symbol} {bar.date}: low exceeds high")
        if bar.base_volume < 0.0 or bar.quote_volume < 0.0:
            raise ProtocolError(f"{bar.symbol} {bar.date}: valid volume must be nonnegative")


def analysis_key(bar: Bar) -> str:
    return f"{bar.cohort_year}:{bar.instrument_id}"


def build_panel(rows: Iterable[Bar]) -> dict[str, tuple[Bar, ...]]:
    """Build identity-safe series; duplicate dates become unusable sentinel bars."""
    grouped_raw: dict[str, list[Bar]] = defaultdict(list)
    prior_input: dict[str, tuple[dt.date, int]] = {}
    for input_index, bar in enumerate(rows):
        validate_bar(bar)
        key = analysis_key(bar)
        prior = prior_input.get(key)
        current = (bar.date, input_index)
        if prior is not None and current[0] < prior[0]:
            raise ProtocolError(
                f"bars must be date-ordered within instrument: {key} "
                f"{prior[0]} then {current[0]}"
            )
        prior_input[key] = current
        grouped_raw[key].append(bar)
    if not grouped_raw:
        raise ProtocolError("panel contains no bars")

    grouped: dict[str, tuple[Bar, ...]] = {}
    for key, raw_bars in sorted(grouped_raw.items()):
        by_date: dict[dt.date, list[Bar]] = defaultdict(list)
        for bar in raw_bars:
            by_date[bar.date].append(bar)
        bars: list[Bar] = []
        for day in sorted(by_date):
            same_day = by_date[day]
            if len(same_day) == 1:
                bars.append(same_day[0])
            else:
                first = same_day[0]
                details = set(bar_status_flags(first)) | {"duplicate_date"}
                bars.append(
                    dataclasses.replace(
                        first,
                        bar_status="|".join(("invalid", *sorted(details))),
                    )
                )
        grouped[key] = tuple(bars)
    return grouped


def panel_indexes(
    panel: Mapping[str, Sequence[Bar]],
) -> tuple[dict[str, dict[dt.date, int]], dict[str, dict[dt.date, Bar]]]:
    positions: dict[str, dict[dt.date, int]] = {}
    by_date: dict[str, dict[dt.date, Bar]] = {}
    for symbol, bars in panel.items():
        positions[symbol] = {bar.date: index for index, bar in enumerate(bars)}
        by_date[symbol] = {bar.date: bar for bar in bars}
    return positions, by_date


def consecutive_through(bars: Sequence[Bar], index: int, count: int) -> bool:
    if index + 1 < count:
        return False
    start = index - count + 1
    window = bars[start : index + 1]
    return (
        bars[index].date - bars[start].date == dt.timedelta(days=count - 1)
        and all(bar_is_complete(bar) for bar in window)
    )


def is_eligible(bars: Sequence[Bar], index: int) -> bool:
    """Return shared eligibility using signal-day information only."""
    if index < 0 or index >= len(bars):
        return False
    signal_bar = bars[index]
    if not signal_bar.cohort_member or not consecutive_through(bars, index, MIN_HISTORY):
        return False
    lagged_volumes = [bar.quote_volume for bar in bars[index - VOLUME_LOOKBACK : index]]
    return (
        len(lagged_volumes) == VOLUME_LOOKBACK
        and statistics.median(lagged_volumes) >= MIN_MEDIAN_QUOTE_VOLUME
    )


def score_methods(bars: Sequence[Bar], index: int) -> dict[str, float | None]:
    """Compute all five fixed scores from bars no later than index."""
    if index < 21:
        return {method: None for method in METHODS}
    close = bars[index].close
    return7 = math.log(close / bars[index - 7].close)
    return21 = math.log(close / bars[index - 21].close)
    prior_high = max(bar.high for bar in bars[index - 20 : index])
    breakout20 = math.log(close / prior_high)
    acceleration3 = math.log(close / bars[index - 3].close) - math.log(
        bars[index - 3].close / bars[index - 6].close
    )
    prior_volume_median = statistics.median(
        bar.quote_volume for bar in bars[index - 20 : index]
    )
    volume_gate = bars[index].quote_volume >= 1.5 * prior_volume_median
    return {
        "Return7": return7 if return7 > 0.0 else None,
        "Return21": return21 if return21 > 0.0 else None,
        "Breakout20": breakout20 if breakout20 > 0.0 else None,
        "Acceleration3": (
            acceleration3 if acceleration3 > 0.0 and return7 > 0.0 else None
        ),
        "VolumeBreakout20": breakout20 if breakout20 > 0.0 and volume_gate else None,
    }


def rank_scores(
    scores: Mapping[str, float | None],
    limit: int = MAX_ALERTS,
    stable_symbols: Mapping[str, str] | None = None,
) -> list[tuple[str, float]]:
    qualifying = [
        (key, score)
        for key, score in scores.items()
        if score is not None and math.isfinite(score) and score > 0.0
    ]
    qualifying.sort(
        key=lambda item: (
            -item[1],
            stable_symbols[item[0]] if stable_symbols is not None else item[0],
            item[0],
        )
    )
    return qualifying[:limit]


def grade_forward(
    bars_by_date: Mapping[dt.date, Bar], signal_date: dt.date, horizon: int
) -> Grade:
    entry_date = signal_date + dt.timedelta(days=ENTRY_DELAY_DAYS)
    entry = bars_by_date.get(entry_date)
    if entry is None or not bar_open_is_executable(entry):
        return Grade(
            horizon=horizon,
            entry_date=entry_date,
            entry_status="missing",
            path_status="unknown_missing_entry",
            endpoint_status="unknown_missing_entry",
            entry_open=None,
            mfe=None,
            mae=None,
            endpoint_return=None,
            absolute_hit=None,
            first_threshold_date=None,
            first_peak_date=None,
        )

    path_dates = [entry_date + dt.timedelta(days=offset) for offset in range(horizon)]
    path = [bars_by_date.get(day) for day in path_dates]
    path_complete = all(bar is not None and bar_is_complete(bar) for bar in path)
    endpoint_date = entry_date + dt.timedelta(days=horizon)
    endpoint = bars_by_date.get(endpoint_date)
    endpoint_executable = endpoint is not None and bar_open_is_executable(endpoint)

    mfe: float | None = None
    mae: float | None = None
    absolute_hit: bool | None = None
    first_threshold_date: dt.date | None = None
    first_peak_date: dt.date | None = None
    if path_complete:
        complete_path = [bar for bar in path if bar is not None]
        peak_high = max(bar.high for bar in complete_path)
        trough_low = min(bar.low for bar in complete_path)
        mfe = peak_high / entry.open - 1.0
        mae = trough_low / entry.open - 1.0
        threshold_price = entry.open * (1.0 + ABSOLUTE_THRESHOLDS[horizon])
        absolute_hit = peak_high >= threshold_price
        first_threshold_date = next(
            (bar.date for bar in complete_path if bar.high >= threshold_price), None
        )
        first_peak_date = next(bar.date for bar in complete_path if bar.high == peak_high)

    endpoint_return = endpoint.open / entry.open - 1.0 if endpoint_executable else None
    return Grade(
        horizon=horizon,
        entry_date=entry_date,
        entry_status="known",
        path_status="known" if path_complete else "unknown_incomplete_path",
        endpoint_status=(
            "known" if endpoint_executable else "unknown_unexecutable_endpoint_open"
        ),
        entry_open=entry.open,
        mfe=mfe,
        mae=mae,
        endpoint_return=endpoint_return,
        absolute_hit=absolute_hit,
        first_threshold_date=first_threshold_date,
        first_peak_date=first_peak_date,
    )


def relative_top_decile(
    grades: Mapping[str, Grade], stable_symbols: Mapping[str, str] | None = None
) -> tuple[set[str], int, int, bool]:
    """Rank complete paths only; exactly ceil(10%) qualify with stable symbol ties."""
    known = [(key, grade.mfe) for key, grade in grades.items() if grade.mfe is not None]
    known.sort(
        key=lambda item: (
            -float(item[1]),
            stable_symbols[item[0]] if stable_symbols is not None else item[0],
            item[0],
        )
    )
    slots = math.ceil(len(known) * 0.10) if known else 0
    selected = {symbol for symbol, _ in known[:slots]}
    unknown_count = len(grades) - len(known)
    return selected, len(known), unknown_count, unknown_count > 0


def net_return_from_gross(gross_return: float, one_way_bps: int) -> float:
    if not math.isfinite(gross_return) or gross_return <= -1.0:
        if gross_return == -1.0:
            return -1.0
        raise ValueError("gross return must be finite and no less than -100%")
    if one_way_bps < 0:
        raise ValueError("fee bps must be nonnegative")
    fee = one_way_bps / 10_000.0
    return (1.0 + gross_return) * (1.0 - fee) / (1.0 + fee) - 1.0


def exact_unit_return(entry_price: float, exit_price: float, one_way_bps: int) -> float:
    if not finite_positive(entry_price) or not finite_positive(exit_price):
        raise ValueError("entry and exit prices must be positive finite")
    if one_way_bps < 0:
        raise ValueError("fee bps must be nonnegative")
    return net_return_from_gross(exit_price / entry_price - 1.0, one_way_bps)


def ema10_by_date(bars: Sequence[Bar]) -> dict[dt.date, float | None]:
    values: dict[dt.date, float | None] = {bar.date: None for bar in bars}
    complete = [bar for bar in bars if bar_is_complete(bar)]
    if len(complete) < 10:
        return values
    ema = statistics.mean(bar.close for bar in complete[:10])
    values[complete[9].date] = ema
    alpha = 2.0 / 11.0
    for bar in complete[10:]:
        ema = alpha * bar.close + (1.0 - alpha) * ema
        values[bar.date] = ema
    return values


def atr14_by_date(bars: Sequence[Bar]) -> dict[dt.date, float | None]:
    """Compute ATR only where the prior close and 14 TR bars are calendar-consecutive."""
    result: dict[dt.date, float | None] = {bar.date: None for bar in bars}
    true_ranges: list[float | None] = [None]
    for index in range(1, len(bars)):
        bar = bars[index]
        previous = bars[index - 1]
        if (
            bar.date - previous.date != dt.timedelta(days=1)
            or not bar_is_complete(bar)
            or not bar_is_complete(previous)
        ):
            true_ranges.append(None)
            continue
        true_ranges.append(
            max(
                bar.high - bar.low,
                abs(bar.high - previous.close),
                abs(bar.low - previous.close),
            )
        )
    for index in range(14, len(bars)):
        window = true_ranges[index - 13 : index + 1]
        if all(value is not None for value in window):
            result[bars[index].date] = statistics.mean(float(value) for value in window)
    return result


def path_excursions(
    bars_by_date: Mapping[dt.date, Bar],
    entry_date: dt.date,
    end_exclusive: dt.date,
    entry_open: float,
) -> tuple[float | None, float | None, dt.date | None]:
    if end_exclusive <= entry_date:
        return 0.0, 0.0, entry_date
    dates = list(date_range(entry_date, end_exclusive - dt.timedelta(days=1)))
    path = [bars_by_date.get(day) for day in dates]
    if not all(bar is not None and bar_is_complete(bar) for bar in path):
        return None, None, None
    complete = [bar for bar in path if bar is not None]
    peak = max(bar.high for bar in complete)
    trough = min(bar.low for bar in complete)
    first_peak = next(bar.date for bar in complete if bar.high == peak)
    return peak / entry_open - 1.0, trough / entry_open - 1.0, first_peak


def _exit_trigger(
    rule: str,
    date: dt.date,
    bars_by_date: Mapping[dt.date, Bar],
    entry_date: dt.date,
    running_max_close: float,
    running_max_high: float,
    chandelier_stop: float | None,
    atr_by_date: Mapping[dt.date, float | None],
    ema_by_date: Mapping[dt.date, float | None],
) -> bool:
    bar = bars_by_date[date]
    if rule == "Trail15":
        return bar.close <= 0.85 * running_max_close
    if rule == "Chandelier3ATR":
        return chandelier_stop is not None and bar.close <= chandelier_stop
    if rule == "EMA10Break":
        previous_date = date - dt.timedelta(days=1)
        if previous_date < entry_date or previous_date not in bars_by_date:
            return False
        ema = ema_by_date.get(date)
        previous_ema = ema_by_date.get(previous_date)
        if ema is None or previous_ema is None:
            return False
        return (
            bars_by_date[previous_date].close < previous_ema and bar.close < ema
        )
    raise ValueError(f"unknown trigger rule: {rule}")


def evaluate_exit(
    rule: str,
    bars: Sequence[Bar],
    signal_date: dt.date,
) -> ExitOutcome:
    """Evaluate one exit rule on the fixed t+2 entry without peak fills.

    The final useful trigger close is e+28: a later close cannot causally precede the
    already scheduled e+30 open. Missing evaluation bars make trigger ordering unknown.
    """
    if rule not in EXIT_RULES:
        raise ValueError(f"unknown exit rule: {rule}")
    bars_by_date = {bar.date: bar for bar in bars}
    entry_date = signal_date + dt.timedelta(days=ENTRY_DELAY_DAYS)
    hard_exit_date = entry_date + dt.timedelta(days=HARD_EXIT_DAYS)
    entry = bars_by_date.get(entry_date)
    if entry is None or not bar_open_is_executable(entry):
        return ExitOutcome(
            rule, "missing_entry", None, hard_exit_date, None, None, None, None,
            None, None, None, None, None, None, None, None, None, None,
        )

    full_mfe, full_mae, full_peak_date = path_excursions(
        bars_by_date, entry_date, hard_exit_date, entry.open
    )
    trigger_date: dt.date | None = None
    scheduled_exit_date = hard_exit_date
    trigger_order_unknown = False

    if rule != "Fixed30":
        atr = atr14_by_date(bars)
        ema = ema10_by_date(bars)
        running_max_close = entry.open
        running_max_high = entry.open
        chandelier_stop: float | None = None
        last_trigger_date = hard_exit_date - dt.timedelta(days=EXIT_DELAY_DAYS)
        for current in date_range(entry_date, last_trigger_date):
            bar = bars_by_date.get(current)
            if bar is None or not bar_is_complete(bar):
                trigger_order_unknown = True
                break
            running_max_close = max(running_max_close, bar.close)
            running_max_high = max(running_max_high, bar.high)
            if rule == "Chandelier3ATR":
                current_atr = atr.get(current)
                if current_atr is None:
                    trigger_order_unknown = True
                    break
                candidate_stop = running_max_high - 3.0 * current_atr
                chandelier_stop = (
                    candidate_stop
                    if chandelier_stop is None
                    else max(chandelier_stop, candidate_stop)
                )
            if _exit_trigger(
                rule,
                current,
                bars_by_date,
                entry_date,
                running_max_close,
                running_max_high,
                chandelier_stop,
                atr,
                ema,
            ):
                trigger_date = current
                scheduled_exit_date = min(
                    current + dt.timedelta(days=EXIT_DELAY_DAYS), hard_exit_date
                )
                break

    if trigger_order_unknown:
        return ExitOutcome(
            rule, "unknown_trigger_order", None, hard_exit_date, None, None, None,
            None, None, None, full_mfe, full_mae, None, None, None, None, None, None,
        )

    exit_bar = bars_by_date.get(scheduled_exit_date)
    if exit_bar is None or not bar_open_is_executable(exit_bar):
        return ExitOutcome(
            rule, "missing_exit", trigger_date, scheduled_exit_date, None, None, None,
            None, None, None, full_mfe, full_mae, None, None, None, None, None, None,
        )

    gross_return = exit_bar.open / entry.open - 1.0
    mfe_before, mae_before, _ = path_excursions(
        bars_by_date, entry_date, scheduled_exit_date, entry.open
    )
    if mfe_before is not None and mae_before is not None:
        # The fill-day high/low occurs after its open and is excluded. Entry and exit
        # opens are included as experienced prices, exactly as the protocol requires.
        mfe_before = max(0.0, gross_return, mfe_before)
        mae_before = min(0.0, gross_return, mae_before)
    profit_given_back = (
        mfe_before - gross_return if mfe_before is not None else None
    )
    total_shortfall = full_mfe - gross_return if full_mfe is not None else None
    peak_capture = (
        gross_return / full_mfe if full_mfe is not None and full_mfe > 0.0 else None
    )
    exit_minus_peak = (
        (scheduled_exit_date - full_peak_date).days
        if full_peak_date is not None
        else None
    )

    early = scheduled_exit_date < hard_exit_date
    premature: bool | None = None
    if early:
        post_exit_dates = list(
            date_range(scheduled_exit_date, hard_exit_date - dt.timedelta(days=1))
        )
        post_exit = [bars_by_date.get(day) for day in post_exit_dates]
        if all(bar is not None and bar_is_complete(bar) for bar in post_exit):
            premature = any(
                bar.high >= 1.10 * exit_bar.open
                for bar in post_exit
                if bar is not None
            )

    return ExitOutcome(
        rule=rule,
        status="known",
        trigger_date=trigger_date,
        scheduled_exit_date=scheduled_exit_date,
        exit_date=scheduled_exit_date,
        exit_open=exit_bar.open,
        gross_return=gross_return,
        holding_days=(scheduled_exit_date - entry_date).days,
        early_exit=early,
        mfe_before_exit=mfe_before,
        mae_before_exit=mae_before,
        full_mfe_30=full_mfe,
        full_mae_30=full_mae,
        profit_given_back=profit_given_back,
        total_opportunity_shortfall=total_shortfall,
        peak_capture_ratio=peak_capture,
        exit_minus_peak_days=exit_minus_peak,
        premature_10pct_status=premature,
    )


def moving_block_ratio_bootstrap(
    sum_count_by_date: Mapping[dt.date, tuple[float, int]],
    block_days: int = BOOTSTRAP_BLOCK_DAYS,
    replicates: int = BOOTSTRAP_REPLICATES,
    seed: int = BOOTSTRAP_SEED,
    calendar_start: dt.date | None = None,
    calendar_end: dt.date | None = None,
) -> dict[str, Any]:
    """Bootstrap a paired sum/count ratio with contiguous calendar-day blocks.

    Calendar days without observations contribute (0, 0), never a numeric zero
    outcome. Each replicate recomputes total sum / total observed count.
    """
    observed = {
        day: (float(total), int(count))
        for day, (total, count) in sum_count_by_date.items()
        if int(count) > 0
    }
    if calendar_start is not None and calendar_end is not None and calendar_start > calendar_end:
        raise ValueError("calendar_start must not follow calendar_end")
    if observed:
        first = calendar_start if calendar_start is not None else min(observed)
        last = calendar_end if calendar_end is not None else max(observed)
        if min(observed) < first or max(observed) > last:
            raise ValueError("calendar bounds must contain every paired observation")
    elif calendar_start is not None and calendar_end is not None:
        first = calendar_start
        last = calendar_end
    else:
        return {"status": "cannot_compute", "reason": "no paired observations"}
    calendar = list(date_range(first, last))
    if not observed:
        return {
            "status": "cannot_compute",
            "reason": "no paired observations",
            "calendar_start": first.isoformat(),
            "calendar_end": last.isoformat(),
            "calendar_days": len(calendar),
            "paired_observed_days": 0,
            "paired_observations": 0,
        }
    if len(calendar) < 2 * block_days:
        return {
            "status": "cannot_compute",
            "reason": f"fewer than {2 * block_days} calendar days",
            "calendar_start": first.isoformat(),
            "calendar_end": last.isoformat(),
            "calendar_days": len(calendar),
            "paired_observed_days": len(observed),
            "paired_observations": sum(count for _, count in observed.values()),
        }
    values = [observed.get(day, (0.0, 0)) for day in calendar]
    starts = list(range(0, len(values) - block_days + 1))
    rng = random.Random(seed)
    estimates: list[float] = []
    empty_replicates = 0
    blocks_per_replicate = math.ceil(len(values) / block_days)
    for _ in range(replicates):
        sample: list[tuple[float, int]] = []
        for _block in range(blocks_per_replicate):
            start = rng.choice(starts)
            sample.extend(values[start : start + block_days])
        sample = sample[: len(values)]
        total = sum(item[0] for item in sample)
        count = sum(item[1] for item in sample)
        if count == 0:
            empty_replicates += 1
        else:
            estimates.append(total / count)
    if not estimates:
        return {
            "status": "cannot_compute",
            "reason": "all bootstrap replicates had zero paired observations",
            "calendar_start": first.isoformat(),
            "calendar_end": last.isoformat(),
            "calendar_days": len(calendar),
            "paired_observed_days": len(observed),
            "empty_replicates": empty_replicates,
        }
    estimates.sort()

    def percentile(probability: float) -> float:
        position = probability * (len(estimates) - 1)
        lower = math.floor(position)
        upper = math.ceil(position)
        if lower == upper:
            return estimates[lower]
        weight = position - lower
        return estimates[lower] * (1.0 - weight) + estimates[upper] * weight

    observed_sum = sum(total for total, _ in observed.values())
    observed_count = sum(count for _, count in observed.values())
    return {
        "status": "ok",
        "estimate": observed_sum / observed_count,
        "ci95": [percentile(0.025), percentile(0.975)],
        "block_days": block_days,
        "requested_replicates": replicates,
        "valid_replicates": len(estimates),
        "empty_replicates": empty_replicates,
        "seed": seed,
        "calendar_start": first.isoformat(),
        "calendar_end": last.isoformat(),
        "calendar_days": len(calendar),
        "paired_observed_days": len(observed),
        "paired_observations": observed_count,
        "available_nonoverlapping_calendar_spans": len(calendar) // block_days,
        "available_moving_block_starts": len(starts),
        "calendar_days_with_no_observation": len(calendar) - len(observed),
    }


def moving_block_bootstrap(
    paired_by_date: Mapping[dt.date, float],
    block_days: int = BOOTSTRAP_BLOCK_DAYS,
    replicates: int = BOOTSTRAP_REPLICATES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Convenience wrapper for one paired observation per observed date."""
    return moving_block_ratio_bootstrap(
        {day: (value, 1) for day, value in paired_by_date.items()},
        block_days,
        replicates,
        seed,
    )


def _bool(value: str, field: str, row_number: int) -> bool:
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes"}:
        return True
    if normalized in {"0", "false", "no"}:
        return False
    raise ProtocolError(f"row {row_number}: {field} must be true/false or 1/0")


def _float(value: str, field: str, row_number: int) -> float:
    try:
        parsed = float(value)
    except ValueError as exc:
        raise ProtocolError(f"row {row_number}: invalid {field}: {value!r}") from exc
    if not math.isfinite(parsed):
        raise ProtocolError(f"row {row_number}: {field} must be finite")
    return parsed


def _float_or_zero(value: str) -> float:
    try:
        parsed = float(value)
    except ValueError:
        return 0.0
    return parsed if math.isfinite(parsed) else 0.0


def _decompress_csv(raw: bytes, compression: str, label: str) -> csv.DictReader:
    if compression == "gzip":
        try:
            raw = gzip.decompress(raw)
        except (OSError, EOFError) as exc:
            raise ProtocolError(f"{label} is not valid gzip") from exc
    elif compression != "none":
        raise ProtocolError(f"unsupported {label} compression: {compression!r}")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ProtocolError(f"{label} CSV must be UTF-8") from exc
    return csv.DictReader(io.StringIO(text, newline=""))


def read_membership_csv(raw: bytes, compression: str = "gzip") -> set[tuple[int, str]]:
    reader = _decompress_csv(raw, compression, "membership")
    required = {
        "cohort_year",
        "reporting_block",
        "symbol",
        "base",
        "formation_month",
        "formation_valid_days",
        "formation_quote_volume",
        "formation_rank",
        "selected",
        "primary_reason",
        "all_reasons",
        "identity_ambiguity",
    }
    if reader.fieldnames is None or set(reader.fieldnames) != required:
        raise ProtocolError(
            f"membership CSV columns must be exactly {sorted(required)}; got {reader.fieldnames}"
        )
    selected: set[tuple[int, str]] = set()
    for row_number, row in enumerate(reader, start=2):
        try:
            cohort_year = int(row["cohort_year"])
        except ValueError as exc:
            raise ProtocolError(f"membership row {row_number}: invalid cohort_year") from exc
        if _bool(row["selected"], "selected", row_number):
            key = (cohort_year, row["symbol"])
            if key in selected:
                raise ProtocolError(f"duplicate selected membership: {key}")
            selected.add(key)
    if not selected:
        raise ProtocolError("membership contains no selected instruments")
    return selected


def read_panel_csv(
    raw: bytes,
    selected_membership: set[tuple[int, str]],
    compression: str = "gzip",
    non_midnight_open_dates: set[tuple[str, dt.date]] | None = None,
) -> dict[str, tuple[Bar, ...]]:
    reader = _decompress_csv(raw, compression, "panel")
    required = {
        "cohort_year",
        "reporting_block",
        "instrument_id",
        "symbol",
        "identity_segment_id",
        "date",
        "open_time_us",
        "close_time_us",
        "open_time_raw",
        "close_time_raw",
        "timestamp_unit",
        "open",
        "high",
        "low",
        "close",
        "base_volume",
        "quote_volume",
        "trade_count",
        "taker_buy_base_volume",
        "taker_buy_quote_volume",
        "source_archive",
        "source_row",
        "bar_status",
    }
    if reader.fieldnames is None or set(reader.fieldnames) != required:
        raise ProtocolError(
            f"panel CSV columns must be exactly {sorted(required)}; got {reader.fieldnames}"
        )
    rows: list[Bar] = []
    non_midnight_flags = {"not_utc_midnight", "non_midnight_first_trade"}
    for row_number, row in enumerate(reader, start=2):
        status_class, status_flags = bar_status_parts(row["bar_status"])
        try:
            cohort_year = int(row["cohort_year"])
        except ValueError as exc:
            raise ProtocolError(
                f"panel row {row_number}: cohort_year must be an integer"
            ) from exc
        try:
            trade_count = int(row["trade_count"])
        except ValueError:
            if status_class == "complete":
                raise ProtocolError(
                    f"panel row {row_number}: complete trade_count must be an integer"
                )
            trade_count = 0
        day = parse_date(row["date"])
        selected = (cohort_year, row["symbol"]) in selected_membership
        strict_numeric = status_class == "complete"

        def number(field: str) -> float:
            return (
                _float(row[field], field, row_number)
                if strict_numeric
                else _float_or_zero(row[field])
            )

        rows.append(
            Bar(
                symbol=row["symbol"],
                date=day,
                open=number("open"),
                high=number("high"),
                low=number("low"),
                close=number("close"),
                base_volume=number("base_volume"),
                quote_volume=number("quote_volume"),
                trade_count=trade_count,
                cohort_member=selected and day.year == cohort_year,
                cohort_year=cohort_year,
                reporting_block=row["reporting_block"],
                instrument_id=row["instrument_id"],
                identity_segment_id=row["identity_segment_id"],
                bar_status=row["bar_status"],
                scheduled_midnight_open=(
                    not bool(status_flags & non_midnight_flags)
                    and (row["symbol"], day)
                    not in (non_midnight_open_dates or set())
                ),
            )
        )
    panel = build_panel(rows)
    return panel


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode(
        "utf-8"
    )


def jsonable(value: Any) -> Any:
    if dataclasses.is_dataclass(value):
        return jsonable(dataclasses.asdict(value))
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    return value


def load_frozen_dataset(
    final_dir: Path,
) -> tuple[dict[str, Any], bytes, bytes, bytes, dict[str, Any]]:
    """Verify the complete frozen hash inventory before exposing panel bytes."""
    final_dir = final_dir.resolve()
    research_root = Path(__file__).resolve().parent
    expected_final_dir = (research_root / "high-flier-data" / "final").resolve()
    if final_dir != expected_final_dir:
        raise ProtocolError(f"data-dir must be {expected_final_dir}")
    hashes_path = final_dir / "file-hashes.json"
    hashes_raw = hashes_path.read_bytes()
    try:
        hash_manifest = json.loads(hashes_raw)
    except json.JSONDecodeError as exc:
        raise ProtocolError("file-hashes.json must be valid JSON") from exc
    if hash_manifest.get("schema_version") != "high-flier-data-hashes-v1":
        raise ProtocolError("unsupported file-hashes.json schema_version")
    if not hash_manifest.get("frozen_at"):
        raise ProtocolError("file-hashes.json frozen_at is required")
    records = hash_manifest.get("artifacts")
    if not isinstance(records, list) or not records:
        raise ProtocolError("file-hashes.json artifacts must be a nonempty list")

    verified: dict[str, dict[str, Any]] = {}
    for record in records:
        if not isinstance(record, dict):
            raise ProtocolError("file hash record must be an object")
        relative = record.get("path")
        expected_hash = record.get("sha256")
        expected_bytes = record.get("bytes")
        if not isinstance(relative, str) or not relative:
            raise ProtocolError("file hash path is required")
        if relative in verified:
            raise ProtocolError(f"duplicate file hash path: {relative}")
        if not isinstance(expected_hash, str) or len(expected_hash) != 64:
            raise ProtocolError(f"invalid SHA-256 for {relative}")
        if not isinstance(expected_bytes, int) or expected_bytes < 0:
            raise ProtocolError(f"invalid byte length for {relative}")
        path = (research_root / relative).resolve()
        if path != research_root and research_root not in path.parents:
            raise ProtocolError(f"hashed path escapes research directory: {relative}")
        if path.stat().st_size != expected_bytes:
            raise ProtocolError(f"byte length mismatch for {relative}")
        actual_hash = sha256_file(path)
        if actual_hash != expected_hash.lower():
            raise ProtocolError(
                f"hash mismatch for {relative}: expected {expected_hash.lower()}, got {actual_hash}"
            )
        verified[relative] = record

    required_relative = {
        "high-flier-data-protocol.md",
        "high-flier-protocol.md",
        "high-flier-identity-events.json",
        "high-flier-data-acquire.py",
        "high-flier-data/final/cohort-manifest.json",
        "high-flier-data/final/cohort-membership.csv.gz",
        "high-flier-data/final/daily-panel.csv.gz",
        "high-flier-data/final/data-quality.json",
    }
    missing_hashes = required_relative - set(verified)
    if missing_hashes:
        raise ProtocolError(f"frozen hash inventory misses {sorted(missing_hashes)}")

    manifest_path = final_dir / "cohort-manifest.json"
    manifest_raw = manifest_path.read_bytes()
    try:
        manifest = json.loads(manifest_raw)
    except json.JSONDecodeError as exc:
        raise ProtocolError("cohort-manifest.json must be valid JSON") from exc
    if manifest.get("schema_version") != SCHEMA_VERSION:
        raise ProtocolError(f"cohort manifest schema_version must be {SCHEMA_VERSION!r}")
    if manifest.get("protocol_frozen") is not True:
        raise ProtocolError("cohort manifest protocol_frozen must be true")
    if manifest.get("frozen_at") != hash_manifest.get("frozen_at"):
        raise ProtocolError("cohort and hash manifests disagree on frozen_at")

    frozen_metadata = hash_manifest.get("frozen_metadata")
    if not isinstance(frozen_metadata, dict):
        raise ProtocolError("file-hashes.json frozen_metadata is required")
    metadata_roles = {
        "data_protocol": "data_protocol",
        "signal_protocol": "signal_protocol",
        "identity_event_audit": "identity_event_audit",
        "acquisition_program": "acquisition_program",
    }
    for hash_role, manifest_role in metadata_roles.items():
        hash_spec = frozen_metadata.get(hash_role)
        manifest_spec = manifest.get(manifest_role)
        if not isinstance(hash_spec, dict) or not isinstance(manifest_spec, dict):
            raise ProtocolError(f"frozen metadata {hash_role} is required")
        if (
            hash_spec.get("path") != manifest_spec.get("path")
            or hash_spec.get("sha256") != manifest_spec.get("sha256")
        ):
            raise ProtocolError(f"frozen metadata mismatch for {hash_role}")
        relative = str(hash_spec["path"])
        record = verified.get(relative)
        if record is None or record["sha256"] != hash_spec["sha256"]:
            raise ProtocolError(f"hash inventory mismatch for {hash_role}")

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict):
        raise ProtocolError("cohort manifest artifacts object is required")
    expected_artifact_names = {
        "cohort_membership": "cohort-membership.csv.gz",
        "daily_panel": "daily-panel.csv.gz",
        "data_quality": "data-quality.json",
    }
    for role, expected_name in expected_artifact_names.items():
        spec = artifacts.get(role)
        if not isinstance(spec, dict):
            raise ProtocolError(f"cohort manifest artifact {role} is required")
        if spec.get("path") != expected_name:
            raise ProtocolError(f"unexpected artifact path for {role}")
        relative = f"high-flier-data/final/{expected_name}"
        record = verified.get(relative)
        if (
            record is None
            or record.get("sha256") != spec.get("sha256")
            or record.get("bytes") != spec.get("bytes")
        ):
            raise ProtocolError(f"artifact manifest/hash mismatch for {role}")

    blocks = manifest.get("blocks")
    if not isinstance(blocks, list) or not blocks:
        raise ProtocolError("cohort manifest blocks must be a nonempty list")
    names: set[str] = set()
    for block in blocks:
        if not isinstance(block, dict):
            raise ProtocolError("each block must be an object")
        name = block.get("name")
        if not isinstance(name, str) or not name or name in names:
            raise ProtocolError("block names must be nonempty and unique")
        names.add(name)
        if parse_date(block.get("start", "")) > parse_date(block.get("end", "")):
            raise ProtocolError(f"block {name!r} start is after end")
    study = manifest.get("study")
    if not isinstance(study, dict):
        raise ProtocolError("cohort manifest study object is required")
    signal_start = parse_date(study.get("signal_start", ""))
    signal_end = parse_date(study.get("signal_end", ""))
    if signal_start > signal_end:
        raise ProtocolError("study signal_start is after signal_end")

    membership_raw = (final_dir / artifacts["cohort_membership"]["path"]).read_bytes()
    panel_raw = (final_dir / artifacts["daily_panel"]["path"]).read_bytes()
    quality_raw = (final_dir / artifacts["data_quality"]["path"]).read_bytes()
    input_provenance = {
        "file_hashes_sha256": sha256_bytes(hashes_raw),
        "verified_file_count": len(verified),
        "verified_file_bytes": sum(int(record["bytes"]) for record in verified.values()),
        "frozen_at": manifest["frozen_at"],
        "frozen_metadata": frozen_metadata,
    }
    return manifest, manifest_raw, membership_raw, panel_raw, {
        **input_provenance,
        "data_quality_sha256": sha256_bytes(quality_raw),
    }


def _distribution(values: Iterable[float | None]) -> dict[str, Any]:
    known = sorted(float(value) for value in values if value is not None)
    if not known:
        return {"count": 0}

    def quantile(probability: float) -> float:
        position = probability * (len(known) - 1)
        lower = math.floor(position)
        upper = math.ceil(position)
        if lower == upper:
            return known[lower]
        weight = position - lower
        return known[lower] * (1.0 - weight) + known[upper] * weight

    return {
        "count": len(known),
        "mean": statistics.mean(known),
        "median": statistics.median(known),
        "p10": quantile(0.10),
        "p25": quantile(0.25),
        "p75": quantile(0.75),
        "p90": quantile(0.90),
        "min": known[0],
        "max": known[-1],
    }


def _rate(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def _grade_to_dict(grade: Grade) -> dict[str, Any]:
    return jsonable(grade)


def build_daily_ledgers(
    panel: Mapping[str, Sequence[Bar]], signal_start: dt.date, signal_end: dt.date
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    positions, bars_by_symbol_date = panel_indexes(panel)
    daily_alerts: list[dict[str, Any]] = []
    universe_daily: list[dict[str, Any]] = []
    daily_method_rows: dict[str, list[dict[str, Any]]] = {method: [] for method in METHODS}

    stable_symbols = {key: bars[0].symbol for key, bars in panel.items()}
    for signal_date in date_range(signal_start, signal_end):
        eligible: list[str] = []
        method_scores: dict[str, dict[str, float | None]] = {
            method: {} for method in METHODS
        }
        for key, bars in panel.items():
            index = positions[key].get(signal_date)
            if index is None or not is_eligible(bars, index):
                continue
            eligible.append(key)
            scores = score_methods(bars, index)
            for method in METHODS:
                method_scores[method][key] = scores[method]
        if not eligible:
            continue

        universe_grades: dict[int, dict[str, Grade]] = {}
        relative_sets: dict[int, set[str]] = {}
        universe_row: dict[str, Any] = {
            "signal_date": signal_date.isoformat(),
            "eligible_count": len(eligible),
            "horizons": {},
        }
        for horizon in HORIZONS:
            grades = {
                key: grade_forward(bars_by_symbol_date[key], signal_date, horizon)
                for key in eligible
            }
            universe_grades[horizon] = grades
            relative, known, unknown, conditional = relative_top_decile(
                grades, stable_symbols
            )
            relative_sets[horizon] = relative
            hits = sum(grade.absolute_hit is True for grade in grades.values())
            universe_row["horizons"][str(horizon)] = {
                "known_paths": known,
                "unknown_paths": unknown,
                "unknown_fraction": _rate(unknown, len(eligible)),
                "known_absolute_hits": hits,
                "absolute_hit_lower_bound": _rate(hits, len(eligible)),
                "absolute_hit_upper_bound": _rate(hits + unknown, len(eligible)),
                "known_path_conditional_base_rate": _rate(hits, known),
                "relative_top_decile_count": len(relative),
                "relative_ranking_conditional": conditional,
            }
        universe_daily.append(universe_row)

        for method in METHODS:
            ranked = rank_scores(method_scores[method], stable_symbols=stable_symbols)
            method_day = {
                "method": method,
                "signal_date": signal_date.isoformat(),
                "eligible_count": len(eligible),
                "slots": MAX_ALERTS,
                "issued": len(ranked),
                "unused_slots": MAX_ALERTS - len(ranked),
            }
            daily_method_rows[method].append(method_day)
            for rank, (key, score) in enumerate(ranked, start=1):
                source_bar = panel[key][positions[key][signal_date]]
                grades = {
                    str(horizon): {
                        **_grade_to_dict(universe_grades[horizon][key]),
                        "relative_top_decile": (
                            key in relative_sets[horizon]
                            if universe_grades[horizon][key].mfe is not None
                            else None
                        ),
                        "relative_ranking_conditional": universe_row["horizons"][
                            str(horizon)
                        ]["relative_ranking_conditional"],
                    }
                    for horizon in HORIZONS
                }
                daily_alerts.append(
                    {
                        "method": method,
                        "signal_date": signal_date.isoformat(),
                        "symbol": source_bar.symbol,
                        "instrument_key": key,
                        "instrument_id": source_bar.instrument_id,
                        "identity_segment_id": source_bar.identity_segment_id,
                        "cohort_year": source_bar.cohort_year,
                        "reporting_block": source_bar.reporting_block,
                        "rank": rank,
                        "score": score,
                        "eligible_count": len(eligible),
                        "entry_date": (
                            signal_date + dt.timedelta(days=ENTRY_DELAY_DAYS)
                        ).isoformat(),
                        "entry_status": grades["7"]["entry_status"],
                        "grades": grades,
                        "episode_status": None,
                    }
                )
    return daily_alerts, universe_daily, daily_method_rows


def assign_episodes(daily_alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    episodes: list[dict[str, Any]] = []
    last_entry: dict[tuple[str, str], dt.date] = {}
    ordered = sorted(
        daily_alerts,
        key=lambda row: (row["signal_date"], row["method"], row["rank"], row["symbol"]),
    )
    for row in ordered:
        if row["entry_status"] != "known":
            row["episode_status"] = "unexecuted_missing_entry"
            continue
        entry_date = parse_date(row["entry_date"])
        key = (row["method"], row["symbol"])
        prior = last_entry.get(key)
        if prior is not None and entry_date < prior + dt.timedelta(days=EPISODE_COOLDOWN_DAYS):
            row["episode_status"] = "suppressed_cooldown"
            continue
        row["episode_status"] = "issued_episode"
        last_entry[key] = entry_date
        episodes.append(
            {
                "method": row["method"],
                "signal_date": row["signal_date"],
                "entry_date": row["entry_date"],
                "symbol": row["symbol"],
                "instrument_key": row["instrument_key"],
                "instrument_id": row["instrument_id"],
                "identity_segment_id": row["identity_segment_id"],
                "cohort_year": row["cohort_year"],
                "reporting_block": row["reporting_block"],
                "daily_rank": row["rank"],
                "score": row["score"],
                "grades": row["grades"],
            }
        )
    return episodes


def build_exit_ledger(
    panel: Mapping[str, Sequence[Bar]], episodes: Sequence[Mapping[str, Any]]
) -> list[dict[str, Any]]:
    exit_rows: list[dict[str, Any]] = []
    primary = [episode for episode in episodes if episode["method"] == "Return7"]
    for episode_index, episode in enumerate(primary, start=1):
        symbol = str(episode["symbol"])
        instrument_key = str(episode["instrument_key"])
        signal_date = parse_date(str(episode["signal_date"]))
        entry_date = parse_date(str(episode["entry_date"]))
        entry_bar = next(
            (bar for bar in panel[instrument_key] if bar.date == entry_date), None
        )
        if entry_bar is None:
            raise ProtocolError("episode ledger contains a non-executable entry")
        for rule in EXIT_RULES:
            outcome = evaluate_exit(rule, panel[instrument_key], signal_date)
            row = {
                "episode_id": episode_index,
                "symbol": symbol,
                "instrument_key": instrument_key,
                "instrument_id": episode["instrument_id"],
                "identity_segment_id": episode["identity_segment_id"],
                "cohort_year": episode["cohort_year"],
                "reporting_block": episode["reporting_block"],
                "signal_date": signal_date.isoformat(),
                "entry_date": entry_date.isoformat(),
                "entry_open": entry_bar.open,
                **jsonable(outcome),
                "net_returns": {
                    str(bps): (
                        exact_unit_return(entry_bar.open, outcome.exit_open, bps)
                        if outcome.exit_open is not None
                        else None
                    )
                    for bps in FEE_BPS
                },
                "missing_return_scenarios": (
                    None
                    if outcome.gross_return is not None
                    else {"zero_return": 0.0, "total_loss": -1.0}
                ),
            }
            exit_rows.append(row)
    return exit_rows


def _filter_rows(
    rows: Sequence[Mapping[str, Any]], date_field: str, start: dt.date, end: dt.date
) -> list[Mapping[str, Any]]:
    return [
        row
        for row in rows
        if start <= parse_date(str(row[date_field])) <= end
    ]


def discovery_metrics(
    alerts: Sequence[Mapping[str, Any]],
    universe_daily: Sequence[Mapping[str, Any]],
    method_days: Sequence[Mapping[str, Any]],
    method: str,
    horizon: int,
) -> dict[str, Any]:
    selected = [row for row in alerts if row["method"] == method]
    grades = [row["grades"][str(horizon)] for row in selected]
    slots = sum(int(row["slots"]) for row in method_days if row["method"] == method)
    issued = len(selected)
    unknown = sum(grade["path_status"] != "known" for grade in grades)
    hits = sum(grade["absolute_hit"] is True for grade in grades)
    known_count = issued - unknown
    universe_horizons = [row["horizons"][str(horizon)] for row in universe_daily]
    universe_total = sum(int(row["eligible_count"]) for row in universe_daily)
    universe_known = sum(int(item["known_paths"]) for item in universe_horizons)
    universe_unknown = sum(int(item["unknown_paths"]) for item in universe_horizons)
    universe_hits = sum(int(item["known_absolute_hits"]) for item in universe_horizons)
    selected_conditional_precision = _rate(hits, known_count)
    base_conditional = _rate(universe_hits, universe_known)
    crossings = []
    peaks = []
    for grade in grades:
        if grade["first_threshold_date"] is not None:
            crossings.append(
                (
                    parse_date(grade["first_threshold_date"])
                    - parse_date(grade["entry_date"])
                ).days
            )
        if grade["first_peak_date"] is not None:
            peaks.append(
                (
                    parse_date(grade["first_peak_date"])
                    - parse_date(grade["entry_date"])
                ).days
            )
    return {
        "method": method,
        "horizon_days": horizon,
        "selection_days": len(method_days),
        "available_slots": slots,
        "issued_alerts": issued,
        "unused_slots": slots - issued,
        "known_paths": known_count,
        "unknown_paths": unknown,
        "unknown_outcome_fraction": _rate(unknown, issued),
        "known_hits": hits,
        "known_hits_per_ten_available_slots": (
            10.0 * hits / slots if slots else None
        ),
        "precision_per_issued_alert_lower_bound": _rate(hits, issued),
        "precision_per_issued_alert_upper_bound": _rate(hits + unknown, issued),
        "precision_per_known_path_conditional": selected_conditional_precision,
        "hit_rate_slot_lower_bound": _rate(hits, slots),
        "hit_rate_slot_upper_bound": _rate(hits + unknown, slots),
        "universe_total_coin_dates": universe_total,
        "universe_known_paths": universe_known,
        "universe_unknown_paths": universe_unknown,
        "universe_unknown_fraction": _rate(universe_unknown, universe_total),
        "universe_known_hits": universe_hits,
        "universe_base_rate_lower_bound": _rate(universe_hits, universe_total),
        "universe_base_rate_upper_bound": _rate(
            universe_hits + universe_unknown, universe_total
        ),
        "universe_known_path_conditional_base_rate": base_conditional,
        "conditional_lift": (
            selected_conditional_precision / base_conditional
            if selected_conditional_precision is not None
            and base_conditional not in (None, 0.0)
            else None
        ),
        "mfe": _distribution(grade["mfe"] for grade in grades),
        "mae": _distribution(grade["mae"] for grade in grades),
        "endpoint_return": _distribution(
            grade["endpoint_return"] for grade in grades
        ),
        "endpoint_fee_sensitivity_known": {
            str(bps): _distribution(
                net_return_from_gross(float(grade["endpoint_return"]), bps)
                if grade["endpoint_return"] is not None
                else None
                for grade in grades
            )
            for bps in FEE_BPS
        },
        "missing_endpoint_scenarios_for_executed_entries": {
            "count": sum(
                grade["entry_status"] == "known"
                and grade["endpoint_status"] != "known"
                for grade in grades
            ),
            "zero_return": 0.0,
            "total_loss": -1.0,
        },
        "days_to_first_threshold_crossing": _distribution(crossings),
        "days_to_first_peak": _distribution(peaks),
        "relative_top_decile_known_hits": sum(
            grade["relative_top_decile"] is True for grade in grades
        ),
        "relative_diagnostic_is_conditional_on_dates_with_missing_paths": any(
            grade["relative_ranking_conditional"] for grade in grades
        ),
    }


def episode_metrics(
    episodes: Sequence[Mapping[str, Any]], method: str, horizon: int
) -> dict[str, Any]:
    rows = [row for row in episodes if row["method"] == method]
    grades = [row["grades"][str(horizon)] for row in rows]
    unknown = sum(grade["path_status"] != "known" for grade in grades)
    hits = sum(grade["absolute_hit"] is True for grade in grades)
    return {
        "method": method,
        "horizon_days": horizon,
        "episodes": len(rows),
        "known_paths": len(rows) - unknown,
        "unknown_paths": unknown,
        "known_hits": hits,
        "hit_rate_lower_bound": _rate(hits, len(rows)),
        "hit_rate_upper_bound": _rate(hits + unknown, len(rows)),
        "known_path_conditional_precision": _rate(hits, len(rows) - unknown),
        "mfe": _distribution(grade["mfe"] for grade in grades),
        "mae": _distribution(grade["mae"] for grade in grades),
        "endpoint_return": _distribution(
            grade["endpoint_return"] for grade in grades
        ),
        "endpoint_fee_sensitivity_known": {
            str(bps): _distribution(
                net_return_from_gross(float(grade["endpoint_return"]), bps)
                if grade["endpoint_return"] is not None
                else None
                for grade in grades
            )
            for bps in FEE_BPS
        },
        "missing_endpoint_scenarios": {
            "count": sum(grade["endpoint_status"] != "known" for grade in grades),
            "zero_return": 0.0,
            "total_loss": -1.0,
        },
    }


def exit_metrics(exit_rows: Sequence[Mapping[str, Any]], rule: str) -> dict[str, Any]:
    rows = [row for row in exit_rows if row["rule"] == rule]
    known = [row for row in rows if row["gross_return"] is not None]
    unknown = len(rows) - len(known)
    gross = [float(row["gross_return"]) for row in known]
    net50 = [float(row["net_returns"]["50"]) for row in known]
    early_known_exits = [row for row in known if row["early_exit"] is True]
    premature_true = sum(
        row["premature_10pct_status"] is True for row in early_known_exits
    )
    premature_false = sum(
        row["premature_10pct_status"] is False for row in early_known_exits
    )
    premature_unknown = sum(
        row["premature_10pct_status"] is None for row in early_known_exits
    )
    premature_known = premature_true + premature_false
    scenario_zero = [
        float(row["gross_return"]) if row["gross_return"] is not None else 0.0
        for row in rows
    ]
    scenario_loss = [
        float(row["gross_return"]) if row["gross_return"] is not None else -1.0
        for row in rows
    ]
    scenario_zero_net50 = [
        float(row["net_returns"]["50"])
        if row["net_returns"]["50"] is not None
        else net_return_from_gross(0.0, 50)
        for row in rows
    ]
    scenario_loss_net50 = [
        float(row["net_returns"]["50"])
        if row["net_returns"]["50"] is not None
        else net_return_from_gross(-1.0, 50)
        for row in rows
    ]
    return {
        "rule": rule,
        "entries": len(rows),
        "known_exits": len(known),
        "unknown_exits": unknown,
        "unknown_exit_fraction": _rate(unknown, len(rows)),
        "gross_return_known_conditional": _distribution(gross),
        "net_return_50bps_each_side_known_conditional": _distribution(net50),
        "gross_return_zero_missing_scenario": _distribution(scenario_zero),
        "gross_return_total_loss_missing_scenario": _distribution(scenario_loss),
        "net_return_50bps_zero_missing_scenario": _distribution(
            scenario_zero_net50
        ),
        "net_return_50bps_total_loss_missing_scenario": _distribution(
            scenario_loss_net50
        ),
        "loss_frequency_known_conditional": _rate(
            sum(value < 0.0 for value in gross), len(gross)
        ),
        "holding_days_known_conditional": _distribution(
            row["holding_days"] for row in known
        ),
        "early_exit_frequency_known_conditional": _rate(
            sum(row["early_exit"] is True for row in known), len(known)
        ),
        "mfe_before_exit": _distribution(row["mfe_before_exit"] for row in known),
        "mae_before_exit": _distribution(row["mae_before_exit"] for row in known),
        "full_window_mfe_30": _distribution(row["full_mfe_30"] for row in rows),
        "full_window_mae_30": _distribution(row["full_mae_30"] for row in rows),
        "profit_given_back_before_actual_exit": _distribution(
            row["profit_given_back"] for row in known
        ),
        "total_opportunity_shortfall": _distribution(
            row["total_opportunity_shortfall"] for row in known
        ),
        "peak_capture_ratio_positive_full_mfe_unclipped": _distribution(
            row["peak_capture_ratio"] for row in known
        ),
        "exit_fill_minus_first_full_window_peak_days": _distribution(
            row["exit_minus_peak_days"] for row in known
        ),
        "premature_exit_10pct": {
            "early_exits": len(early_known_exits),
            "known_follow_path": premature_known,
            "true": premature_true,
            "false": premature_false,
            "rate_among_early_exits_with_known_follow_path": _rate(
                premature_true, premature_known
            ),
            "unknown_follow_path": premature_unknown,
            "hard_exit_not_applicable": sum(
                row["early_exit"] is False for row in known
            ),
        },
        "fee_sensitivity": {
            str(bps): _distribution(row["net_returns"][str(bps)] for row in known)
            for bps in FEE_BPS
        },
    }


def _paired_discovery_bootstrap(
    alerts: Sequence[Mapping[str, Any]],
    eligible_decision_dates: Iterable[dt.date],
) -> dict[str, Any]:
    hits: dict[tuple[str, dt.date], int] = defaultdict(int)
    for row in alerts:
        if row["method"] not in {"Breakout20", "Return7"}:
            continue
        if row["grades"]["7"]["absolute_hit"] is True:
            hits[(str(row["method"]), parse_date(str(row["signal_date"])))] += 1
    paired = {
        day: (
            float(hits[("Breakout20", day)] - hits[("Return7", day)]),
            MAX_ALERTS,
        )
        for day in eligible_decision_dates
    }
    result = moving_block_ratio_bootstrap(paired)
    result["contrast"] = "Breakout20 minus Return7 known MFE7>=20% hit rate"
    result["native_units"] = "fraction of ten available slots per eligible decision date"
    if result.get("status") == "ok":
        estimate_fraction = float(result["estimate"])
        ci_fraction = [float(value) for value in result["ci95"]]
        result["estimate_fraction"] = estimate_fraction
        result["ci95_fraction"] = ci_fraction
        result["estimate_hits_per_ten_slots"] = 10.0 * estimate_fraction
        result["ci95_hits_per_ten_slots"] = [10.0 * value for value in ci_fraction]
    result["unknown_paths_counted_as_nonhits"] = True
    return result


def paired_exit_metrics(exit_rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    by_key: dict[tuple[int, str], Mapping[str, Any]] = {
        (int(row["episode_id"]), str(row["rule"])): row for row in exit_rows
    }
    episode_ids = sorted({int(row["episode_id"]) for row in exit_rows})
    gross_complete: list[float] = []
    net50_complete: list[float] = []
    scenario_differences: dict[str, list[float]] = {
        "zero_return": [],
        "total_loss": [],
    }
    for episode_id in episode_ids:
        trail = by_key[(episode_id, "Trail15")]
        fixed = by_key[(episode_id, "Fixed30")]
        trail_gross = trail["gross_return"]
        fixed_gross = fixed["gross_return"]
        trail_net = trail["net_returns"]["50"]
        fixed_net = fixed["net_returns"]["50"]
        if trail_gross is not None and fixed_gross is not None:
            gross_complete.append(float(trail_gross) - float(fixed_gross))
        if trail_net is not None and fixed_net is not None:
            net50_complete.append(float(trail_net) - float(fixed_net))
        for scenario, missing_gross in (("zero_return", 0.0), ("total_loss", -1.0)):
            missing_net = net_return_from_gross(missing_gross, 50)
            scenario_differences[scenario].append(
                (float(trail_net) if trail_net is not None else missing_net)
                - (float(fixed_net) if fixed_net is not None else missing_net)
            )
    return {
        "contrast": "Trail15 minus Fixed30 on identical Return7 episode entries",
        "missing_scenario_net_convention": "convert 0%/-100% gross through exact 50bps-per-side unit-return formula before pairing",
        "entries": len(episode_ids),
        "complete_gross_pairs": len(gross_complete),
        "gross_return_difference_complete_pairs": _distribution(gross_complete),
        "net_50bps_difference_complete_pairs": _distribution(net50_complete),
        "net_50bps_difference_zero_missing_scenario": _distribution(
            scenario_differences["zero_return"]
        ),
        "net_50bps_difference_total_loss_missing_scenario": _distribution(
            scenario_differences["total_loss"]
        ),
    }


def _paired_exit_bootstraps(exit_rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    by_key: dict[tuple[int, str], Mapping[str, Any]] = {
        (int(row["episode_id"]), str(row["rule"])): row for row in exit_rows
    }
    episode_ids = sorted({int(row["episode_id"]) for row in exit_rows})
    included_entry_dates = [
        parse_date(str(by_key[(episode_id, "Trail15")]["entry_date"]))
        for episode_id in episode_ids
    ]
    calendar_start = min(included_entry_dates) if included_entry_dates else None
    calendar_end = max(included_entry_dates) if included_entry_dates else None
    scenarios: dict[str, dict[dt.date, list[float]]] = {
        "zero_return": defaultdict(list),
        "total_loss": defaultdict(list),
    }
    complete: dict[dt.date, list[float]] = defaultdict(list)
    for episode_id in episode_ids:
        trail = by_key[(episode_id, "Trail15")]
        fixed = by_key[(episode_id, "Fixed30")]
        entry_date = parse_date(str(trail["entry_date"]))
        trail_value = trail["net_returns"]["50"]
        fixed_value = fixed["net_returns"]["50"]
        if trail_value is not None and fixed_value is not None:
            complete[entry_date].append(float(trail_value) - float(fixed_value))
        for scenario, missing_gross in (("zero_return", 0.0), ("total_loss", -1.0)):
            missing_net = net_return_from_gross(missing_gross, 50)
            scenarios[scenario][entry_date].append(
                (float(trail_value) if trail_value is not None else missing_net)
                - (float(fixed_value) if fixed_value is not None else missing_net)
            )

    def daily_sum_count(
        values: Mapping[dt.date, Sequence[float]],
    ) -> dict[dt.date, tuple[float, int]]:
        return {day: (sum(items), len(items)) for day, items in values.items()}

    return {
        "contrast": "Trail15 minus Fixed30 net return at 50 bps per side",
        "weighting": "paired position mean; dates carry their paired-position counts",
        "missing_scenario_net_convention": "convert 0%/-100% gross through exact 50bps-per-side unit-return formula before pairing",
        "complete_pairs_conditional": moving_block_ratio_bootstrap(
            daily_sum_count(complete),
            calendar_start=calendar_start,
            calendar_end=calendar_end,
        ),
        "zero_return_missing_scenario": moving_block_ratio_bootstrap(
            daily_sum_count(scenarios["zero_return"]),
            calendar_start=calendar_start,
            calendar_end=calendar_end,
        ),
        "total_loss_missing_scenario": moving_block_ratio_bootstrap(
            daily_sum_count(scenarios["total_loss"]),
            calendar_start=calendar_start,
            calendar_end=calendar_end,
        ),
    }


def build_summary(
    manifest: Mapping[str, Any],
    daily_alerts: Sequence[Mapping[str, Any]],
    universe_daily: Sequence[Mapping[str, Any]],
    method_days: Mapping[str, Sequence[Mapping[str, Any]]],
    episodes: Sequence[Mapping[str, Any]],
    exit_rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    overall_discovery = {
        method: {
            str(horizon): discovery_metrics(
                daily_alerts,
                universe_daily,
                method_days[method],
                method,
                horizon,
            )
            for horizon in HORIZONS
        }
        for method in METHODS
    }
    overall_episodes = {
        method: {
            str(horizon): episode_metrics(episodes, method, horizon)
            for horizon in HORIZONS
        }
        for method in METHODS
    }
    overall_exits = {rule: exit_metrics(exit_rows, rule) for rule in EXIT_RULES}

    blocks: dict[str, Any] = {}
    requested_blocks = list(manifest["blocks"])
    study_start = parse_date(str(manifest["study"]["signal_start"]))
    study_end = parse_date(str(manifest["study"]["signal_end"]))
    years = list(range(study_start.year, study_end.year + 1))
    partitions = requested_blocks + [
        {"name": f"calendar-{year}", "start": f"{year}-01-01", "end": f"{year}-12-31"}
        for year in years
    ]
    for block in partitions:
        name = str(block["name"])
        start = parse_date(str(block["start"]))
        end = parse_date(str(block["end"]))
        block_alerts = _filter_rows(daily_alerts, "signal_date", start, end)
        block_universe = _filter_rows(universe_daily, "signal_date", start, end)
        block_days = {
            method: _filter_rows(method_days[method], "signal_date", start, end)
            for method in METHODS
        }
        block_episodes = _filter_rows(episodes, "signal_date", start, end)
        block_exits = _filter_rows(exit_rows, "signal_date", start, end)
        blocks[name] = {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "exploratory": bool(block.get("exploratory", False))
            or start.year == 2026
            or end.year == 2026,
            "discovery": {
                method: {
                    str(horizon): discovery_metrics(
                        block_alerts,
                        block_universe,
                        block_days[method],
                        method,
                        horizon,
                    )
                    for horizon in HORIZONS
                }
                for method in METHODS
            },
            "episodes": {
                method: {
                    str(horizon): episode_metrics(block_episodes, method, horizon)
                    for horizon in HORIZONS
                }
                for method in METHODS
            },
            "exits": {rule: exit_metrics(block_exits, rule) for rule in EXIT_RULES},
            "paired_primary_exit": paired_exit_metrics(block_exits),
        }

    return {
        "schema_version": SUMMARY_SCHEMA_VERSION,
        "runner_version": RUNNER_VERSION,
        "study_description": "predeclared retrospective venue-cohort research",
        "follow_data_2026_is_exploratory": True,
        "scope_limitations": [
            "Historically selected venue cohort only; not every coin and not global top 500.",
            "Venue OHLCV has no historical market-cap rank; this is not an exact Classic backtest.",
            "Quote-volume eligibility is a lagged turnover screen, not depth or capacity proof.",
            "Daily highs grade peaks; every executable entry and exit fill uses a scheduled open.",
            "A positive-activity partial terminal bar may proxy its midnight open, but this is not guaranteed fillability; non-midnight listing/reopening buckets are unexecutable.",
            "Known-path-only relative top-decile labels are conditional whenever paths are missing.",
            "2026 results are exploratory because they overlap earlier local research.",
            "Overlapping unit-capital trades are independent comparisons, not a sequential portfolio or wealth path.",
        ],
        "primary_discovery": overall_discovery["Breakout20"]["7"],
        "primary_discovery_comparator": overall_discovery["Return7"]["7"],
        "discovery": overall_discovery,
        "episodes": overall_episodes,
        "primary_exit": overall_exits["Trail15"],
        "primary_exit_comparator": overall_exits["Fixed30"],
        "paired_primary_exit": paired_exit_metrics(exit_rows),
        "exits": overall_exits,
        "paired_date_bootstrap": {
            "discovery": _paired_discovery_bootstrap(
                daily_alerts,
                (parse_date(str(row["signal_date"])) for row in universe_daily),
            ),
            "exit": _paired_exit_bootstraps(exit_rows),
            "limitations": (
                "30-calendar-day moving blocks preserve local dependence but do not remove "
                "annual/cohort dependence; coin trades are not treated as IID."
            ),
        },
        "blocks": blocks,
    }


def run_study(data_dir: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    # Freeze executable code hashes before the loader exposes any panel bytes.
    script_path = Path(__file__).resolve()
    selftest_path = script_path.with_name("high-flier-selftest.py")
    code_hashes = {
        "runner_sha256": sha256_file(script_path),
        "selftest_sha256": sha256_file(selftest_path) if selftest_path.exists() else None,
    }
    manifest, manifest_raw, membership_raw, panel_raw, input_provenance = (
        load_frozen_dataset(data_dir)
    )
    membership_spec = manifest["artifacts"]["cohort_membership"]
    panel_spec = manifest["artifacts"]["daily_panel"]
    selected_membership = read_membership_csv(
        membership_raw, str(membership_spec.get("compression", "gzip"))
    )
    panel = read_panel_csv(
        panel_raw,
        selected_membership,
        str(panel_spec.get("compression", "gzip")),
    )
    signal_start = parse_date(str(manifest["study"]["signal_start"]))
    signal_end = parse_date(str(manifest["study"]["signal_end"]))
    panel_membership = {
        (bars[0].cohort_year, bars[0].symbol) for bars in panel.values()
    }
    cohort_availability = {
        "selected_memberships": len(selected_membership),
        "selected_memberships_with_panel_rows": len(
            selected_membership & panel_membership
        ),
        "selected_memberships_without_panel_rows": [
            {"cohort_year": year, "symbol": symbol}
            for year, symbol in sorted(selected_membership - panel_membership)
        ],
    }
    daily_alerts, universe_daily, method_days = build_daily_ledgers(
        panel, signal_start, signal_end
    )
    episodes = assign_episodes(daily_alerts)
    exit_rows = build_exit_ledger(panel, episodes)

    provenance = {
        "runner_version": RUNNER_VERSION,
        **code_hashes,
        "cohort_manifest_path": "high-flier-data/final/cohort-manifest.json",
        "cohort_manifest_sha256": sha256_bytes(manifest_raw),
        "input_freeze": input_provenance,
        "data_protocol": manifest["data_protocol"],
        "signal_protocol": manifest["signal_protocol"],
        "identity_event_audit": manifest["identity_event_audit"],
        "panel": manifest["artifacts"]["daily_panel"],
        "membership": manifest["artifacts"]["cohort_membership"],
        "protocol_frozen": True,
        "frozen_at": manifest["frozen_at"],
        "parameters": {
            "entry_delay_days": ENTRY_DELAY_DAYS,
            "horizons": list(HORIZONS),
            "hard_exit_days": HARD_EXIT_DAYS,
            "exit_delay_days": EXIT_DELAY_DAYS,
            "eligibility_history_days": MIN_HISTORY,
            "lagged_volume_days": VOLUME_LOOKBACK,
            "minimum_median_quote_volume": MIN_MEDIAN_QUOTE_VOLUME,
            "maximum_alerts": MAX_ALERTS,
            "episode_cooldown_calendar_days": EPISODE_COOLDOWN_DAYS,
            "fee_bps_each_side": list(FEE_BPS),
            "bootstrap_block_days": BOOTSTRAP_BLOCK_DAYS,
            "bootstrap_replicates": BOOTSTRAP_REPLICATES,
            "bootstrap_seed": BOOTSTRAP_SEED,
        },
    }
    detailed = {
        "schema_version": RESULTS_SCHEMA_VERSION,
        "provenance": provenance,
        "cohort_availability": cohort_availability,
        "daily_method_rows": method_days,
        "daily_alerts": daily_alerts,
        "episode_ledger": episodes,
        "exit_ledger": exit_rows,
        "universe_daily": universe_daily,
    }
    summary = build_summary(
        manifest, daily_alerts, universe_daily, method_days, episodes, exit_rows
    )
    summary["provenance"] = provenance
    summary["cohort_availability"] = cohort_availability
    return detailed, summary


def _gzip_deterministic(content: bytes) -> bytes:
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as handle:
        handle.write(content)
    return output.getvalue()


def write_new(path: Path, content: bytes) -> None:
    with path.open("xb") as handle:
        handle.write(content)


def save_results(
    detailed: Mapping[str, Any], summary: dict[str, Any], run_id: str, output_dir: Path
) -> tuple[Path, Path]:
    if not run_id or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for character in run_id):
        raise ProtocolError("run-id may contain only letters, digits, hyphen and underscore")
    script_dir = Path(__file__).resolve().parent
    if output_dir.resolve() != script_dir:
        raise ProtocolError("output-dir must be the runner's algorithm-comparison directory")
    results_path = output_dir / f"high-flier-results-{run_id}.json.gz"
    summary_path = output_dir / f"high-flier-summary-{run_id}.json"
    if results_path.exists() or summary_path.exists():
        raise FileExistsError("refusing to overwrite an existing high-flier artifact")
    detailed_raw = canonical_json_bytes(jsonable(detailed))
    compressed = _gzip_deterministic(detailed_raw)
    summary["detailed_results"] = {
        "file": results_path.name,
        "uncompressed_sha256": sha256_bytes(detailed_raw),
        "gzip_sha256": sha256_bytes(compressed),
        "uncompressed_bytes": len(detailed_raw),
        "gzip_bytes": len(compressed),
    }
    summary_raw = json.dumps(
        jsonable(summary), sort_keys=True, indent=2, allow_nan=False
    ).encode("utf-8") + b"\n"
    write_new(results_path, compressed)
    try:
        write_new(summary_path, summary_raw)
    except Exception:
        results_path.unlink(missing_ok=True)
        raise
    return results_path, summary_path


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "high-flier-data" / "final",
    )
    parser.add_argument("--run-id", required=True)
    parser.add_argument(
        "--output-dir", type=Path, default=Path(__file__).resolve().parent
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        detailed, summary = run_study(args.data_dir.resolve())
        results_path, summary_path = save_results(
            detailed, summary, args.run_id, args.output_dir
        )
    except (ProtocolError, FileExistsError, OSError) as exc:
        print(f"high-flier runner refused: {exc}", file=sys.stderr)
        return 2
    print(f"wrote {results_path.name}")
    print(f"wrote {summary_path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
