"""Frozen monthly target-probability model on daily-selected entries."""
import collections
import datetime as dt
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path

import numpy as np
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT/'research/sell-zone-forecast/2026-09-13'
spec = importlib.util.spec_from_file_location('frozen_forecast',SOURCE/'run.py')
ff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ff)


def main():
    ff.selftest()
    if any((HERE/name).exists() for name in ['forecast-summary.json','forecast-ledger.json.gz']):
        raise FileExistsError('Forecast outputs exist')
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    prior = json.loads((SOURCE/'summary.json').read_text())
    assert hashlib.sha256((SOURCE/'run.py').read_bytes()).hexdigest()==prior['runner_sha256']
    raw = (HERE/'exit-ledger.json.gz').read_bytes()
    source_summary = json.loads((HERE/'exit-summary.json').read_text())
    assert hashlib.sha256(raw).hexdigest()==source_summary['ledger_sha256']
    data = json.loads(gzip.decompress(raw))
    populations = collections.defaultdict(set)
    for c in data['cohorts']:
        if 2023<=c['year']<=2025:
            populations[c['view'],c['method']].update(c['outcome_ids'])
    policy_events = collections.defaultdict(list)
    skipped = collections.Counter()
    for key,variants in sorted(data['outcomes'].items()):
        identity,signal,hold = json.loads(key)
        assert hold==30
        for policy in ff.POLICIES:
            o = variants[policy]
            xs = ff.features(o,hold)
            if xs is None:
                skipped[policy] += 1
                continue
            policy_events[policy].append(dict(key=key,policy=policy,signal=signal,entry=o['entry_date'],
                hard_exit=o['hard_exit_date'],features=xs,label=o['target_reach'],
                target=o['target'],stop=o['stop'],entry_price=o['entry_price']))
    fits,forecasts,skipped_months = [],[],[]
    for policy,events in policy_events.items():
        for year in range(2023,2027):
            for month in range(1,13):
                cutoff = f'{year}-{month:02d}-01'
                if cutoff>'2026-01-01':
                    continue
                test = [r for r in events if r['entry'][:7]==cutoff[:7] and '2023'<=r['signal'][:4]<='2025']
                if not test:
                    continue
                train = ff.eligible_train(events,cutoff)
                if len(train)<200 or len({r['label'] for r in train})<2:
                    skipped_months.append(dict(policy=policy,cutoff=cutoff,training=len(train),events=len(test)))
                    continue
                x = np.array([r['features'] for r in train])
                y = np.array([r['label'] for r in train],dtype=int)
                model = make_pipeline(StandardScaler(),LogisticRegression(C=1.,solver='lbfgs',max_iter=1000))
                model.fit(x,y)
                assert model[-1].n_iter_[0]<1000
                probs = model.predict_proba(np.array([r['features'] for r in test]))[:,1]
                base = (int(y.sum())+1)/(len(y)+2)
                fit_id = f'{policy}:{cutoff}'
                fits.append(dict(fit_id=fit_id,policy=policy,cutoff=cutoff,training_n=len(train),
                    training_hits=int(y.sum()),distinct_training_signals=len({r['signal'] for r in train}),
                    latest_training_exit=max(r['hard_exit'] for r in train),baseline_probability=base,
                    scaler_mean=model[0].mean_.tolist(),scaler_scale=model[0].scale_.tolist(),
                    coefficients=model[-1].coef_[0].tolist(),intercept=float(model[-1].intercept_[0])))
                forecasts.extend(dict(r,fit_id=fit_id,probability=float(p),baseline_probability=base) for r,p in zip(test,probs))
    metrics = []
    for policy in ff.POLICIES:
        rows = [r for r in forecasts if r['policy']==policy]
        for population,keys in [('unique-events',None)]+[(f'{v}:{m}',ks) for (v,m),ks in sorted(populations.items())]:
            ps = rows if keys is None else [r for r in rows if r['key'] in keys]
            for period in ['2023-2025','2023','2024','2025']:
                selected = ps if period=='2023-2025' else [r for r in ps if r['signal'].startswith(period)]
                metrics.append(dict(policy=policy,population=population,period=period,**ff.score(selected)))
    payload = dict(fits=fits,forecasts=forecasts)
    with (HERE/'forecast-ledger.json.gz').open('xb') as out:
        with gzip.GzipFile(fileobj=out,mode='wb',mtime=0) as z:
            with io.TextIOWrapper(z,encoding='utf-8') as f:
                json.dump(payload,f,separators=(',',':'),allow_nan=False)
    paths = [Path(__file__),HERE/'forecast-protocol.md',HERE/'exit-ledger.json.gz',HERE/'exit-summary.json',SOURCE/'run.py']
    summary = dict(started_at_utc=started,completed_at_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
        ledger_sha256=hashlib.sha256((HERE/'forecast-ledger.json.gz').read_bytes()).hexdigest(),
        packages=dict(sklearn=sklearn.__version__,numpy=np.__version__),fits=len(fits),forecasts=len(forecasts),
        skipped_features=dict(skipped),skipped_months=skipped_months,summary=metrics)
    with (HERE/'forecast-summary.json').open('x') as f:
        json.dump(summary,f,indent=2,allow_nan=False)
        f.write('\n')
    print(json.dumps({k:v for k,v in summary.items() if k not in ('hashes','summary')}))
    for r in metrics:
        if r['population']=='unique-events' and r['period']=='2023-2025':
            print(json.dumps({k:v for k,v in r.items() if k!='reliability'}))


if __name__=='__main__':
    main()
