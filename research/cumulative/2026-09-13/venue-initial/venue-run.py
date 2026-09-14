"""Frozen within-window cumulative/H50-50 venue experiment; see venue-protocol."""
import bisect
import collections
import datetime as dt
import gzip
import hashlib
import importlib.util
import io
import json
import math
from pathlib import Path
import statistics as st
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
SOURCE=ROOT/'research/daily-breakouts/2026-09-13'
DAY=dt.timedelta(days=1)
METHODS=('Momentum','Breakout','Cumulative','Hybrid')
NEW=('Cumulative','Hybrid')
MARKS=('net_zero','net_loss','net100_zero','net100_loss')


def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);sys.modules[name]=value;spec.loader.exec_module(value)
    return value


def cumulative(prices,times):
    assert len(prices)==len(times)>=2 and all(t>s for s,t in zip(times,times[1:]))
    ys=[math.log(p)-math.log(prices[0]) for p in prices]
    return math.fsum((b-a)*(x+y)/2 for a,b,x,y in zip(times,times[1:],ys,ys[1:]))/(times[-1]-times[0])


def signed(values):
    positive=sorted(v for v in values.values() if v>0)
    negative=sorted(-v for v in values.values() if v<0)
    result={}
    for key,value in values.items():
        if not value: result[key]=0.;continue
        pool=positive if value>0 else negative
        magnitude=abs(value)
        below=bisect.bisect_left(pool,magnitude)
        equal=bisect.bisect_right(pool,magnitude)-below
        result[key]=(below+.5*equal)/len(pool)*(1 if value>0 else -1)
    return result


def selftest():
    assert cumulative([100,100,100],[0,1,2])==0
    early=cumulative([100,150,110],[0,1,2]);late=cumulative([100,100,110],[0,1,2])
    assert early>late>0
    assert cumulative([100,200,90],[0,1,2])>0  # Endpoint loser can qualify.
    assert math.isclose(cumulative([100,200,200],[0,1,4]),math.log(2)*3.5/4)
    prices=[100,150,110]
    original=cumulative(prices,[0,1,2]);prices.append(1e9)
    assert cumulative(prices[:3],[0,1,2])==original
    assert signed(dict(a=1,b=1,c=3,d=-1,e=-3,f=0))==dict(a=1/3,b=1/3,c=5/6,d=-.25,e=-.75,f=0.)


def write_gzip(path,data):
    with path.open('xb') as raw:
        with gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as compressed:
            with io.TextIOWrapper(compressed,encoding='utf8') as text:
                json.dump(data,text,separators=(',',':'),allow_nan=False)


def stats(values):
    return dict(mean=st.mean(values),median=st.median(values),minimum=min(values),maximum=max(values),
        wins=sum(x>0 for x in values),losses=sum(x<0 for x in values),ties=sum(x==0 for x in values),
        mean_without_best=(sum(values)-max(values))/(len(values)-1) if len(values)>1 else None)


def metrics(keys,outcomes):
    ps=[outcomes[k] for k in keys];known=[p['known_net'] for p in ps if p['known_net'] is not None]
    return dict(selected=len(ps),entry_missing=sum(p['entry_missing'] for p in ps),exit_missing=sum(p['exit_missing'] for p in ps),
        unknown_paths=sum(p['unknown_path'] for p in ps),observed_20pct_hits=sum(p['hit'] for p in ps),
        realized_20pct_hits=sum(x>=.2 for x in known),known=len(known),losing_known=sum(x<0 for x in known))


def summaries(cohorts,outcomes,matched):
    lookup={(r['signal'],r['view'],r['method']):r for r in cohorts}
    groups=collections.defaultdict(list)
    for r in cohorts:
        for period in ['all',str(r['year']),'2020-2022' if r['year']<2023 else '2023-2025']:
            groups[r['view'],r['method'],period].append(r)
    rows=[]
    for (view,method,period),rs in sorted(groups.items()):
        comparisons={}
        for baseline in ['Momentum','Breakout']+(['MatchedSignedMomentum'] if method in NEW else []):
            pairs=[]
            for r in rs:
                b=matched[r['signal'],view,method] if baseline=='MatchedSignedMomentum' else lookup[r['signal'],view,baseline]
                pairs.append((r,b))
            comparisons[baseline]=dict(scenarios={s:stats([a[s]-b[s] for a,b in pairs]) for s in MARKS},
                baseline_metrics=metrics([k for _,b in pairs for k in b['outcome_ids']],outcomes))
        rows.append(dict(view=view,method=method,holding=30,period=period,cohorts=len(rs),slots=10*len(rs),
            means={s:st.mean(r[s] for r in rs) for s in MARKS},
            metrics=metrics([k for r in rs for k in r['outcome_ids']],outcomes),comparisons=comparisons))
    return rows


def independent_replay(schedule,returns,actual):
    ds=[d for d in schedule if d['status']!='missing-formation']
    rs=[returns(d) for d in ds]
    assert len(actual['checkpoints'])==len(ds)
    peak=1.;worst=0.;annual=collections.defaultdict(list)
    for i,(d,r,c) in enumerate(zip(ds,rs,actual['checkpoints'])):
        wealth=math.prod(1+x for x in rs[:i+1]);peak=max(peak,wealth);dd=wealth/peak-1;worst=min(worst,dd)
        day=d['hard_exit_date'] if d['filled'] else d['knowledge_date']
        assert c['signal']==d['signal'] and c['checkpoint_date']==day
        assert math.isclose(c['wealth'],wealth,rel_tol=1e-11,abs_tol=1e-12)
        assert math.isclose(c['net_return'],r,rel_tol=1e-11,abs_tol=1e-12)
        assert math.isclose(c['drawdown'],dd,rel_tol=1e-11,abs_tol=1e-12)
        annual[day[:4]].append(1+r)
    assert math.isclose(actual['terminal_wealth'],math.prod(1+r for r in rs),rel_tol=1e-11,abs_tol=1e-12)
    assert math.isclose(actual['exit_checkpoint_drawdown'],worst,rel_tol=1e-11,abs_tol=1e-12)
    assert actual['annual_exit_returns'].keys()==annual.keys()
    for year,factors in annual.items(): assert math.isclose(actual['annual_exit_returns'][year],math.prod(factors)-1,rel_tol=1e-11,abs_tol=1e-12)
    best=rs.index(max(rs)) if rs else None
    assert actual['best_batch_signal']==(ds[best]['signal'] if best is not None else None)
    assert actual['best_batch_return']==(rs[best] if best is not None else None)
    assert math.isclose(actual['without_best_batch_wealth'],math.prod(1+r for i,r in enumerate(rs) if i!=best),rel_tol=1e-11,abs_tol=1e-12)


def capital_summaries(paths):
    lookup={(p['view'],p['method'],p['offset']):p for p in paths}
    groups=collections.defaultdict(list)
    for p in paths: groups[p['view'],p['method']].append(p)
    result=[]
    for (view,method),ps in sorted(groups.items()):
        assert sorted(p['offset'] for p in ps)==list(range(32))
        comparisons={}
        for baseline in ['Momentum','Breakout']+(['MatchedSignedMomentum'] if method in NEW else []):
            pairs=[(p['scenarios'],p['matched_scenarios'] if baseline=='MatchedSignedMomentum' else lookup[view,baseline,p['offset']]['scenarios']) for p in ps]
            supported=[(a,b) for a,b in pairs if b is not None]
            comparisons[baseline]=dict(supported_phases=len(supported),scenarios={s:dict(
                paired_wealth=stats([a[s]['terminal_wealth']-b[s]['terminal_wealth'] for a,b in supported]),
                paired_without_best=stats([a[s]['without_best_batch_wealth']-b[s]['without_best_batch_wealth'] for a,b in supported]),
                annual_paired={y:stats([a[s]['annual_exit_returns'].get(y,0)-b[s]['annual_exit_returns'].get(y,0) for a,b in supported])
                              for y in sorted({y for a,b in supported for x in [a,b] for y in x[s]['annual_exit_returns']})})
                for s in MARKS} if supported else {})
        result.append(dict(view=view,method=method,scheduler='responsive',phases=32,
            scenarios={s:dict(wealth=stats([p['scenarios'][s]['terminal_wealth'] for p in ps]),
                profitable_phases=sum(p['scenarios'][s]['terminal_wealth']>1 for p in ps),
                worst_checkpoint_drawdown=min(p['scenarios'][s]['exit_checkpoint_drawdown'] for p in ps),
                without_best=stats([p['scenarios'][s]['without_best_batch_wealth'] for p in ps])) for s in MARKS},comparisons=comparisons))
    return result


def main():
    selftest()
    if '--selftest' in sys.argv: print('Cumulative scalar, time weighting, sign/tie and prefix tests passed');return
    for filename in ['venue-ledger.json.gz','venue-summary.json','venue-capital.json.gz']:
        if (HERE/filename).exists(): raise FileExistsError(filename)
    started=dt.datetime.now(dt.timezone.utc).isoformat()
    source_summary=json.loads((SOURCE/'summary.json').read_text())
    cap_summary=json.loads((SOURCE/'capital-summary.json').read_text())
    paths=[Path(__file__),HERE/'venue-protocol.md',SOURCE/'run.py',SOURCE/'ledger.json.gz',SOURCE/'summary.json',
        SOURCE/'capital.py',SOURCE/'capital-summary.json',SOURCE/'capital-ledger.json.gz',
        ROOT/'research/holding-horizons/run.py',ROOT/'research/algorithm-comparison/high-flier-runner.py']
    hashes={str(p.relative_to(ROOT)):digest(p) for p in paths}
    assert digest(SOURCE/'ledger.json.gz')==source_summary['ledger_sha256']
    assert digest(SOURCE/'capital-ledger.json.gz')==cap_summary['ledger_sha256']
    assert digest(SOURCE/'capital.py')==cap_summary['hashes']['capital.py']
    for path,expected in source_summary['hashes'].items(): assert digest(ROOT/path)==expected,path
    horizon_summary=json.loads((ROOT/'research/holding-horizons/summary.json').read_text())
    for name in ['run.py','high-flier-runner.py']:
        path=ROOT/'research/holding-horizons/run.py' if name=='run.py' else ROOT/'research/algorithm-comparison/high-flier-runner.py'
        assert digest(path)==horizon_summary['hashes'][name]
    daily=module('cumulative_daily',SOURCE/'run.py');cp=module('cumulative_capital',SOURCE/'capital.py')
    hh,hf=daily.hh,daily.hf
    hh.selftest();cp.selftest()
    source=json.load(gzip.open(SOURCE/'ledger.json.gz','rt'))
    _,_,members,raw,provenance=hf.load_frozen_dataset(ROOT/'research/algorithm-comparison/high-flier-data/final')
    panel=hf.read_panel_csv(raw,hf.read_membership_csv(members));positions,by_date=hf.panel_indexes(panel)
    logs={key:[math.log(b.close) for b in bars] for key,bars in panel.items()}
    outcomes=dict(source['outcomes'])
    new_outcomes=0
    def outcome(identity,signal):
        nonlocal new_outcomes
        key=json.dumps([identity,signal.isoformat(),30],separators=(',',':'))
        if key not in outcomes:
            p=hh.grade(by_date[identity],signal,30);entryday=signal+2*DAY;exitday=signal+32*DAY
            entry=by_date[identity].get(entryday);exit=by_date[identity].get(exitday)
            ep=entry.open if entry is not None and hf.bar_open_is_executable(entry) else None
            xp=exit.open if exit is not None and hf.bar_open_is_executable(exit) else None
            gross=xp/ep-1 if ep is not None and xp is not None else None
            stress={f'net100_{mark}':0. if ep is None else hf.net_return_from_gross(gross if gross is not None else fallback,100)
                    for mark,fallback in [('zero',0.),('loss',-1.)]}
            outcomes[key]=dict(id=identity,symbol=panel[identity][0].symbol,entry_date=entryday.isoformat(),exit_date=exitday.isoformat(),
                              entry_price=ep,exit_price=xp,**p,**stress)
            new_outcomes+=1
        return key
    original_cohorts={(c['signal'],c['view'],c['method']):c for c in source['cohorts']}
    cohorts=[r for r in source['cohorts'] if r['method'] in ['Momentum','Breakout']]
    formations=[];matched={};eligible_checks=scalar_checks=baseline_scores=oversubscribed=0
    for i,f in enumerate(source['formations']):
        signal=dt.date.fromisoformat(f['signal']);view=f['view'];cum={};momentum={}
        for identity in f['eligible']:
            idx=positions[identity][signal]
            assert hf.is_eligible(panel[identity],idx) and hf.consecutive_through(panel[identity],idx,view)
            ys=logs[identity][idx-view+1:idx+1];ys=[x-ys[0] for x in ys]
            cum[identity]=(math.fsum(ys[1:-1])+.5*ys[-1])/(view-1)
            momentum[identity]=ys[-1];eligible_checks+=1
            assert (ys[-1] if ys[-1]>0 else None)==f['scores']['Momentum'][identity];baseline_scores+=1
            breakout=math.log(panel[identity][idx].close/max(b.high for b in panel[identity][idx-view+1:idx]))
            assert (breakout if breakout>0 else None)==f['scores']['Breakout'][identity];baseline_scores+=1
            if i%131==0:
                bars=panel[identity][idx-view+1:idx+1]
                expected=cumulative([b.close for b in bars],[(b.date-bars[0].date).days for b in bars])
                assert math.isclose(cum[identity],expected,rel_tol=1e-12,abs_tol=1e-12);scalar_checks+=1
        cm,mm=signed(cum),signed(momentum)
        hybrid={key:.5*cm[key]+.5*mm[key] for key in f['eligible']}
        values=dict(Cumulative=cum,Hybrid=hybrid)
        selected={m:sorted((key for key,v in xs.items() if v>0),key=lambda k:(-xs[k],k))[:10] for m,xs in values.items()}
        signed_order=sorted(momentum,key=lambda key:(-momentum[key],key))
        formations.append(dict(year=f['year'],signal=f['signal'],view=view,eligible=f['eligible'],endpoint=momentum,cumulative=cum,
                               hybrid=hybrid,selected=selected))
        for method,ids in selected.items():
            keys=[outcome(identity,signal) for identity in ids]
            means={s:sum(outcomes[k][s] for k in keys)/10 for s in MARKS}
            cohorts.append(dict(year=f['year'],signal=f['signal'],view=view,method=method,holding=30,denominator=10,outcome_ids=keys,**means))
            matched_keys=[outcome(identity,signal) for identity in signed_order[:len(ids)]]
            beyond=len(ids)>len(f['selected']['Momentum']);oversubscribed+=beyond
            matched[f['signal'],view,method]=dict(year=f['year'],signal=f['signal'],view=view,method=method,holding=30,denominator=10,
                outcome_ids=matched_keys,requires_nonpositive_momentum=beyond,
                **{s:sum(outcomes[k][s] for k in matched_keys)/10 for s in MARKS})
        if i%5000==0: print('Processed formations',i,flush=True)
    fixed_parity=0
    for c in cohorts:
        if c['method'] in ['Momentum','Breakout']:
            assert c==original_cohorts[c['signal'],c['view'],c['method']]
            for s in MARKS: assert sum(outcomes[k][s] for k in c['outcome_ids'])/10==c[s];fixed_parity+=1
    # Independent four-mark replay from actual saved opens, for every retained position.
    for p in outcomes.values():
        for mark in MARKS:
            fee=.01 if mark.startswith('net100') else .005
            expected=0. if p['entry_missing'] else -1. if p['exit_missing'] and mark.endswith('loss') else ((1. if p['exit_missing'] else p['exit_price']/p['entry_price'])*(1-fee)/(1+fee)-1)
            assert math.isclose(p[mark],expected,rel_tol=1e-12,abs_tol=1e-12)
    lookup={(c['signal'],c['view'],c['method']):c for c in cohorts}
    original_paths={(p['view'],p['method'],p['offset']):p for p in json.load(gzip.open(SOURCE/'capital-ledger.json.gz','rt'))['paths'] if p['scheduler']=='responsive'}
    capital=[];capital_checks=baseline_capital=overlap_paths=0
    for view in hh.VIEWS:
        for method in METHODS:
            for offset in range(32):
                start=dt.date(2023,1,1)+offset*DAY
                schedule=cp.make_schedule(lookup,outcomes,view,method,start,scheduler='responsive')
                scenarios={}
                for s in MARKS:
                    returns=lambda d,mark:lookup[d['signal'],view,method][mark]
                    scenarios[s]=cp.replay(schedule,s,returns)
                    independent_replay(schedule,lambda d:returns(d,s),scenarios[s]);capital_checks+=1
                if method in ['Momentum','Breakout']:
                    original=original_paths[view,method,offset]
                    assert schedule==original['schedule'] and scenarios==original['scenarios'];baseline_capital+=1
                matched_scenarios=None;conflicts=[]
                if method in NEW:
                    for d in schedule:
                        if d['status']=='missing-formation': continue
                        r=matched[d['signal'],view,method]
                        fills=sum(not outcomes[k]['entry_missing'] for k in r['outcome_ids'])
                        if fills and d['next_signal']<d['hard_exit_date']: conflicts.append(d['signal'])
                    if conflicts: overlap_paths+=1
                    else:
                        matched_scenarios={}
                        for s in MARKS:
                            returns=lambda d,mark:matched[d['signal'],view,method][mark]
                            matched_scenarios[s]=cp.replay(schedule,s,returns)
                            independent_replay(schedule,lambda d:returns(d,s),matched_scenarios[s]);capital_checks+=1
                capital.append(dict(view=view,method=method,offset=offset,scheduler='responsive',schedule=schedule,scenarios=scenarios,
                    matched_scenarios=matched_scenarios,matched_overlap_signals=conflicts))
    daily_rows=summaries(cohorts,outcomes,matched);capital_rows=capital_summaries(capital)
    write_gzip(HERE/'venue-ledger.json.gz',dict(formations=formations,cohorts=cohorts,outcomes=outcomes,matched_cohorts=list(matched.values())))
    write_gzip(HERE/'venue-capital.json.gz',dict(paths=capital))
    assert all(digest(ROOT/path)==value for path,value in hashes.items())
    summary=dict(started_utc=started,completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(),status='retrospective-fixed-definitions-no-default-promotion',
        hashes=hashes,provenance=provenance,ledger_sha256=digest(HERE/'venue-ledger.json.gz'),capital_sha256=digest(HERE/'venue-capital.json.gz'),
        counts=dict(formations=len(formations),cohorts=len(cohorts),outcomes=len(outcomes),new_outcomes=new_outcomes,eligible_checks=eligible_checks,
            scalar_checks=scalar_checks,baseline_score_checks=baseline_scores,baseline_cohort_mark_checks=fixed_parity,
            raw_price_mark_checks=4*len(outcomes),capital_paths=len(capital),independent_capital_scenarios=capital_checks,
            exact_baseline_capital_paths=baseline_capital,matched_cohorts_exceeding_positive_momentum_count=oversubscribed,matched_capital_overlap_paths=overlap_paths),
        daily=daily_rows,capital=capital_rows)
    with (HERE/'venue-summary.json').open('x') as f: json.dump(summary,f,indent=2,allow_nan=False)
    print(json.dumps({k:v for k,v in summary.items() if k not in ['hashes','provenance','daily','capital']},indent=2))


if __name__=='__main__': main()
