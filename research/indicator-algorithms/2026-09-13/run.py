"""Frozen indicator comparison over the existing identity-preserving venue panel."""
import collections
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import statistics as st
import sys

import numpy as np
import talib

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / 'research/holding-horizons'
spec = importlib.util.spec_from_file_location('frozen_horizons', SOURCE / 'run.py')
hh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hh)
hf = hh.hf
DAY = dt.timedelta(days=1)
METHODS = ('Momentum', 'TrendQuality', 'ATRNormalizedMomentum', 'EMAConfirmedMomentum', 'Breakout', 'VolumeBreakout')
SCENARIOS = ('net_zero', 'net_loss', 'net100_zero', 'net100_loss')


def score(bars, index, view):
    assert hf.is_eligible(bars, index) and hf.consecutive_through(bars, index, view)
    window = bars[index-max(60, view)+1:index+1]
    closes = np.array([b.close for b in window], dtype=float)
    highs = np.array([b.high for b in window], dtype=float)
    lows = np.array([b.low for b in window], dtype=float)
    momentum, quality = hh.score(bars, index, view)
    atr = float(talib.ATR(highs, lows, closes, timeperiod=14)[-1])
    fast_period = max(2, (view+1)//3)
    fast = float(talib.EMA(closes, timeperiod=fast_period)[-1])
    slow = float(talib.EMA(closes, timeperiod=view)[-1])
    prior_high = max(b.high for b in bars[index-view+1:index])
    breakout = math.log(bars[index].close/prior_high)
    volume_reference = st.median(b.quote_volume for b in bars[index-20:index])
    values = dict(Momentum=momentum, TrendQuality=quality,
        ATRNormalizedMomentum=momentum/(atr/closes[-1]) if momentum is not None and atr>0 else None,
        EMAConfirmedMomentum=momentum if fast>slow else None,
        Breakout=breakout if breakout>0 else None,
        VolumeBreakout=breakout if breakout>0 and bars[index].quote_volume>=1.5*volume_reference else None)
    assert all(v is None or (math.isfinite(v) and v>0) for v in values.values())
    return values


def selftest():
    hh.selftest()
    start = dt.date(2020, 1, 1)
    bars = [hf.Bar(symbol='X', date=start+i*DAY, open=100+i, close=100+i,
        high=100+i, low=99+i, quote_volume=1e7 if i<99 else 1.5e7,
        cohort_member=True) for i in range(100)]
    before = score(bars, 99, 7)
    assert before['Breakout'] is not None and before['VolumeBreakout'] == before['Breakout']
    from dataclasses import replace
    bars[-1] = replace(bars[-1], high=1000000.)
    assert score(bars, 99, 7)['Breakout'] == before['Breakout']
    bars[-1] = replace(bars[-1], quote_volume=1.5e7-1)
    assert score(bars, 99, 7)['VolumeBreakout'] is None
    before = score(bars, 99, 7)
    bars.append(replace(bars[-1], date=bars[-1].date+DAY, close=1.))
    assert score(bars, 99, 7) == before
    prices = np.array([100.+i+(i%5) for i in range(100)])
    highs, lows = prices+2, prices-3
    tr = [max(highs[i]-lows[i], abs(highs[i]-prices[i-1]), abs(lows[i]-prices[i-1])) for i in range(1,len(prices))]
    atr = st.mean(tr[:14])
    for value in tr[14:]:
        atr = (atr*13+value)/14
    assert math.isclose(atr, float(talib.ATR(highs,lows,prices,14)[-1]), rel_tol=1e-12)
    for period in (2,7,30,90):
        ema = float(np.mean(prices[:period]))
        for value in prices[period:]:
            ema += 2/(period+1)*(value-ema)
        assert math.isclose(ema, float(talib.EMA(prices,period)[-1]), rel_tol=1e-12)


def summarize(cohorts, outcomes):
    groups = collections.defaultdict(list)
    lookup = {(r['signal'],r['view'],r['holding'],r['method']):r for r in cohorts}
    for r in cohorts:
        half = '2020-2022' if r['year']<=2022 else '2023-2025'
        periods = ['all',str(r['year']),half]
        if r['anchor']<=2:
            periods += ['common-year-start','common-year-start-'+half]
        for p in periods:
            groups[r['view'],r['holding'],r['method'],p].append(r)
    rows = []
    for (view,hold,method,period), rs in sorted(groups.items()):
        ps = [outcomes[k] for r in rs for k in r['outcome_ids']]
        paired = {s:[r[s]-lookup[r['signal'],view,hold,'Momentum'][s] for r in rs] for s in SCENARIOS}
        known = [p['known_net'] for p in ps if p['known_net'] is not None]
        ds = paired['net_zero']
        rows.append(dict(view=view,holding=hold,method=method,period=period,cohorts=len(rs),
            slots=sum(r['denominator'] for r in rs),selected=len(ps),
            means={s:st.mean(r[s] for r in rs) for s in SCENARIOS},
            paired_deltas={s:st.mean(paired[s]) for s in SCENARIOS},
            paired_wins=sum(x>0 for x in ds),paired_losses=sum(x<0 for x in ds),
            median_paired_delta=st.median(ds),
            without_best_paired_date=(sum(ds)-max(ds))/(len(ds)-1) if len(ds)>1 else None,
            mean_excess_zero=st.mean(r['excess_zero'] for r in rs),
            mean_excess_loss=st.mean(r['excess_loss'] for r in rs),
            known=len(known),positive_known=sum(x>0 for x in known),losing_known=sum(x<0 for x in known),
            realized_20pct_hits=sum(x>=.2 for x in known),observed_20pct_hits=sum(p['hit'] for p in ps),
            unknown_paths=sum(p['unknown_path'] for p in ps),
            entry_missing=sum(p['entry_missing'] for p in ps),exit_missing=sum(p['exit_missing'] for p in ps),
            median_known_net=st.median(known) if known else None,
            mean_mfe_complete=hh.average([p['mfe'] for p in ps if p['mfe'] is not None]),
            mean_mae_complete=hh.average([p['mae'] for p in ps if p['mae'] is not None])))
    return rows


def main():
    selftest()
    if '--selftest' in sys.argv:
        print('Indicator recurrence, signal exclusion, volume boundary, future invariance and execution tests passed')
        return
    for name in ['summary.json','ledger.json.gz']:
        if (HERE/name).exists():
            raise FileExistsError(name)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    native_raw = (SOURCE/'cohorts.json.gz').read_bytes()
    native_summary = json.loads((SOURCE/'summary.json').read_text())
    assert hashlib.sha256(native_raw).hexdigest() == native_summary['ledger_sha256']
    for name,path in [('run.py',SOURCE/'run.py'),('high-flier-runner.py',hh.SOURCE)]:
        assert hashlib.sha256(path.read_bytes()).hexdigest() == native_summary['hashes'][name]
    native = {(r['signal'],r['view'],r['holding'],r['method']):r for r in json.loads(gzip.decompress(native_raw))}
    _,_,membership,raw,provenance = hf.load_frozen_dataset(hh.SOURCE.parent/'high-flier-data/final')
    panel = hf.read_panel_csv(raw,hf.read_membership_csv(membership))
    positions,by_date = hf.panel_indexes(panel)
    years = collections.defaultdict(list)
    for key,bars in panel.items():
        years[bars[0].cohort_year].append(key)
    outcomes = {}

    def outcome(identity,signal,hold):
        key = json.dumps([identity,signal.isoformat(),hold],separators=(',',':'))
        if key not in outcomes:
            ps = hh.grade(by_date[identity],signal,hold)
            entry_date = signal+2*DAY
            exit_date = entry_date+hold*DAY
            entry,exit_bar = by_date[identity].get(entry_date),by_date[identity].get(exit_date)
            ep = entry.open if entry is not None and hf.bar_open_is_executable(entry) else None
            xp = exit_bar.open if exit_bar is not None and hf.bar_open_is_executable(exit_bar) else None
            gross = xp/ep-1 if ep is not None and xp is not None else None
            stress = {f'net100_{mark}': 0. if ep is None else hf.net_return_from_gross(gross if gross is not None else fallback,100)
                      for mark,fallback in [('zero',0.),('loss',-1.)]}
            outcomes[key] = dict(id=identity,symbol=panel[identity][0].symbol,entry_date=entry_date.isoformat(),
                exit_date=exit_date.isoformat(),entry_price=ep,exit_price=xp,**ps,**stress)
        return key

    cohorts,scores,skips = [],[],[]
    parity = 0
    for year in range(2020,2026):
        for anchor in range(12):
            signal = dt.date(year,1,1)+28*anchor*DAY
            for view in hh.VIEWS:
                eligible,values = [],{m:{} for m in METHODS}
                for key in sorted(years[year]):
                    idx = positions[key].get(signal)
                    if idx is None or not hf.is_eligible(panel[key],idx) or not hf.consecutive_through(panel[key],idx,view):
                        continue
                    eligible.append(key)
                    for method,value in score(panel[key],idx,view).items():
                        values[method][key] = value
                if not eligible:
                    skips.append(dict(year=year,anchor=anchor,view=view,reason='no formation-eligible instruments'))
                    continue
                selected = {m:sorted((k for k,v in vs.items() if v is not None),key=lambda k:(-vs[k],k))[:10] for m,vs in values.items()}
                selected['Universe'] = eligible
                scores.append(dict(year=year,anchor=anchor,signal=signal.isoformat(),view=view,eligible=eligible,methods=values,selections=selected))
                for hold in hh.HOLDINGS:
                    if hold==365 and anchor>2:
                        continue
                    universe = [outcomes[k] for k in [outcome(identity,signal,hold) for identity in eligible]]
                    baseline = {s:st.mean(p[s] for p in universe) for s in SCENARIOS}
                    for method,keys in selected.items():
                        denominator = len(eligible) if method=='Universe' else 10
                        ids = [outcome(k,signal,hold) for k in keys]
                        means = {s:sum(outcomes[k][s] for k in ids)/denominator for s in SCENARIOS}
                        r = dict(year=year,anchor=anchor,signal=signal.isoformat(),view=view,holding=hold,
                            method=method,denominator=denominator,eligible=len(eligible),outcome_ids=ids,**means,
                            excess_zero=means['net_zero']-baseline['net_zero'],excess_loss=means['net_loss']-baseline['net_loss'])
                        if method in ('Momentum','TrendQuality','Universe'):
                            old = native[signal.isoformat(),view,hold,method]
                            for field in old:
                                if field=='positions':
                                    assert [{f:outcomes[k][f] for f in p} for k,p in zip(ids,old[field])] == old[field]
                                    assert len(ids)==len(old[field])
                                else:
                                    assert r[field]==old[field],(field,r[field],old[field])
                            parity += 1
                        cohorts.append(r)
        print('Completed',year,flush=True)
    assert parity==len(native)
    payload = dict(scores=scores,outcomes=outcomes,cohorts=cohorts)
    compressed = gzip.compress(json.dumps(payload,separators=(',',':'),allow_nan=False).encode(),mtime=0)
    summary = dict(started_at_utc=started,completed_at_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        runner_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        protocol_sha256=hashlib.sha256((HERE/'protocol.md').read_bytes()).hexdigest(),
        native_ledger_sha256=native_summary['ledger_sha256'],ledger_sha256=hashlib.sha256(compressed).hexdigest(),
        provenance=provenance,packages=dict(talib=talib.__version__,numpy=np.__version__),
        native_parity_cohorts=parity,unique_outcomes=len(outcomes),score_cohorts=len(scores),
        cohorts=len(cohorts),skips=skips,summary=summarize(cohorts,outcomes))
    with (HERE/'ledger.json.gz').open('xb') as f:
        f.write(compressed)
    with (HERE/'summary.json').open('x') as f:
        json.dump(summary,f,indent=2,allow_nan=False)
        f.write('\n')
    print(json.dumps({k:v for k,v in summary.items() if k not in ('summary','provenance','skips')}))


if __name__=='__main__':
    main()
