"""Export the frozen forecast model and a chronological, label-free example."""
import csv
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
SOURCE=ROOT/'research/daily-breakouts/2026-09-13'
PANEL=ROOT/'research/algorithm-comparison/high-flier-data/final/daily-panel.csv.gz'
PANEL_SHA='91dfcdc1afac7a35087a1f9a56b1c75bbede3c504f81a85b4192ef6fe6f7340c'
METHODS=['Momentum','Breakout','VolumeBreakout']
VIEWS=[3,4,5,6,7,10,14,21,30,45,60,90]
DAY=dt.timedelta(days=1)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path,value):
    with path.open('x') as f:
        json.dump(value,f,indent=2,allow_nan=False)
        f.write('\n')


def main():
    outputs=['model-bundle.json','bundle-manifest.json','example-input.json']
    for name in outputs:
        if (HERE/name).exists():
            raise FileExistsError(name)
    started=dt.datetime.now(dt.timezone.utc).isoformat()
    summary=json.loads((SOURCE/'forecast-summary.json').read_text())
    verification=json.loads((SOURCE/'forecast-verification.json').read_text())
    assert verification['status']=='passed'
    assert sha(SOURCE/'forecast-ledger.json.gz')==summary['ledger_sha256']
    for document in [summary,verification]:
        for path,expected in document['hashes'].items():
            assert sha(ROOT/path)==expected,path
    assert sha(PANEL)==PANEL_SHA
    forecasts=json.loads(gzip.decompress((SOURCE/'forecast-ledger.json.gz').read_bytes()))
    fits=forecasts['fits']
    metrics=summary['summary']
    assert len(fits)==summary['fits']==74
    assert len(metrics)==296
    assert len({f['fit_id'] for f in fits})==len(fits)
    assert all(f['latest_training_exit']<f['cutoff'] for f in fits)
    metadata=dict(forecast_ledger_sha256=sha(SOURCE/'forecast-ledger.json.gz'),
        forecast_summary_sha256=sha(SOURCE/'forecast-summary.json'),
        forecast_verification_sha256=sha(SOURCE/'forecast-verification.json'),
        training_support_end=max(f['latest_training_exit'] for f in fits),
        forecast_first_cutoff=min(f['cutoff'] for f in fits),
        forecast_last_cutoff=max(f['cutoff'] for f in fits))
    bundle=dict(schema_version=1,hold_days=30,methods=METHODS,views=VIEWS,
                fits=fits,metrics=metrics,source=metadata,created_utc=started)
    daily_summary=json.loads((SOURCE/'summary.json').read_text())
    assert sha(SOURCE/'ledger.json.gz')==daily_summary['ledger_sha256']
    for path,expected in daily_summary['hashes'].items():
        assert sha(ROOT/path)==expected,path
    daily=json.loads(gzip.decompress((SOURCE/'ledger.json.gz').read_bytes()))
    eligible=sorted((c['signal'],key) for c in daily['cohorts']
        if c['year']==2024 and c['view']==7 and c['method']=='Breakout'
        for key in c['outcome_ids'])
    preferred=[x for x in eligible if daily['outcomes'][x[1]]['symbol']=='BTCUSDT']
    assert eligible
    signal,key=(preferred or eligible)[0]
    identity,identity_signal,hold=json.loads(key)
    assert identity_signal==signal and hold==30
    selected=daily['outcomes'][key]
    assert not selected['entry_missing'] and selected['entry_price'] is not None
    signal_day=dt.date.fromisoformat(signal)
    first_day=signal_day-59*DAY
    index={}
    with gzip.open(PANEL,'rt') as f:
        for raw in csv.DictReader(f):
            if raw['cohort_year']+':'+raw['identity_segment_id']!=identity:
                continue
            day=dt.date.fromisoformat(raw['date'])
            if first_day<=day<=signal_day:
                assert raw['bar_status']=='complete'
                assert raw['date'] not in index
                index[raw['date']]=dict(date=raw['date'],instrument_key=identity,
                    **{field:float(raw[field]) for field in ['open','high','low','close','quote_volume']},
                    bar_status='complete')
    dates=[(first_day+i*DAY).isoformat() for i in range(60)]
    assert set(index)==set(dates)
    bars=[index[day] for day in dates]
    assert all(b['date']<=signal for b in bars)
    assert selected['entry_date']==(signal_day+2*DAY).isoformat()
    example=dict(interval_unit='day',view_observations=7,signal_date=signal,
        hold_days=30,entry_date=selected['entry_date'],entry_price=selected['entry_price'],
        instrument_key=identity,symbol=selected['symbol'],cohort_member=True,bars=bars)
    # Fixed schemas deliberately contain neither exit labels/returns nor future bars.
    assert set(example)=={'interval_unit','view_observations','signal_date','hold_days',
                         'entry_date','entry_price','instrument_key','symbol','cohort_member','bars'}
    assert all(set(b)=={'date','instrument_key','open','high','low','close','quote_volume','bar_status'} for b in bars)
    save(HERE/'model-bundle.json',bundle)
    save(HERE/'example-input.json',example)
    # Reloading checks the exact export, without fitting a model or running a backtest.
    saved=json.loads((HERE/'model-bundle.json').read_text())
    assert saved['fits']==fits and saved['metrics']==metrics
    assert json.loads((HERE/'example-input.json').read_text())==example
    sources=[Path(__file__),HERE/'example-input.json',SOURCE/'forecast-ledger.json.gz',
        SOURCE/'forecast-summary.json',SOURCE/'forecast-verification.json',
        SOURCE/'ledger.json.gz',SOURCE/'summary.json',PANEL]
    manifest=dict(schema_version=1,created_utc=started,
        completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        bundle_sha256=sha(HERE/'model-bundle.json'),
        hashes={str(p.relative_to(ROOT)):sha(p) for p in sources},
        export_counts=dict(fits=len(fits),metrics=len(metrics),example_bars=len(bars)),
        example_selection=dict(rule='Earliest 2024 signal date with selected BTCUSDT in Breakout/view7; lexicographic identity breaks ties. Fallback only if BTCUSDT has no selected event.',
            selected_event_key=key,used_preferred_btc=bool(preferred),signal=signal,
            first_bar=dates[0],last_bar=dates[-1],entry_date=selected['entry_date']),
        checks=['All source and independent-verification hashes match.',
            'All 74 fits and 296 summary rows round-trip unchanged.',
            'Example is chronological and selected without consulting returns or labels.',
            'Example contains 60 consecutive same-identity complete bars through signal only.',
            'Example entry date/price matches the frozen executable t+2 open.'])
    save(HERE/'bundle-manifest.json',manifest)
    print(json.dumps(dict(bundle_sha256=manifest['bundle_sha256'],export_counts=manifest['export_counts'],
                          example_selection=manifest['example_selection'])))


if __name__=='__main__':
    main()
