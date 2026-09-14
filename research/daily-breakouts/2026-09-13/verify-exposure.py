"""Independent top-K/count/timing counterfactual verification; no runner imports."""
import collections
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics as st

HERE=Path(__file__).resolve().parent
MARKS=('net_zero','net_loss','net100_zero','net100_loss')
ROLES=('candidate','matched_momentum')


def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def same(a,b):
    if isinstance(a,dict):
        assert a.keys()==b.keys(),(a.keys(),b.keys())
        for k in a: same(a[k],b[k])
    elif isinstance(a,list):
        assert len(a)==len(b)
        for x,y in zip(a,b): same(x,y)
    elif isinstance(a,(int,float)) and not isinstance(a,bool):
        assert math.isclose(a,b,rel_tol=1e-10,abs_tol=1e-12),(a,b)
    else: assert a==b,(a,b)


def describe(values):
    return dict(mean=sum(values)/len(values),median=st.median(values),minimum=min(values),maximum=max(values),
                wins=sum(x>0 for x in values),losses=sum(x<0 for x in values),ties=sum(x==0 for x in values))


def expected_ids(formation,method):
    # Sole inputs are frozen signal-time scores and candidate signal-time count.
    # Neither future prices nor labels enter this function.
    def order(name):
        scores=formation['scores'][name]
        return sorted((k for k,v in scores.items() if v is not None),key=lambda k:(-scores[k],k))[:10]
    selected=order(method)
    momentum=order('Momentum')
    assert len(momentum)>=len(selected)
    def keys(identities):
        return [json.dumps([identity,formation['signal'],30],separators=(',',':')) for identity in identities]
    return dict(candidate=keys(selected),matched_momentum=keys(momentum[:len(selected)]))


def trade_return(p,mark):
    if p['entry_missing']: return 0.
    if p['exit_missing'] and mark.endswith('_loss'): return -1.
    ratio=1. if p['exit_missing'] else p['exit_price']/p['entry_price']
    fee=.01 if mark.startswith('net100') else .005
    return ratio*(1-fee)/(1+fee)-1


def trade_metrics(ps):
    known=[p['known_net'] for p in ps if p['known_net'] is not None]
    return dict(selected=len(ps),filled=sum(not p['entry_missing'] for p in ps),
        entry_missing=sum(p['entry_missing'] for p in ps),exit_missing=sum(p['exit_missing'] for p in ps),
        unknown_paths=sum(p['unknown_path'] for p in ps),known=len(known),
        observed_20pct_hits=sum(p['hit'] for p in ps),realized_20pct_hits=sum(x>=.2 for x in known),losing_known=sum(x<0 for x in known))


def replay(schedule,records,view,method,role,mark):
    returns=[]; checkpoints=[]; annual=collections.defaultdict(list)
    wealth=peak=1.; worst=0.
    for decision in schedule:
        if decision['status']=='missing-formation': continue
        r=records[decision['signal'],view,method]['returns'][role][mark]
        assert math.isfinite(r) and r>=-1
        if not decision['filled']: assert r==0
        day=decision['hard_exit_date'] if decision['filled'] else decision['knowledge_date']
        wealth*=1+r
        peak=max(peak,wealth)
        dd=wealth/peak-1
        worst=min(worst,dd)
        annual[day[:4]].append(1+r)
        returns.append(r)
        checkpoints.append(dict(signal=decision['signal'],checkpoint_date=day,net_return=r,wealth=wealth,drawdown=dd))
    best=returns.index(max(returns)) if returns else None
    return dict(terminal_wealth=wealth,exit_checkpoint_drawdown=worst,
        annual_exit_returns={y:math.prod(xs)-1 for y,xs in sorted(annual.items())},
        best_batch_signal=checkpoints[best]['signal'] if best is not None else None,
        best_batch_return=returns[best] if best is not None else None,
        without_best_batch_wealth=math.prod(1+r for i,r in enumerate(returns) if i!=best),checkpoints=checkpoints)


def main():
    dest=HERE/'exposure-verification.json'
    if dest.exists(): raise FileExistsError(dest)
    started=dt.datetime.now(dt.timezone.utc).isoformat()
    manifest=json.loads((HERE/'exposure-summary.json').read_text())
    assert digest(HERE/'exposure-ledger.json.gz')==manifest['ledger_sha256']
    for name,value in manifest['hashes'].items(): assert digest(HERE/name)==value,name
    source=json.load(gzip.open(HERE/'ledger.json.gz','rt'))
    original_cohorts={(c['signal'],c['view'],c['method']):c for c in source['cohorts']}
    formations={(f['signal'],f['view']):f for f in source['formations']}
    outcomes=source['outcomes']
    data=json.load(gzip.open(HERE/'exposure-ledger.json.gz','rt'))
    rows=data['cohorts']
    records={}
    score_selection_checks=cohort_mark_checks=metrics_checks=0
    for row in rows:
        ident=row['signal'],row['view'],row['method']
        assert ident not in records
        original=original_cohorts[ident]
        formation=formations[ident[:2]]
        expected=expected_ids(formation,row['method'])
        same(expected,row['outcome_ids'])
        same(expected['candidate'],original['outcome_ids'])
        assert expected['matched_momentum']==original_cohorts[row['signal'],row['view'],'Momentum']['outcome_ids'][:len(expected['candidate'])]
        for role,ids in expected.items():
            assert len(ids)==len(expected['candidate'])<=10
            ps=[outcomes[key] for key in ids]
            same(trade_metrics(ps),row['metrics'][role]); metrics_checks+=1
            for mark in MARKS:
                independently_calculated=sum(trade_return(p,mark) for p in ps)/10
                same(independently_calculated,row['returns'][role][mark])
                if role=='candidate': same(independently_calculated,original[mark])
                cohort_mark_checks+=1
        assert row['denominator']==10 and row['holding']==30 and row['year']==original['year']
        score_selection_checks+=1
        records[ident]=row
    assert len(records)==2*len(formations)==52272
    # Signal-only selector invariance under replacement of every unused future field.
    for formation in list(formations.values())[::max(1,len(formations)//200)]:
        altered=dict(formation,future_price=-999.,future_return=999.,hit=not True)
        for method in ['Breakout','VolumeBreakout']:
            same(expected_ids(formation,method),expected_ids(altered,method))
    groups=collections.defaultdict(list)
    for row in rows:
        for period in ['all',str(row['year']),'2020-2022' if row['year']<2023 else '2023-2025']:
            groups[row['view'],row['method'],period].append(row)
    daily_checks=0
    assert len(manifest['daily'])==len(groups)==216
    for summary in manifest['daily']:
        rs=groups[summary['view'],summary['method'],summary['period']]
        assert summary['cohorts']==len(rs) and summary['slots']==10*len(rs)
        for role in ROLES:
            expected={k:sum(r['metrics'][role][k] for r in rs) for k in rs[0]['metrics'][role]}
            same(expected,summary['metrics'][role])
        for mark in MARKS:
            a=[r['returns']['candidate'][mark] for r in rs]
            b=[r['returns']['matched_momentum'][mark] for r in rs]
            same(dict(candidate_mean=st.mean(a),benchmark_mean=st.mean(b),paired=describe([x-y for x,y in zip(a,b)])),summary['scenarios'][mark])
            daily_checks+=1
    del source,formations,original_cohorts
    originals=json.load(gzip.open(HERE/'capital-ledger.json.gz','rt'))['paths']
    original_paths={(p['view'],p['method'],p['scheduler'],p['offset']):p for p in originals if p['method']!='Momentum'}
    seen=set(); path_checks=fixed_checks=decisions=overlap_conflicts=0
    for path in data['paths']:
        ident=path['view'],path['method'],path['scheduler'],path['offset']
        assert ident not in seen; seen.add(ident)
        original=original_paths[ident]
        assert path['schedule']==original['schedule']
        assert path['start']==original['start'] and path['end_signal']==original['end_signal']
        counts={role:0 for role in ROLES}; fills=dict(counts); differing=0
        for d in path['schedule']:
            decisions+=1
            if d['status']=='missing-formation': continue
            row=records[d['signal'],path['view'],path['method']]
            assert row['outcome_ids']['candidate']==d['outcome_ids']
            for role in ROLES:
                counts[role]+=row['metrics'][role]['selected']
                fills[role]+=row['metrics'][role]['filled']
            differing+=row['metrics']['candidate']['filled']!=row['metrics']['matched_momentum']['filled']
            if row['metrics']['matched_momentum']['filled'] and d['next_signal']<d['hard_exit_date']:
                overlap_conflicts+=1
        assert overlap_conflicts==0
        same(counts,path['selected_positions']);same(fills,path['filled_positions'])
        assert differing==path['different_filled_batches']
        for role in ROLES:
            for mark in MARKS:
                expected=replay(path['schedule'],records,path['view'],path['method'],role,mark)
                same(expected,path['scenarios'][role][mark]);path_checks+=1
                if role=='candidate': same(expected,original['scenarios'][mark]);fixed_checks+=1
    assert len(seen)==len(original_paths)==1536
    phase_groups=collections.defaultdict(list)
    for p in data['paths']: phase_groups[p['view'],p['method'],p['scheduler']].append(p)
    phase_checks=0
    assert len(manifest['capital'])==len(phase_groups)==48
    for summary in manifest['capital']:
        ps=phase_groups[summary['view'],summary['method'],summary['scheduler']]
        assert sorted(p['offset'] for p in ps)==list(range(32)) and summary['phases']==32
        for mark in MARKS:
            a=[p['scenarios']['candidate'][mark] for p in ps]
            b=[p['scenarios']['matched_momentum'][mark] for p in ps]
            years=sorted({y for x in a+b for y in x['annual_exit_returns']})
            expected=dict(candidate_wealth=describe([x['terminal_wealth'] for x in a]),benchmark_wealth=describe([x['terminal_wealth'] for x in b]),
                paired_wealth=describe([x['terminal_wealth']-y['terminal_wealth'] for x,y in zip(a,b)]),
                candidate_profitable_phases=sum(x['terminal_wealth']>1 for x in a),benchmark_profitable_phases=sum(x['terminal_wealth']>1 for x in b),
                candidate_worst_exit_drawdown=min(x['exit_checkpoint_drawdown'] for x in a),benchmark_worst_exit_drawdown=min(x['exit_checkpoint_drawdown'] for x in b),
                annual_paired_returns={y:describe([left['annual_exit_returns'].get(y,0)-right['annual_exit_returns'].get(y,0) for left,right in zip(a,b)]) for y in years})
            same(expected,summary['scenarios'][mark]);phase_checks+=1
    assert manifest['counts']==dict(cohorts=52272,paths=1536,candidate_cohort_exact_matches=52272,candidate_path_exact_matches=1536,schedule_overlap_conflicts=0,daily_summary_rows=216,capital_summary_rows=48)
    report=dict(status='passed',started_utc=started,completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        verifier_sha256=digest(Path(__file__)),checked_ledger_sha256=manifest['ledger_sha256'],source_hashes=manifest['hashes'],
        signal_score_selection_checks=score_selection_checks,cohort_cost_mark_checks=cohort_mark_checks,cohort_metric_checks=metrics_checks,
        daily_summary_scenario_checks=daily_checks,unchanged_candidate_schedules=len(seen),schedule_decisions=decisions,
        independent_capital_role_scenarios=path_checks,original_candidate_scenario_parity=fixed_checks,
        phase_summary_scenario_checks=phase_checks,benchmark_overlap_conflicts=overlap_conflicts,
        scope='All top-K Momentum identities/order from signal-time scores; matched offered counts and ten-slot returns; saved hit/missing/loser metrics; all unchanged entry schedules and four cost/missing capital paths; checkpoint/annual/drawdown/best-batch and phase aggregates. Source price/bar correctness is covered by the separately hashed daily verification.')
    with dest.open('x') as f: json.dump(report,f,indent=2,allow_nan=False)
    print(json.dumps({k:v for k,v in report.items() if k!='source_hashes'},indent=2))


if __name__=='__main__': main()
