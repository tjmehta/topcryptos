"""Reusable research ranking and entry-time target outlook; no network or trading."""
import argparse
import datetime as dt
import functools
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
METHODS = ('Momentum', 'Breakout', 'VolumeBreakout')
VIEWS = (3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90)
DAY = dt.timedelta(days=1)


def read_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@functools.cache
def helpers():
    indicator_path = ROOT/'research/indicator-algorithms/2026-09-13/run.py'
    exit_path = ROOT/'research/sell-zones/2026-09-13/run.py'
    forecast_path = ROOT/'research/sell-zone-forecast/2026-09-13/run.py'
    holding_path = ROOT/'research/holding-horizons/run.py'
    panel_helper = ROOT/'research/algorithm-comparison/high-flier-runner.py'
    holding_summary = json.loads((holding_path.parent/'summary.json').read_text())
    for path in [holding_path,panel_helper]:
        if hashlib.sha256(path.read_bytes()).hexdigest()!=holding_summary['hashes'][path.name]:
            raise ValueError(f'Frozen transitive helper hash mismatch: {path}')
    for path in [indicator_path, exit_path, forecast_path]:
        summary = json.loads((path.parent/'summary.json').read_text())
        expected = (summary['hashes'][str(path.relative_to(ROOT))] if path==exit_path
                    else summary['runner_sha256'])
        if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
            raise ValueError(f'Frozen helper hash mismatch: {path}')
    return (read_module('outlook_indicator',indicator_path),
            read_module('outlook_exits',exit_path),
            read_module('outlook_forecast',forecast_path))


def number(value, name, positive=False):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):
        raise ValueError(f'{name} must be a finite number')
    if (positive and value<=0) or (not positive and value<0):
        raise ValueError(f'{name} must be {"positive" if positive else "nonnegative"}')
    return float(value)


def date(value, name):
    if not isinstance(value,str):
        raise ValueError(f'{name} must be a YYYY-MM-DD UTC date')
    parsed = dt.date.fromisoformat(value)
    if parsed.isoformat()!=value:
        raise ValueError(f'{name} must be a YYYY-MM-DD UTC date')
    return parsed


def window(request):
    if request.get('interval_unit','day')!='day':
        raise ValueError('This research model accepts daily bars only')
    view = request['view_observations']
    if type(view) is not int or view not in VIEWS:
        raise ValueError(f'view_observations must be one of {VIEWS}')
    signal = date(request['signal_date'],'signal_date')
    return view,signal


def formation(request):
    view,signal = window(request)
    identity = request['instrument_key']
    if not isinstance(identity,str) or not identity.startswith(f'{signal.year}:'):
        raise ValueError('instrument_key must retain its signal-year cohort prefix')
    member = request['cohort_member']
    if type(member) is not bool:
        raise ValueError('cohort_member must be an explicit boolean')
    records = request['bars']
    if not isinstance(records,list):
        raise ValueError('bars must be a list')
    ia,_,_ = helpers()
    bars = []
    seen = set()
    for row in records:
        day = date(row['date'],'bar date')
        if day>signal:
            continue  # A historical replay may provide later bars; never read their prices.
        if day in seen:
            raise ValueError('Duplicate historical dates are not accepted')
        seen.add(day)
        if row.get('instrument_key')!=identity:
            raise ValueError('History must preserve one annual instrument identity')
        if row.get('bar_status')!='complete':
            raise ValueError('Supply complete daily bars; do not fill gaps with synthetic prices')
        op,hi,lo,cl = [number(row[k],k,True) for k in ('open','high','low','close')]
        if lo>min(op,cl) or hi<max(op,cl) or lo>hi:
            raise ValueError('OHLC prices are inconsistent')
        bars.append(ia.hf.Bar(symbol=request.get('symbol',identity),date=day,
            open=op,high=hi,low=lo,close=cl,quote_volume=number(row['quote_volume'],'quote_volume'),
            cohort_member=member))
    bars.sort(key=lambda b:b.date)
    eligible = bool(bars and bars[-1].date==signal and ia.hf.is_eligible(bars,len(bars)-1)
                    and ia.hf.consecutive_through(bars,len(bars)-1,view))
    all_scores = ia.score(bars,len(bars)-1,view) if eligible else {}
    scores = {m:all_scores.get(m) for m in METHODS}
    return dict(identity=identity,signal=signal,view=view,bars=bars,eligible=eligible,scores=scores)


def rank(request):
    view,signal = window(request)
    method = request.get('algorithm','Breakout')
    if method not in METHODS:
        raise ValueError(f'algorithm must be one of {METHODS}')
    if not isinstance(request['instruments'],list):
        raise ValueError('instruments must be a list')
    rows,identities = [],set()
    for instrument in request['instruments']:
        # The outer call owns the comparison date and window for every instrument.
        f = formation({**instrument,**{k:request[k] for k in ['signal_date','view_observations']},
                       'interval_unit':request.get('interval_unit','day')})
        if f['identity'] in identities:
            raise ValueError('Each instrument identity must occur once in a ranking universe')
        identities.add(f['identity'])
        rows.append(dict(instrument_key=f['identity'],eligible=f['eligible'],score=f['scores'][method]))
    selected = sorted((r for r in rows if r['score'] is not None),key=lambda r:(-r['score'],r['instrument_key']))[:10]
    return dict(status='research-ranking',algorithm=method,signal_date=signal.isoformat(),
        view_observations=view,formation_elapsed_days=view-1,
        selected=selected,unallocated_slots=10-len(selected),allocation_per_selected=0.1,
        universe_assessments=rows,
        scope='Ranks supplied annual-cohort universe only; does not verify provider membership or place orders')


def load_bundle(path=HERE/'model-bundle.json'):
    raw = Path(path).read_bytes()
    manifest = json.loads(Path(path).with_name('bundle-manifest.json').read_text())
    if hashlib.sha256(raw).hexdigest()!=manifest['bundle_sha256']:
        raise ValueError('Model bundle hash mismatch')
    bundle = json.loads(raw)
    if bundle['schema_version']!=1 or bundle['hold_days']!=30:
        raise ValueError('Unsupported model bundle schema or horizon')
    seen = set()
    for fit in bundle['fits']:
        cutoff = date(fit['cutoff'],'model cutoff')
        if cutoff.day!=1 or date(fit['latest_training_exit'],'training exit')>=cutoff:
            raise ValueError('Model training dates violate full-horizon maturity')
        if fit['fit_id'] in seen:
            raise ValueError('Duplicate model fit identity')
        seen.add(fit['fit_id'])
        for field in ['scaler_mean','scaler_scale','coefficients']:
            if len(fit[field])!=5 or not all(math.isfinite(x) for x in fit[field]):
                raise ValueError('Invalid model coefficients or scaler')
        if not all(x>0 for x in fit['scaler_scale']) or not math.isfinite(fit['intercept']):
            raise ValueError('Invalid model scale or intercept')
    return bundle


def probability(features, fit):
    z = fit['intercept']+sum((x-m)/s*c for x,m,s,c in zip(features,fit['scaler_mean'],fit['scaler_scale'],fit['coefficients']))
    if not math.isfinite(z):
        raise ValueError('Features exceed the model numerical range')
    return 1/(1+math.exp(-z)) if z>=0 else math.exp(z)/(1+math.exp(z))


def outlook(request,bundle):
    hold = request.get('hold_days',30)
    if type(hold) is not int:
        raise ValueError('hold_days must be an integer')
    if hold!=30:
        return dict(status='unsupported-horizon',requested_hold_days=request['hold_days'],
                    target_probability=None,reason='This daily-entry model was validated for H30 only')
    f = formation(request)
    method = request.get('algorithm','Breakout')
    if method not in METHODS:
        raise ValueError(f'algorithm must be one of {METHODS}')
    entry_date = date(request['entry_date'],'entry_date')
    if entry_date!=f['signal']+2*DAY:
        raise ValueError('The validated entry date is signal date + 2 days')
    entry = number(request['entry_price'],'entry_price',True)
    result = dict(status='research-outlook',instrument_key=f['identity'],algorithm=method,
        signal_date=f['signal'].isoformat(),entry_date=entry_date.isoformat(),entry_price=entry,
        view_observations=f['view'],formation_elapsed_days=f['view']-1,holding_days=30,
        hard_exit_date=(entry_date+30*DAY).isoformat(),eligible=f['eligible'],ranking_scores=f['scores'],
        qualifies_for_algorithm=f['scores'][method] is not None,
        selection_scope='Single-instrument outlook; top-ten membership requires the rank command',
        bundle_provenance=bundle['source'],zones=[],
        sell_plan=dict(type='research-candidate' if f['view']==7 and method=='Breakout' else 'evaluated-reference-only',days_after_entry=30,
            automatic_level_exit=False,
            evidence='Seven-view breakout favored H30 over these brackets; this does not establish a universal interval mapping'))
    if not f['eligible']:
        result.update(status='ineligible-history-or-liquidity',target_probability=None)
        return result
    if f['scores'][method] is None:
        result.update(status='no-qualifying-signal',target_probability=None)
        return result
    _,sz,ff = helpers()
    atr,resistance = sz.levels(f['bars'],f['signal'])
    cutoff = entry_date.replace(day=1).isoformat()
    for policy in ff.POLICIES:
        target,stop = entry+3*atr,max(0.,entry-2*atr)
        if policy=='ResistanceSMAATR' and resistance>entry:
            target = min(target,resistance)
        geometry = dict(entry_price=entry,atr_sma14=atr,prior20_resistance=resistance,target=target,stop=stop)
        xs = ff.features(geometry,30)
        fit = next((r for r in bundle['fits'] if r['policy']==policy and r['cutoff']==cutoff),None)
        model_ok = fit is not None and xs is not None
        metric = next((r for r in bundle['metrics'] if r['policy']==policy and
                       r['population']==f'{f["view"]}:{method}' and r['period']=='2023-2025'),None)
        result['zones'].append(dict(policy=policy,level_source_date=f['signal'].isoformat(),**geometry,
            target_return=target/entry-1,stop_return=stop/entry-1,
            probability=probability(xs,fit) if model_ok else None,
            model_status='available' if model_ok else 'no-exact-month-model' if fit is None else 'unusable-geometry',
            fit_id=fit['fit_id'] if fit is not None else None,
            model_cutoff=fit['cutoff'] if fit is not None else None,
            latest_training_exit=fit['latest_training_exit'] if fit is not None else None,
            training_events=fit['training_n'] if fit is not None else None,
            historical_rate=fit['baseline_probability'] if fit is not None else None,
            event='Daily high reaches target before hard exit, including paths that stopped or sold earlier',
            retrospective_validation=dict(
                availability='Post-study evidence for 2023–2025 signals; not an input available at historical entry',
                metrics=metric),
            execution='A tested close-confirmed trigger fills at open two days later, never automatically at target price'))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['rank','outlook'])
    parser.add_argument('--input',type=Path,help='JSON request; stdin when omitted')
    parser.add_argument('--bundle',type=Path,default=HERE/'model-bundle.json')
    args = parser.parse_args()
    try:
        request = json.loads(args.input.read_text() if args.input else sys.stdin.read())
        result = rank(request) if args.command=='rank' else outlook(request,load_bundle(args.bundle))
        print(json.dumps(result,indent=2,allow_nan=False))
    except (ValueError,KeyError,TypeError) as exc:
        parser.exit(2,f'Invalid research input: {exc}\n')


if __name__=='__main__':
    main()
