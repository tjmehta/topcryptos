"""Behavioral boundary tests for the local, research-only outlook interface."""
import copy
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('tested_outlook',HERE/'outlook.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


def request(signal='2024-01-01',view=7):
    day=dt.date.fromisoformat(signal)
    key=f'{day.year}:XUSDT:segment-01'
    bars=[]
    for i in range(90):
        close=120. if i==89 else 100.
        bars.append(dict(date=(day-dt.timedelta(days=89-i)).isoformat(),instrument_key=key,
            open=100.,high=max(close,101.),low=99.,close=close,quote_volume=5e6 if i==89 else 2e6,bar_status='complete'))
    return dict(interval_unit='day',view_observations=view,signal_date=signal,hold_days=30,
        entry_date=(day+dt.timedelta(days=2)).isoformat(),entry_price=123.,instrument_key=key,
        symbol='XUSDT',cohort_member=True,bars=bars,algorithm='Breakout')


class OutlookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.bundle=m.load_bundle()

    def test_exact_entry_horizon_and_entry_known_levels(self):
        r=request();out=m.outlook(r,self.bundle)
        self.assertEqual(out['entry_date'],'2024-01-03')
        self.assertEqual(out['hard_exit_date'],'2024-02-02')
        for z in out['zones']:
            self.assertEqual(z['level_source_date'],r['signal_date'])
            self.assertEqual(z['entry_price'],123.)
            self.assertAlmostEqual(z['stop'],max(0,123.-2*z['atr_sma14']))
            self.assertLess(z['latest_training_exit'],z['model_cutoff'])
        r['entry_date']='2024-01-02'
        with self.assertRaises(ValueError): m.outlook(r,self.bundle)

    def test_future_bars_and_labels_cannot_change_outlook(self):
        r=request();expected=m.outlook(r,self.bundle)
        r['bars'].extend([dict(date='2024-01-02',open=-1,close=float('nan')),dict(date='2024-02-02',instrument_key='wrong')])
        r.update(exit_price=999999.,target_reach=True,known_net=999.)
        self.assertEqual(m.outlook(r,self.bundle),expected)

    def test_duplicate_dates_and_cross_identity_rejected(self):
        for mutation in ['duplicate','identity','year']:
            r=request()
            if mutation=='duplicate': r['bars'].append(dict(r['bars'][0]))
            elif mutation=='identity': r['bars'][0]['instrument_key']='2024:YUSDT:segment-01'
            else: r['instrument_key']='2023:XUSDT:segment-01'
            with self.assertRaises(ValueError): m.outlook(r,self.bundle)

    def test_missing_recent_history_and_membership_suppress(self):
        for mutation in ['gap','short','member','missing_signal','illiquid']:
            r=request()
            if mutation=='gap': del r['bars'][-10]
            elif mutation=='short': r['bars']=r['bars'][-59:]
            elif mutation=='member': r['cohort_member']=False
            elif mutation=='missing_signal': r['bars'].pop()
            else:
                for b in r['bars']: b['quote_volume']=100.
            out=m.outlook(r,self.bundle)
            self.assertFalse(out['eligible']);self.assertEqual(out['zones'],[])
            self.assertIsNone(out['target_probability'])

    def test_old_gap_does_not_break_complete_current_window(self):
        r=request();del r['bars'][0]
        self.assertTrue(m.formation(r)['eligible'])

    def test_invalid_numbers_and_ohlc_rejected(self):
        for field,value in [('open',0),('low',-1),('close',True),('high',float('inf')),
                            ('quote_volume',-1),('quote_volume',float('nan')),('high',50),('low',200)]:
            r=request();r['bars'][-1][field]=value
            with self.assertRaises(ValueError): m.outlook(r,self.bundle)
        for value in [0,-1,True,float('inf')]:
            r=request();r['entry_price']=value
            with self.assertRaises(ValueError): m.outlook(r,self.bundle)

    def test_incomplete_bar_and_implicit_membership_rejected(self):
        for field,value in [('bar_status','partial_terminal'),('bar_status','invalid')]:
            r=request();r['bars'][-1][field]=value
            with self.assertRaises(ValueError): m.outlook(r,self.bundle)
        r=request();r['cohort_member']=1
        with self.assertRaises(ValueError): m.outlook(r,self.bundle)

    def test_no_exact_month_has_no_probability(self):
        out=m.outlook(request('2030-01-01'),self.bundle)
        self.assertTrue(out['eligible'])
        for z in out['zones']:
            self.assertIsNone(z['probability']);self.assertEqual(z['model_status'],'no-exact-month-model')
            self.assertIsNone(z['fit_id'])

    def test_unsupported_horizons_and_bad_hold_types(self):
        for hold in [7,14,60,90,365]:
            r=request();r['hold_days']=hold
            out=m.outlook(r,self.bundle)
            self.assertEqual(out['status'],'unsupported-horizon');self.assertIsNone(out['target_probability'])
        for hold in [True,30.,'30']:
            r=request();r['hold_days']=hold
            with self.assertRaises(ValueError): m.outlook(r,self.bundle)

    def test_rank_validates_even_empty_universe(self):
        base=dict(signal_date='2024-01-01',view_observations=7,instruments=[])
        for field,value in [('interval_unit','hour'),('view_observations',True),('view_observations',2),('signal_date','bad')]:
            with self.assertRaises(ValueError): m.rank({**base,field:value})
        result=m.rank(base)
        self.assertEqual(result['selected'],[]);self.assertEqual(result['unallocated_slots'],10)

    def test_positive_ranking_ties_cash_and_identity_dedup(self):
        instruments=[]
        for i in reversed(range(12)):
            r=request();old=r['instrument_key'];new=f'2024:X{i:02}:segment-01'
            r['instrument_key']=new
            for bar in r['bars']: bar['instrument_key']=new
            instruments.append(r)
        req=dict(signal_date='2024-01-01',view_observations=7,algorithm='Breakout',instruments=instruments)
        result=m.rank(req)
        self.assertEqual([r['instrument_key'] for r in result['selected']],sorted(r['instrument_key'] for r in instruments)[:10])
        self.assertEqual(result['allocation_per_selected'],.1);self.assertEqual(result['unallocated_slots'],0)
        req['instruments']=instruments[:2]
        self.assertEqual(m.rank(req)['unallocated_slots'],8)
        req['instruments']=instruments[:1]*2
        with self.assertRaises(ValueError): m.rank(req)

    def test_nonqualifying_signal_has_no_probability(self):
        r=request()
        for b in r['bars']: b.update(open=100.,high=101.,low=99.,close=100.)
        out=m.outlook(r,self.bundle)
        self.assertTrue(out['eligible']);self.assertFalse(out['qualifies_for_algorithm'])
        for z in out['zones']:
            self.assertIsNone(z['probability']);self.assertEqual(z['model_status'],'no-qualifying-signal')
        self.assertEqual(m.rank(dict(signal_date=r['signal_date'],view_observations=7,instruments=[r]))['selected'],[])

    def test_bundle_integrity_maturity_and_duplicate_models(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'model-bundle.json'
            for mutation in ['hash','maturity','duplicate','scale']:
                value=copy.deepcopy(self.bundle)
                if mutation=='maturity': value['fits'][0]['latest_training_exit']=value['fits'][0]['cutoff']
                elif mutation=='duplicate': value['fits'].append(value['fits'][0])
                elif mutation=='scale': value['fits'][0]['scaler_scale'][0]=0
                raw=json.dumps(value).encode();path.write_bytes(raw)
                sha=hashlib.sha256(raw).hexdigest() if mutation!='hash' else '0'*64
                path.with_name('bundle-manifest.json').write_text(json.dumps(dict(bundle_sha256=sha)))
                with self.assertRaises(ValueError): m.load_bundle(path)


if __name__=='__main__': unittest.main()
