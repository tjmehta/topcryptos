#!/usr/bin/env python3
"""Synthetic causal and boundary tests for high-flier-runner.py."""

from __future__ import annotations

import copy
import datetime as dt
import importlib.util
import math
import pathlib
import sys
import unittest


RUNNER_PATH = pathlib.Path(__file__).with_name("high-flier-runner.py")
SPEC = importlib.util.spec_from_file_location("high_flier_runner", RUNNER_PATH)
assert SPEC is not None and SPEC.loader is not None
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)


def make_bars(
    count: int = 130,
    *,
    start: dt.date = dt.date(2020, 10, 1),
    symbol: str = "AAAUSDT",
    close: float = 100.0,
    volume: float = 2_000_000.0,
) -> list[runner.Bar]:
    return [
        runner.Bar(
            symbol=symbol,
            date=start + dt.timedelta(days=index),
            open=close,
            high=close * 1.01,
            low=close * 0.99,
            close=close,
            quote_volume=volume,
            cohort_member=True,
            cohort_year=2020,
            reporting_block="development",
            instrument_id=f"2020:{symbol}:segment-1",
            identity_segment_id=f"{symbol}:segment-1",
            base_volume=volume / close,
            trade_count=100,
            bar_status="valid",
        )
        for index in range(count)
    ]


def replace_bar(bars: list[runner.Bar], index: int, **changes: object) -> None:
    bars[index] = runner.dataclasses.replace(bars[index], **changes)


class EligibilityAndScoringTests(unittest.TestCase):
    def test_requires_sixty_complete_consecutive_bars_and_lagged_volume(self) -> None:
        bars = make_bars(61)
        self.assertFalse(runner.is_eligible(bars, 58))
        self.assertTrue(runner.is_eligible(bars, 59))
        replace_bar(bars, 20, bar_status="partial_interval")
        self.assertFalse(runner.is_eligible(bars, 59))

        bars = make_bars(61)
        for index in range(39, 59):
            replace_bar(bars, index, quote_volume=999_999.0)
        replace_bar(bars, 59, quote_volume=999_999_999.0)
        self.assertFalse(runner.is_eligible(bars, 59), "signal-day volume is not in lag median")

    def test_scores_use_no_future_data_and_exact_gates(self) -> None:
        bars = make_bars(90)
        for index in range(90):
            price = 80.0 + index
            replace_bar(
                bars,
                index,
                open=price,
                high=price * 1.001,
                low=price * 0.999,
                close=price,
            )
        before = runner.score_methods(bars, 70)
        replace_bar(bars, 71, open=1_000_000.0, high=1_000_000.0, low=1.0, close=500_000.0)
        self.assertEqual(before, runner.score_methods(bars, 70))
        self.assertGreater(before["Return7"], 0.0)
        self.assertGreater(before["Return21"], 0.0)
        self.assertGreater(before["Breakout20"], 0.0)

        replace_bar(bars, 70, quote_volume=1.49 * 2_000_000.0)
        self.assertIsNone(runner.score_methods(bars, 70)["VolumeBreakout20"])
        replace_bar(bars, 70, quote_volume=1.5 * 2_000_000.0)
        self.assertIsNotNone(runner.score_methods(bars, 70)["VolumeBreakout20"])

    def test_signal_day_high_is_not_breakout_reference(self) -> None:
        bars = make_bars(70)
        replace_bar(bars, 60, open=100.0, high=1_000.0, low=99.0, close=102.0)
        scores = runner.score_methods(bars, 60)
        self.assertGreater(scores["Breakout20"], 0.0)

    def test_stable_symbol_ties_and_unused_slots(self) -> None:
        ranked = runner.rank_scores(
            {"key-z": 1.0, "key-a": 1.0, "key-neg": -1.0, "key-none": None},
            stable_symbols={"key-z": "AAAUSDT", "key-a": "ZZZUSDT", "key-neg": "N", "key-none": "X"},
        )
        self.assertEqual([key for key, _ in ranked], ["key-z", "key-a"])
        self.assertEqual(runner.MAX_ALERTS - len(ranked), 8)

    def test_duplicate_date_becomes_unusable_and_stale_order_refuses(self) -> None:
        bars = make_bars(61)
        duplicate = runner.dataclasses.replace(bars[20], close=101.0, high=102.0)
        panel = runner.build_panel([*bars[:21], duplicate, *bars[21:]])
        series = next(iter(panel.values()))
        duplicate_bar = next(bar for bar in series if bar.date == bars[20].date)
        self.assertIn("duplicate_date", duplicate_bar.bar_status)
        self.assertFalse(runner.is_eligible(series, 59))
        with self.assertRaises(runner.ProtocolError):
            runner.build_panel([bars[1], bars[0]])


class ForwardGradingTests(unittest.TestCase):
    def test_t_plus_two_entry_exact_windows_and_open_endpoint(self) -> None:
        bars = make_bars(110)
        signal_index = 60
        entry_index = signal_index + 2
        replace_bar(bars, signal_index + 1, open=999.0, high=999.0, low=999.0, close=999.0)
        replace_bar(bars, entry_index, open=100.0, high=101.0, low=98.0, close=100.0)
        replace_bar(bars, entry_index + 6, high=130.0, low=97.0)
        replace_bar(bars, entry_index + 7, open=120.0, high=9_999.0, low=1.0, close=120.0)
        by_date = {bar.date: bar for bar in bars}
        grade = runner.grade_forward(by_date, bars[signal_index].date, 7)
        self.assertEqual(grade.entry_date, bars[entry_index].date)
        self.assertAlmostEqual(grade.mfe, 0.30)
        self.assertAlmostEqual(grade.endpoint_return, 0.20)
        self.assertEqual(grade.first_peak_date, bars[entry_index + 6].date)
        self.assertTrue(grade.absolute_hit)

    def test_missing_entry_path_and_endpoint_are_not_shifted_or_dropped(self) -> None:
        bars = make_bars(110)
        signal_index = 60
        signal_date = bars[signal_index].date
        by_date = {bar.date: bar for bar in bars}
        del by_date[bars[signal_index + 2].date]
        missing_entry = runner.grade_forward(by_date, signal_date, 7)
        self.assertEqual(missing_entry.entry_status, "missing")
        self.assertIsNone(missing_entry.absolute_hit)

        by_date = {bar.date: bar for bar in bars}
        del by_date[bars[signal_index + 4].date]
        incomplete = runner.grade_forward(by_date, signal_date, 7)
        self.assertEqual(incomplete.path_status, "unknown_incomplete_path")
        self.assertIsNone(incomplete.mfe)
        self.assertEqual(incomplete.endpoint_status, "known")

        by_date = {bar.date: bar for bar in bars}
        del by_date[bars[signal_index + 9].date]
        endpoint_missing = runner.grade_forward(by_date, signal_date, 7)
        self.assertEqual(endpoint_missing.path_status, "known")
        self.assertIsNone(endpoint_missing.endpoint_return)

    def test_partial_open_requires_positive_activity_but_cannot_grade_path(self) -> None:
        bars = make_bars(100)
        signal_index = 60
        entry_index = 62
        replace_bar(bars, entry_index, bar_status="partial_interval", trade_count=2)
        grade = runner.grade_forward({bar.date: bar for bar in bars}, bars[signal_index].date, 7)
        self.assertEqual(grade.entry_status, "known")
        self.assertEqual(grade.path_status, "unknown_incomplete_path")

        replace_bar(bars, entry_index, trade_count=0, base_volume=0.0, quote_volume=0.0)
        grade = runner.grade_forward({bar.date: bar for bar in bars}, bars[signal_index].date, 7)
        self.assertEqual(grade.entry_status, "missing")

        replace_bar(
            bars,
            entry_index,
            bar_status="complete",
            trade_count=0,
            base_volume=0.0,
            quote_volume=0.0,
        )
        grade = runner.grade_forward({bar.date: bar for bar in bars}, bars[signal_index].date, 7)
        self.assertEqual(grade.entry_status, "missing")

        replace_bar(
            bars,
            entry_index,
            bar_status="partial_interval",
            trade_count=2,
            base_volume=1.0,
            quote_volume=100.0,
            scheduled_midnight_open=False,
        )
        grade = runner.grade_forward({bar.date: bar for bar in bars}, bars[signal_index].date, 7)
        self.assertEqual(grade.entry_status, "missing")

    def test_relative_decile_is_conditional_when_any_path_unknown(self) -> None:
        day = dt.date(2020, 1, 1)
        grades = {
            f"k{index}": runner.Grade(7, day, "known", "known", "known", 1.0, float(index), -0.1, 0.0, True, day, day)
            for index in range(9)
        }
        grades["unknown"] = runner.Grade(7, day, "known", "unknown", "known", 1.0, None, None, 0.0, None, None, None)
        selected, known, unknown, conditional = runner.relative_top_decile(grades)
        self.assertEqual(known, 9)
        self.assertEqual(unknown, 1)
        self.assertTrue(conditional)
        self.assertEqual(selected, {"k8"})


class EpisodeAndFeeTests(unittest.TestCase):
    def test_cooldown_is_thirty_calendar_days_and_does_not_refill(self) -> None:
        base = dt.date(2020, 1, 1)
        alerts = []
        for offset, symbol in ((0, "AAA"), (5, "AAA"), (29, "AAA"), (30, "AAA"), (6, "BBB")):
            alerts.append(
                {
                    "method": "Return7",
                    "signal_date": (base + dt.timedelta(days=offset - 2)).isoformat(),
                    "entry_date": (base + dt.timedelta(days=offset)).isoformat(),
                    "symbol": symbol,
                    "instrument_key": f"2020:{symbol}",
                    "instrument_id": symbol,
                    "identity_segment_id": symbol,
                    "cohort_year": 2020,
                    "reporting_block": "development",
                    "rank": 1,
                    "score": 1.0,
                    "entry_status": "known",
                    "grades": {},
                    "episode_status": None,
                }
            )
        episodes = runner.assign_episodes(alerts)
        aaa_dates = [row["entry_date"] for row in episodes if row["symbol"] == "AAA"]
        self.assertEqual(aaa_dates, [base.isoformat(), (base + dt.timedelta(days=30)).isoformat()])
        self.assertEqual(sum(row["episode_status"] == "suppressed_cooldown" for row in alerts), 2)

    def test_exact_unit_capital_fees(self) -> None:
        expected = (120.0 / 100.0) * (1.0 - 0.005) / (1.0 + 0.005) - 1.0
        self.assertAlmostEqual(runner.exact_unit_return(100.0, 120.0, 50), expected)
        self.assertAlmostEqual(runner.exact_unit_return(100.0, 120.0, 0), 0.20)


class ExitTests(unittest.TestCase):
    def test_trail_trigger_fills_two_days_later_at_open_not_peak(self) -> None:
        bars = make_bars(130)
        signal_index = 60
        entry = 62
        replace_bar(bars, entry, open=100.0, high=110.0, low=99.0, close=110.0)
        replace_bar(bars, entry + 1, open=110.0, high=150.0, low=105.0, close=120.0)
        replace_bar(bars, entry + 2, open=120.0, high=125.0, low=100.0, close=100.0)
        replace_bar(bars, entry + 4, open=90.0, high=1_000.0, low=1.0, close=500.0)
        outcome = runner.evaluate_exit("Trail15", bars, bars[signal_index].date)
        self.assertEqual(outcome.trigger_date, bars[entry + 2].date)
        self.assertEqual(outcome.exit_date, bars[entry + 4].date)
        self.assertAlmostEqual(outcome.gross_return, -0.10)
        self.assertAlmostEqual(outcome.mfe_before_exit, 0.50)
        self.assertNotEqual(outcome.exit_open, 1_000.0)
        self.assertGreater(outcome.full_mfe_30, 8.0)

    def test_chandelier_stop_ratchets_when_atr_rises(self) -> None:
        bars = make_bars(130)
        signal_index = 60
        entry = 62
        replace_bar(bars, entry, open=100.0, high=110.0, low=100.0, close=109.0)
        replace_bar(bars, entry + 1, open=109.0, high=110.0, low=90.0, close=101.0)
        replace_bar(bars, entry + 3, open=95.0, high=96.0, low=94.0, close=95.0)
        outcome = runner.evaluate_exit("Chandelier3ATR", bars, bars[signal_index].date)
        self.assertEqual(outcome.trigger_date, bars[entry + 1].date)
        self.assertEqual(outcome.exit_date, bars[entry + 3].date)

    def test_ema_requires_two_post_entry_consecutive_closes(self) -> None:
        bars = make_bars(130)
        signal_index = 60
        entry = 62
        replace_bar(bars, entry, close=99.0, high=101.0, low=98.0)
        replace_bar(bars, entry + 1, close=98.0, high=100.0, low=97.0)
        replace_bar(bars, entry + 3, open=97.0, high=98.0, low=96.0, close=97.0)
        outcome = runner.evaluate_exit("EMA10Break", bars, bars[signal_index].date)
        self.assertEqual(outcome.trigger_date, bars[entry + 1].date)
        self.assertEqual(outcome.exit_date, bars[entry + 3].date)

    def test_missing_close_makes_first_trigger_order_unknown(self) -> None:
        bars = make_bars(130)
        signal_index = 60
        entry_date = bars[62].date
        bars = [bar for bar in bars if bar.date != entry_date + dt.timedelta(days=1)]
        outcome = runner.evaluate_exit("Trail15", bars, bars[signal_index].date)
        self.assertEqual(outcome.status, "unknown_trigger_order")
        self.assertIsNone(outcome.gross_return)

    def test_last_causal_trigger_day_is_e_plus_28(self) -> None:
        bars = make_bars(140)
        signal_index = 60
        entry = 62
        replace_bar(bars, entry, close=120.0, high=121.0)
        for index in range(entry + 1, entry + 28):
            replace_bar(bars, index, close=120.0, high=121.0, low=119.0)
        replace_bar(bars, entry + 28, close=90.0, high=120.0, low=89.0)
        replace_bar(bars, entry + 30, open=80.0, high=81.0, low=79.0, close=80.0)
        outcome = runner.evaluate_exit("Trail15", bars, bars[signal_index].date)
        self.assertEqual(outcome.trigger_date, bars[entry + 28].date)
        self.assertEqual(outcome.exit_date, bars[entry + 30].date)
        self.assertEqual(outcome.holding_days, 30)

    def test_e_plus_29_close_is_not_read_for_overlay_fill(self) -> None:
        bars = make_bars(140)
        signal_index = 60
        entry = 62
        replace_bar(bars, entry, close=120.0, high=121.0)
        for index in range(entry + 1, entry + 29):
            replace_bar(bars, index, close=120.0, high=121.0, low=119.0)
        replace_bar(bars, entry + 29, close=80.0, high=120.0, low=79.0)
        replace_bar(bars, entry + 30, open=90.0, high=91.0, low=89.0, close=90.0)
        outcome = runner.evaluate_exit("Trail15", bars, bars[signal_index].date)
        self.assertIsNone(outcome.trigger_date)
        self.assertEqual(outcome.exit_date, bars[entry + 30].date)
        self.assertFalse(outcome.early_exit)

    def test_fixed_and_triggered_rules_share_immutable_entry(self) -> None:
        bars = make_bars(130)
        signal_date = bars[60].date
        original = copy.deepcopy(bars)
        outcomes = [runner.evaluate_exit(rule, bars, signal_date) for rule in runner.EXIT_RULES]
        self.assertEqual(bars, original)
        self.assertTrue(all(outcome.scheduled_exit_date <= bars[92].date for outcome in outcomes))


class BootstrapTests(unittest.TestCase):
    def test_calendar_block_bootstrap_is_deterministic(self) -> None:
        start = dt.date(2020, 1, 1)
        paired = {start + dt.timedelta(days=index): math.sin(index) for index in range(100)}
        first = runner.moving_block_bootstrap(paired)
        second = runner.moving_block_bootstrap(paired)
        self.assertEqual(first, second)
        self.assertEqual(first["requested_replicates"], 1000)
        self.assertEqual(first["seed"], 20260912)
        self.assertEqual(first["block_days"], 30)

    def test_missing_calendar_days_are_masked_not_zero_outcomes(self) -> None:
        start = dt.date(2020, 1, 1)
        observations = {
            start: (2.0, 2),
            start + dt.timedelta(days=89): (3.0, 3),
        }
        result = runner.moving_block_ratio_bootstrap(observations)
        self.assertEqual(result["status"], "ok")
        self.assertAlmostEqual(result["estimate"], 1.0)
        self.assertEqual(result["paired_observations"], 5)
        self.assertEqual(result["calendar_days_with_no_observation"], 88)

    def test_position_counts_not_equal_weighted_date_means(self) -> None:
        start = dt.date(2020, 1, 1)
        observations = {
            start: (10.0, 10),
            start + dt.timedelta(days=60): (-1.0, 1),
        }
        result = runner.moving_block_ratio_bootstrap(observations)
        self.assertAlmostEqual(result["estimate"], 9.0 / 11.0)

    def test_short_data_reports_cannot_compute(self) -> None:
        result = runner.moving_block_bootstrap({dt.date(2020, 1, 1): 1.0})
        self.assertEqual(result["status"], "cannot_compute")


if __name__ == "__main__":
    unittest.main(verbosity=2)
