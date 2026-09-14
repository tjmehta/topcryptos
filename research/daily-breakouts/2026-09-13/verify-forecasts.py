"""Independent arithmetic/causality audit. Imports no strategy or forecast code."""
import collections
import csv
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics as st

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PANEL = ROOT/'research/algorithm-comparison/high-flier-data/final/daily-panel.csv.gz'
PANEL_SHA = '91dfcdc1afac7a35087a1f9a56b1c75bbede3c504f81a85b4192ef6fe6f7340c'
POLICIES = ('SMAATRBracket','ResistanceSMAATR')
DAY = dt.timedelta(days=1)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def near(a,b,rel=2e-10,abs_tol=2e-12):
    assert math.isfinite(a) and math.isfinite(b)
    assert math.isclose(a,b,rel_tol=rel,abs_tol=abs_tol), (a,b)


def close_tree(expected,got):
    if isinstance(expected,dict):
        assert expected.keys() == got.keys(), (expected.keys(),got.keys())
        for key in expected:
            close_tree(expected[key],got[key])
    elif isinstance(expected,list):
        assert len(expected)==len(got)
        for a,b in zip(expected,got):
            close_tree(a,b)
    elif isinstance(expected,float):
        near(expected,got)
    else:
        assert expected == got,(expected,got)


def sigmoid(value):
    if value >= 0:
        return 1/(1+math.exp(-value))
    positive = math.exp(value)
    return positive/(1+positive)


def complete(bar):
    return bar is not None and bar['bar_status'].split('|')[0] in ('valid','complete')


def executable(bar):
    if bar is None:
        return False
    date=dt.date.fromisoformat(bar['date'])
    midnight=int(dt.datetime.combine(date,dt.time(),dt.timezone.utc).timestamp())*1000000
    return (bar['bar_status'].split('|')[0] in ('valid','complete','partial_terminal')
            and int(bar['open_time_us'])==midnight and bar['open']>0
            and math.isfinite(bar['open']) and int(bar['trade_count'])>0
            and float(bar['base_volume'])>0 and float(bar['quote_volume'])>0)


def raw_geometry(identity,signal,prices):
    day=dt.date.fromisoformat(signal)
    history=[prices.get((identity,(day-i*DAY).isoformat())) for i in range(21)]
    recent=history[:15]
    atr=(math.fsum(max(recent[i]['high']-recent[i]['low'],
                     abs(recent[i]['high']-recent[i+1]['close']),
                     abs(recent[i]['low']-recent[i+1]['close'])) for i in range(14))/14
         if all(complete(b) for b in recent) else None)
    resistance=max(b['high'] for b in history[1:]) if all(complete(b) for b in history[1:]) else None
    entry_day=day+2*DAY
    entry_bar=prices.get((identity,entry_day.isoformat()))
    entry=entry_bar['open'] if executable(entry_bar) else None
    future=[prices.get((identity,(entry_day+i*DAY).isoformat())) for i in range(30)]
    return atr,resistance,entry,future


def features(o):
    entry,atr,resistance=o['entry_price'],o['atr_sma14'],o['prior20_resistance']
    if entry is None or entry<=0 or atr is None or atr<0 or resistance is None:
        return None
    if o['target'] is None or o['stop'] is None or o['target']<=entry:
        return None
    xs=[o['target']/entry-1,o['stop']/entry-1,atr/entry,resistance/entry-1,math.log(31.)]
    return xs if all(math.isfinite(x) for x in xs) else None


def metrics(rows):
    known=[r for r in rows if r['label'] is not None]
    n=len(known)
    if not n:
        return dict(events=len(rows),known=0)
    avg=lambda values: math.fsum(values)/n
    model_brier=avg((r['probability']-int(r['label']))**2 for r in known)
    base_brier=avg((r['baseline_probability']-int(r['label']))**2 for r in known)
    def log_loss(field):
        return avg(-math.log(max(1e-12,min(1-1e-12,r[field] if r['label'] else 1-r[field]))) for r in known)
    bins=[]
    for index in range(10):
        selected=[r for r in known if r['probability']>=index/10 and
                  (r['probability']<(index+1)/10 if index<9 else r['probability']<=1)]
        if selected:
            bins.append(dict(lower=index/10,upper=(index+1)/10,n=len(selected),
                mean_probability=st.fmean(r['probability'] for r in selected),
                hit_rate=st.fmean(int(r['label']) for r in selected)))
    return dict(events=len(rows),known=n,unknown=len(rows)-n,
                distinct_entry_dates=len({r['entry'] for r in known}),
                hit_rate=avg(int(r['label']) for r in known),
                mean_probability=avg(r['probability'] for r in known),
                model_brier=model_brier,baseline_brier=base_brier,
                brier_improvement=base_brier-model_brier,
                model_log_loss=log_loss('probability'),baseline_log_loss=log_loss('baseline_probability'),
                reliability=bins)


def main():
    output=HERE/'forecast-verification.json'
    if output.exists():
        raise FileExistsError(output)
    started=dt.datetime.now(dt.timezone.utc).isoformat()
    summary=json.loads((HERE/'forecast-summary.json').read_text())
    exit_summary=json.loads((HERE/'exit-summary.json').read_text())
    assert sha(HERE/'forecast-ledger.json.gz')==summary['ledger_sha256']
    assert sha(HERE/'exit-ledger.json.gz')==exit_summary['ledger_sha256']
    assert sha(PANEL)==PANEL_SHA
    for manifest in [summary,exit_summary]:
        for path,expected in manifest['hashes'].items():
            assert sha(ROOT/path)==expected,path
    data=json.loads(gzip.decompress((HERE/'exit-ledger.json.gz').read_bytes()))
    forecast_data=json.loads(gzip.decompress((HERE/'forecast-ledger.json.gz').read_bytes()))
    prices={}
    with gzip.open(PANEL,'rt') as f:
        for row in csv.DictReader(f):
            for name in ('open','high','low','close'):
                row[name]=float(row[name])
            k=(row['cohort_year']+':'+row['identity_segment_id'],row['date'])
            assert k not in prices
            prices[k]=row
    source_events=collections.defaultdict(list)
    source_lookup={}
    skipped=collections.Counter()
    raw_label_checks=0
    eval_keys=set()
    populations=collections.defaultdict(set)
    for c in data['cohorts']:
        if 2023<=c['year']<=2025:
            assert c['year']==int(c['signal'][:4])
            assert len(c['outcome_ids'])==len(set(c['outcome_ids']))
            populations[f"{c['view']}:{c['method']}"].update(c['outcome_ids'])
            eval_keys.update(c['outcome_ids'])
    populations['unique-events']=eval_keys
    for key,variants in sorted(data['outcomes'].items()):
        identity,signal,hold=json.loads(key)
        assert hold==30 and identity[:4]==signal[:4]
        atr,resistance,entry,path=raw_geometry(identity,signal,prices)
        for policy in POLICIES:
            o=variants[policy]
            expected_entry=(dt.date.fromisoformat(signal)+2*DAY).isoformat()
            expected_exit=(dt.date.fromisoformat(signal)+32*DAY).isoformat()
            assert o['level_source_date']==signal and o['entry_date']==expected_entry and o['hard_exit_date']==expected_exit
            for expected,actual in [(atr,o['atr_sma14']),(resistance,o['prior20_resistance']),(entry,o['entry_price'])]:
                if expected is None:
                    assert actual is None
                else:
                    near(expected,actual)
            # The execution ledger suppresses numerical levels when entry is missing.
            target=entry+3*atr if entry is not None and atr is not None else None
            stop=max(0.,entry-2*atr) if entry is not None and atr is not None else None
            if policy=='ResistanceSMAATR':
                if resistance is None:
                    target=None
                elif target is not None and resistance>entry:
                    target=min(target,resistance)
            for expected,actual in [(target,o['target']),(stop,o['stop'])]:
                if expected is None:
                    assert actual is None
                else:
                    near(expected,actual)
            if target is None:
                label=None
            else:
                # Use the saved level after independently checking raw arithmetic;
                # avoids turning floating-point equality into a new target policy.
                label=True if any(b['high']>=o['target'] for b in path if complete(b)) else False if all(complete(b) for b in path) else None
            assert o['target_reach'] is label
            raw_label_checks+=1
            xs=features(o)
            if xs is None:
                skipped[policy]+=1
                continue
            r=dict(key=key,policy=policy,signal=signal,entry=expected_entry,hard_exit=expected_exit,
                   features=xs,label=label,target=o['target'],stop=o['stop'],entry_price=entry)
            source_events[policy].append(r)
            source_lookup[policy,key]=r
    assert dict(skipped)==summary['skipped_features']
    fits={f['fit_id']:f for f in forecast_data['fits']}
    assert len(fits)==len(forecast_data['fits'])==summary['fits']
    forecasts={(f['policy'],f['key']):f for f in forecast_data['forecasts']}
    assert len(forecasts)==len(forecast_data['forecasts'])==summary['forecasts']
    expected_fits=set()
    expected_forecasts=set()
    expected_skips=[]
    fit_checks=[]
    max_probability_error=0.
    for policy,events in source_events.items():
        for month_index in range(37):
            year,month=2023+month_index//12,month_index%12+1
            cutoff=f'{year}-{month:02d}-01'
            tests=[r for r in events if r['entry'][:7]==cutoff[:7] and 2023<=int(r['signal'][:4])<=2025]
            if not tests:
                continue
            train=[r for r in events if r['hard_exit']<cutoff and r['label'] is not None]
            if len(train)<200 or len({r['label'] for r in train})<2:
                expected_skips.append(dict(policy=policy,cutoff=cutoff,training=len(train),events=len(tests)))
                continue
            fit_id=f'{policy}:{cutoff}'
            expected_fits.add(fit_id)
            fit=fits[fit_id]
            n=len(train)
            hits=sum(r['label'] for r in train)
            baseline=(hits+1)/(n+2)
            assert fit['policy']==policy and fit['cutoff']==cutoff
            assert fit['training_n']==n and fit['training_hits']==hits
            assert fit['distinct_training_signals']==len({r['signal'] for r in train})
            assert fit['latest_training_exit']==max(r['hard_exit'] for r in train)<cutoff
            near(fit['baseline_probability'],baseline)
            x=np.array([r['features'] for r in train],dtype=float)
            independent_means=np.mean(x,axis=0)
            independent_scales=np.std(x,axis=0,ddof=0)
            constant=np.all(x==x[0],axis=0)
            independent_scales[constant]=1.
            for expected,actual in zip(independent_means,fit['scaler_mean']):
                near(float(expected),actual)
            for expected,actual in zip(independent_scales,fit['scaler_scale']):
                near(float(expected),actual)
            assert fit['scaler_scale'][4]==1. and constant[4]
            coeff=np.array(fit['coefficients'])
            mean=np.array(fit['scaler_mean'])
            scale=np.array(fit['scaler_scale'])
            assert np.isfinite(coeff).all() and np.isfinite(mean).all() and np.isfinite(scale).all()
            assert (scale>0).all() and math.isfinite(fit['intercept'])
            max_constant_contribution=abs(float((math.log(31.)-mean[4])*coeff[4]))
            assert max_constant_contribution<1e-10
            # Stationarity of the independently reconstructed penalized logistic
            # objective checks saved coefficients against the actual training set.
            z=(x-mean)/scale
            train_p=np.array([sigmoid(float(v)) for v in z@coeff+fit['intercept']])
            residual=train_p-np.array([int(r['label']) for r in train])
            gradient=z.T@residual/n+coeff/n
            gradient_norm=max(float(np.max(np.abs(gradient))),abs(float(np.mean(residual))))
            assert gradient_norm<3e-4,(fit_id,gradient_norm)
            fit_checks.append(dict(fit_id=fit_id,training=n,hits=hits,
                latest_training_exit=fit['latest_training_exit'],max_objective_gradient=gradient_norm,
                constant_h_scale=fit['scaler_scale'][4],constant_h_coefficient=fit['coefficients'][4],
                max_constant_h_logit_contribution=max_constant_contribution))
            for r in tests:
                key=(policy,r['key'])
                expected_forecasts.add(key)
                f=forecasts[key]
                for field in r:
                    close_tree(r[field],f[field])
                assert f['fit_id']==fit_id and cutoff<=f['entry']
                probability=sigmoid(math.fsum((value-mu)/sd*c for value,mu,sd,c in
                                      zip(r['features'],mean,scale,coeff))+fit['intercept'])
                near(probability,f['probability'])
                max_probability_error=max(max_probability_error,abs(probability-f['probability']))
                near(baseline,f['baseline_probability'])
    assert expected_fits==fits.keys()
    assert expected_forecasts==forecasts.keys()
    assert expected_skips==summary['skipped_months']
    expected_metric_keys=set()
    metric_checks=0
    coverage=[]
    metric_lookup={(r['policy'],r['population'],r['period']):r for r in summary['summary']}
    assert len(metric_lookup)==len(summary['summary'])
    for policy in POLICIES:
        for population,keys in sorted(populations.items()):
            for period in ['2023-2025','2023','2024','2025']:
                chosen=keys if period=='2023-2025' else {key for key in keys if json.loads(key)[1].startswith(period)}
                rows=[forecasts[policy,key] for key in sorted(chosen) if (policy,key) in forecasts]
                expected=dict(policy=policy,population=population,period=period,**metrics(rows))
                metric_key=policy,population,period
                close_tree(expected,metric_lookup[metric_key])
                expected_metric_keys.add(metric_key)
                metric_checks+=1
                missing_features=sum((policy,key) not in source_lookup for key in chosen)
                missing_fit=sum((policy,key) in source_lookup and (policy,key) not in forecasts for key in chosen)
                assert len(chosen)==len(rows)+missing_features+missing_fit
                coverage.append(dict(policy=policy,population=population,period=period,
                    unique_selected_events=len(chosen),issued_forecasts=len(rows),
                    missing_features=missing_features,missing_monthly_fit=missing_fit,
                    unknown_outcome_labels=sum(r['label'] is None for r in rows),
                    distinct_entry_dates=len({r['entry'] for r in rows})))
    assert expected_metric_keys==metric_lookup.keys()
    final=dict(started_at_utc=started,completed_at_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        status='passed',hashes={str(p.relative_to(ROOT)):sha(p) for p in
            [Path(__file__),HERE/'forecasts.py',HERE/'forecast-protocol.md',HERE/'forecast-summary.json',
             HERE/'forecast-ledger.json.gz',HERE/'exit-summary.json',HERE/'exit-ledger.json.gz',PANEL]},
        counts=dict(raw_panel_rows=len(prices),raw_target_label_checks=raw_label_checks,
            fits=len(fits),forecasts=len(forecasts),population_period_metrics=metric_checks,
            late_2025_signals_entering_2026=sum(f['entry'].startswith('2026') for f in forecasts.values())),
        max_probability_error=max_probability_error,
        max_objective_gradient=max(f['max_objective_gradient'] for f in fit_checks),
        max_constant_h_logit_contribution=max(f['max_constant_h_logit_contribution'] for f in fit_checks),
        fit_checks=fit_checks,forecast_coverage=coverage,
        notes=['No strategy/forecast implementation modules imported; no model refit or parameter search.',
            'Every target label and source ATR/resistance/entry reconstructed from frozen raw panel.',
            'All 74 monthly training sets, scaler moments, probability arithmetic, baseline frequencies and model first-order stationarity checked.',
            'Coverage supplements original summary: unknown labels differ from missing forecasts.',
            'Constant H feature has scale 1 and negligible fitted logit contribution; the reported sklearn sqrt warning does not propagate nonfinite values.',
            'Population metrics are separately deduplicated; shared dates, identities and overlapping horizons are not independent trials.'])
    with output.open('x') as f:
        json.dump(final,f,indent=2,allow_nan=False)
        f.write('\n')
    print(json.dumps({k:final[k] for k in ['status','counts','max_probability_error','max_objective_gradient','max_constant_h_logit_contribution']}))


if __name__=='__main__':
    main()
