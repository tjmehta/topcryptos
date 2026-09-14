"""Historical parity from raw chronological inputs, across every exported fit."""
import collections
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import unittest

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
SOURCE=ROOT/'research/daily-breakouts/2026-09-13'
spec=importlib.util.spec_from_file_location('verified_outlook',HERE/'outlook.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
DAY=dt.timedelta(days=1)


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def close(a,b):
    if a is None or b is None: assert a is b,(a,b)
    else: assert math.isclose(a,b,rel_tol=1e-11,abs_tol=1e-12),(a,b)


def main():
    destination=HERE/'outlook-verification.json'
    if destination.exists(): raise FileExistsError(destination)
    started=dt.datetime.now(dt.timezone.utc).isoformat()
    suite=unittest.defaultTestLoader.discover(str(HERE),pattern='test_outlook.py')
    result=unittest.TextTestRunner().run(suite)
    assert result.wasSuccessful()
    bundle=m.load_bundle()
    manifest=json.loads((HERE/'bundle-manifest.json').read_text())
    for path,expected in manifest['hashes'].items(): assert sha(ROOT/path)==expected,path
    forecast=json.load(gzip.open(SOURCE/'forecast-ledger.json.gz','rt'))
    assert bundle['fits']==forecast['fits']
    daily=json.load(gzip.open(SOURCE/'ledger.json.gz','rt'))
    memberships={}
    for cohort in daily['cohorts']:
        for key in cohort['outcome_ids']:
            memberships.setdefault(key,(cohort['view'],cohort['method']))
    ia,_,_=m.helpers();hf=ia.hf
    _,_,members,raw,provenance=hf.load_frozen_dataset(ROOT/'research/algorithm-comparison/high-flier-data/final')
    panel=hf.read_panel_csv(raw,hf.read_membership_csv(members))
    years=collections.defaultdict(list)
    for identity,bars in panel.items(): years[bars[0].cohort_year].append(identity)

    def instrument(identity,signal,view):
        day=dt.date.fromisoformat(signal);first=day-(max(60,view)-1)*DAY
        bars=[dict(date=b.date.isoformat(),instrument_key=identity,open=b.open,high=b.high,low=b.low,
                   close=b.close,quote_volume=b.quote_volume,bar_status='complete')
              for b in panel[identity] if first<=b.date<=day and hf.bar_is_complete(b)]
        assert all(b['date']<=signal for b in bars)
        return dict(instrument_key=identity,symbol=panel[identity][0].symbol,
                    cohort_member=any(b.cohort_member for b in panel[identity] if b.date==day),bars=bars)

    by_fit=collections.defaultdict(list)
    by_forecast_key={}
    for row in forecast['forecasts']:
        by_fit[row['fit_id']].append(row)
        by_forecast_key[row['policy'],row['key']]=row
    fit_checks=probability_checks=0
    checked_fits=[];requests=[]
    for fit in bundle['fits']:
        cases=sorted(by_fit[fit['fit_id']],key=lambda r:(r['entry'],r['key']))
        assert cases
        for case in [cases[0],cases[-1]]:
            identity,signal,holding=json.loads(case['key']);assert holding==30
            view,method=memberships[case['key']]
            request=dict(**instrument(identity,signal,view),signal_date=signal,view_observations=view,
                interval_unit='day',hold_days=30,entry_date=case['entry'],entry_price=case['entry_price'],algorithm=method)
            assert set(request).isdisjoint({'label','target','stop','exit_price','known_net','hit','hard_exit','target_reach'})
            out=m.outlook(request,bundle)
            assert out['eligible'] and out['qualifies_for_algorithm']
            assert out['hard_exit_date']==case['hard_exit']
            zone=next(z for z in out['zones'] if z['policy']==case['policy'])
            assert zone['fit_id']==fit['fit_id'] and zone['model_status']=='available'
            assert zone['latest_training_exit']<zone['model_cutoff']<=case['entry']
            for field in ['target','stop','entry_price']: close(zone[field],case[field])
            close(zone['probability'],case['probability'])
            close(zone['historical_rate'],case['baseline_probability'])
            probability_checks+=1
            requests.append(dict(key=case['key'],fit_id=fit['fit_id'],view=view,method=method))
        checked_fits.append(fit['fit_id']);fit_checks+=1
    assert fit_checks==74 and probability_checks==148
    formations={(r['signal'],r['view']):r for r in daily['formations']}
    dates=['2020-03-01','2021-07-01','2022-12-31','2023-01-01','2024-07-01','2025-12-31']
    rank_checks=score_checks=0
    for signal in dates:
        for view in m.VIEWS:
            instruments=[instrument(identity,signal,view) for identity in sorted(years[int(signal[:4])])]
            formation=formations.get((signal,view))
            expected_eligible=set(formation['eligible']) if formation else set()
            for method in m.METHODS:
                ranked=m.rank(dict(signal_date=signal,view_observations=view,interval_unit='day',algorithm=method,instruments=instruments))
                expected_selected=formation['selected'][method] if formation else []
                assert [x['instrument_key'] for x in ranked['selected']]==expected_selected
                assert ranked['unallocated_slots']==10-len(expected_selected) and ranked['allocation_per_selected']==.1
                for assessment in ranked['universe_assessments']:
                    key=assessment['instrument_key']
                    assert assessment['eligible']==(key in expected_eligible)
                    expected_score=formation['scores'][method].get(key) if formation else None
                    close(assessment['score'],expected_score);score_checks+=1
                rank_checks+=1
    assert rank_checks==216
    example=json.loads((HERE/'example-input.json').read_text())
    golden=m.outlook(example,bundle)
    example_key=manifest['example_selection']['selected_event_key']
    assert golden['entry_price']==daily['outcomes'][example_key]['entry_price']
    assert golden['qualifies_for_algorithm'] and golden['instrument_key'].startswith('2024:BTCUSDT:')
    golden_probabilities={}
    for zone in golden['zones']:
        source=by_forecast_key[zone['policy'],example_key]
        close(zone['probability'],source['probability'])
        close(zone['target'],source['target']);close(zone['stop'],source['stop'])
        golden_probabilities[zone['policy']]=zone['probability']
    paths=[Path(__file__),HERE/'test_outlook.py',HERE/'outlook.py',HERE/'model-bundle.json',
           HERE/'bundle-manifest.json',HERE/'example-input.json',SOURCE/'ledger.json.gz',
           SOURCE/'forecast-ledger.json.gz',SOURCE/'forecast-verification.json']
    report=dict(status='passed',started_utc=started,completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        hashes={str(p.relative_to(ROOT)):sha(p) for p in paths},behavioral_tests=result.testsRun,
        exported_fits_checked=fit_checks,historical_probability_cases=probability_checks,
        checked_fit_ids=checked_fits,historical_requests=requests,
        ranking_dates=dates,ranking_views=list(m.VIEWS),whole_universe_rankings=rank_checks,
        eligibility_and_score_checks=score_checks,golden_example_key=example_key,golden_probabilities=golden_probabilities,
        limits=['Research interface only; caller supplies cohort membership and actual executable entry open.',
                'Representative probability requests cover all 74 models; all saved source forecast arithmetic has its own hashed verification.',
                'Retrospective validation metrics do not enter signal scores or forecast probabilities.',
                'No unsupported-hour or unvalidated-horizon prediction, orders, provider membership verification or live recommendation.'])
    with destination.open('x') as f: json.dump(report,f,indent=2,allow_nan=False)
    print(json.dumps({k:v for k,v in report.items() if k not in ['hashes','checked_fit_ids','historical_requests']},indent=2))


if __name__=='__main__': main()
