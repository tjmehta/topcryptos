"""Freeze label-free raw inputs and verified Python outputs for the JS port."""
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
DEST=ROOT/'modules/__tests__/fixtures/ohlc-parity.json.gz'
spec=importlib.util.spec_from_file_location('fixture_outlook',HERE/'outlook.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


def main():
    if DEST.exists(): raise FileExistsError(DEST)
    verification=json.loads((HERE/'outlook-verification.json').read_text())
    assert verification['status']=='passed'
    for path,digest in verification['hashes'].items():
        assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==digest,path
    bundle=m.load_bundle()
    ia,_,_=m.helpers();hf=ia.hf
    _,_,members,raw,_=hf.load_frozen_dataset(ROOT/'research/algorithm-comparison/high-flier-data/final')
    panel=hf.read_panel_csv(raw,hf.read_membership_csv(members))
    instruments={}

    def instrument(identity,signal,view):
        key=f'{identity}|{signal}|{max(60,view)}'
        if key not in instruments:
            day=dt.date.fromisoformat(signal);first=day-dt.timedelta(days=max(60,view)-1)
            instruments[key]=dict(instrument_key=identity,symbol=panel[identity][0].symbol,
                cohort_member=any(b.cohort_member for b in panel[identity] if b.date==day),
                bars=[dict(date=b.date.isoformat(),instrument_key=identity,open=b.open,high=b.high,low=b.low,
                           close=b.close,quote_volume=b.quote_volume,bar_status='complete')
                      for b in panel[identity] if first<=b.date<=day and hf.bar_is_complete(b)])
        return key

    signal='2024-07-01'
    identities=sorted(identity for identity,bars in panel.items() if bars[0].cohort_year==2024)
    rankings=[]
    for view in m.VIEWS:
        keys=[instrument(identity,signal,view) for identity in identities]
        for method in m.METHODS:
            args=dict(signal_date=signal,view_observations=view,interval_unit='day',algorithm=method)
            expected=m.rank(dict(**args,instruments=[instruments[key] for key in keys]))
            rankings.append(dict(request=args,instrument_refs=keys,expected=expected))
    forecasts=json.load(gzip.open(ROOT/'research/daily-breakouts/2026-09-13/forecast-ledger.json.gz','rt'))
    by_key={r['key']:r for r in forecasts['forecasts']}
    cases=[]
    for row in verification['historical_requests']:
        identity,signal,hold=json.loads(row['key'])
        case=by_key[row['key']]
        ref=instrument(identity,signal,row['view'])
        args=dict(signal_date=signal,view_observations=row['view'],interval_unit='day',algorithm=row['method'],
                  hold_days=30,entry_date=case['entry'],entry_price=case['entry_price'])
        expected=m.outlook(dict(**instruments[ref],**args),bundle)
        cases.append(dict(request=args,instrument_ref=ref,expected=expected,fit_id=row['fit_id']))
    payload=dict(created_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        source_hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in
                      [Path(__file__),HERE/'outlook.py',HERE/'model-bundle.json',HERE/'outlook-verification.json']},
        instruments=instruments,rankings=rankings,outlooks=cases,
        golden_request=json.loads((HERE/'example-input.json').read_text()))
    DEST.parent.mkdir(parents=True,exist_ok=True)
    with DEST.open('xb') as f:
        f.write(gzip.compress(json.dumps(payload,separators=(',',':'),allow_nan=False).encode(),mtime=0))
    print(json.dumps(dict(instruments=len(instruments),rankings=len(rankings),outlooks=len(cases),bytes=DEST.stat().st_size,
                         sha256=hashlib.sha256(DEST.read_bytes()).hexdigest())))


if __name__=='__main__': main()
