import datetime as dt
import importlib.util
import math
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('sell_zone_tested', Path(__file__).with_name('run.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
SIGNAL = dt.date(2020, 2, 1)


def bar(offset, price=100., high=101., low=99., close=None):
    return m.hf.Bar(symbol='X', date=SIGNAL+offset*m.DAY, open=price, high=max(high,price),
                    low=min(low,price), close=price if close is None else close,
                    quote_volume=1e7, cohort_member=True)


class ExitTests(unittest.TestCase):
    def test_target_close_fills_two_days_later_actual_open(self):
        rows = {b.date:b for b in [bar(2,close=140,high=145),bar(4,price=90)]}
        out=m.evaluate(rows,SIGNAL,14,'SMAATRBracket',10,200)
        self.assertEqual(out['reason'],'target')
        self.assertEqual(out['exit_date'],(SIGNAL+4*m.DAY).isoformat())
        self.assertAlmostEqual(out['known_net'],.9*.995/1.005-1)

    def test_high_does_not_trigger_or_fill(self):
        rows={b.date:b for b in [bar(i,high=150) for i in range(2,17)]}
        out=m.evaluate(rows,SIGNAL,14,'SMAATRBracket',10,200)
        self.assertEqual(out['reason'],'hard')
        self.assertTrue(out['target_reach'])
        self.assertLess(out['known_net'],0)

    def test_missing_bar_before_trigger_is_unknown(self):
        rows={b.date:b for b in [bar(2),bar(4,close=140,high=140),bar(6,price=150),bar(16)]}
        out=m.evaluate(rows,SIGNAL,14,'SMAATRBracket',10,200)
        self.assertEqual(out['status'],'unknown_trigger_order')
        self.assertEqual(out['net_loss'],-1)
        self.assertTrue(out['target_reach'])

    def test_missing_entry_is_cash_and_missing_exit_is_not(self):
        self.assertEqual(m.evaluate({},SIGNAL,14,'FixedH',10,200)['net_loss'],0)
        out=m.evaluate({SIGNAL+2*m.DAY:bar(2)},SIGNAL,14,'FixedH',10,200)
        self.assertEqual(out['net_loss'],-1)
        self.assertLess(out['net_zero'],0)

    def test_levels_ignore_future_and_resistance_excludes_signal(self):
        rows=[bar(i) for i in range(-25,1)]
        before=m.levels(rows,SIGNAL)
        self.assertEqual(before,(2.,101.))
        self.assertEqual(m.levels(rows+[bar(1,price=9999)],SIGNAL),before)
        rows[-1]=bar(0,high=200)
        after=m.levels(rows,SIGNAL)
        self.assertEqual(after[1],101.)
        self.assertGreater(after[0],before[0])

    def test_resistance_requires_above_entry_and_caps_target(self):
        rows={b.date:b for b in [bar(i) for i in range(2,17)]}
        self.assertEqual(m.evaluate(rows,SIGNAL,14,'ResistanceSMAATR',10,110)['target'],110)
        self.assertEqual(m.evaluate(rows,SIGNAL,14,'ResistanceSMAATR',10,90)['target'],130)

    def test_final_trigger_capped_hard_exit(self):
        rows={b.date:b for b in [bar(i,close=140 if i==14 else 100,high=140) for i in range(2,17)]}
        out=m.evaluate(rows,SIGNAL,14,'SMAATRBracket',10,200)
        self.assertEqual(out['duration'],14)
        self.assertEqual(out['trigger_date'],(SIGNAL+14*m.DAY).isoformat())

    def test_missing_resistance_has_no_hypothetical_target_label(self):
        rows={b.date:b for b in [bar(i,high=150) for i in range(2,17)]}
        out=m.evaluate(rows,SIGNAL,14,'ResistanceSMAATR',10,None)
        self.assertEqual(out['status'],'unknown_trigger_order')
        self.assertIsNone(out['target'])
        self.assertIsNone(out['target_reach'])

    def test_stop_fills_delayed_open_after_rebound(self):
        rows={b.date:b for b in [bar(2,low=70,close=70),bar(4,price=110)]}
        out=m.evaluate(rows,SIGNAL,14,'SMAATRBracket',10,200)
        self.assertEqual(out['reason'],'stop')
        self.assertAlmostEqual(out['known_net'],1.1*.995/1.005-1)


if __name__=='__main__':
    unittest.main()
