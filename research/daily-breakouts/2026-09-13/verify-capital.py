"""Independent daily capital schedule and arithmetic reconstruction; no runner imports."""
import collections
import datetime as dt
import gzip
import hashlib
import itertools
import json
import math
from pathlib import Path
import statistics as st

HERE = Path(__file__).resolve().parent
DAY = dt.timedelta(days=1)
METHODS = ('Momentum','Breakout','VolumeBreakout')
VIEWS = (3,4,5,6,7,10,14,21,30,45,60,90)
SCENARIOS = ('net_zero','net_loss','net100_zero','net100_loss')
COUNT = 0
MAX_ERROR = 0.


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def eq(actual,expected,where=''):
    global COUNT,MAX_ERROR
    if isinstance(expected,dict):
        assert set(actual)==set(expected),(where,set(actual),set(expected))
        for key,value in expected.items(): eq(actual[key],value,where+'/'+str(key))
    elif isinstance(expected,list):
        assert len(actual)==len(expected),(where,len(actual),len(expected))
        for i,(a,b) in enumerate(zip(actual,expected)): eq(a,b,where+'/'+str(i))
    elif isinstance(expected,float):
        assert math.isfinite(actual) and math.isclose(actual,expected,rel_tol=2e-11,abs_tol=2e-13),(where,actual,expected)
        MAX_ERROR=max(MAX_ERROR,abs(actual-expected)); COUNT+=1
    else:
        assert actual==expected,(where,actual,expected)
        COUNT+=1


def date(s):
    return dt.date.fromisoformat(s)


def schedule(cohorts,outcomes,view,method,start,scheduler,end=dt.date(2025,12,31)):
    available = start
    decisions = []
    for offset in range((end-start).days+1):
        today=start+offset*DAY
        if today<available: continue
        cohort=cohorts.get((str(today),view,method))
        if cohort is None:
            available=today+DAY
            decisions.append(dict(signal=str(today),status='missing-formation',next_signal=str(available)))
            continue
        assert cohort['holding']==30 and cohort['denominator']==10
        ids=cohort['outcome_ids']
        assert len(ids)<=10 and len(ids)==len(set(ids))
        entry=today+2*DAY; deadline=today+32*DAY
        filled=0
        for key in ids:
            outcome=outcomes[key]
            assert outcome['entry_date']==str(entry) and outcome['exit_date']==str(deadline)
            if not outcome['entry_missing']: filled+=1
        state='held' if filled else 'all-entries-missing' if ids else 'empty-selection'
        available=(deadline if scheduler=='scheduled' or filled else entry if ids else today+DAY)
        decisions.append(dict(signal=str(today),status=state,selected=len(ids),filled=filled,
            entry_date=str(entry),hard_exit_date=str(deadline),next_signal=str(available),
            knowledge_date=str(entry if ids else today),outcome_ids=ids))
    return decisions


def exposure(decisions,start):
    batches=[d for d in decisions if d['status']!='missing-formation']
    counts=collections.Counter(d['status'] for d in decisions)
    selected=sum(d['selected'] for d in batches); filled=sum(d['filled'] for d in batches)
    weighted=sum(d['filled']/10*30 for d in batches)
    reserve=lambda d:(date(d['next_signal'])-date(d['signal'])).days
    last=max([dt.date(2026,1,1)]+[date(d['hard_exit_date']) for d in batches if d['filled']])
    elapsed=(last-start).days
    return dict(decisions=len(decisions),formations=len(batches),status_counts=dict(sorted(counts.items())),
        selected_positions=selected,filled_positions=filled,unfilled_positions=selected-filled,
        offered_slots=10*len(batches),unused_slots=10*len(batches)-selected,
        filled_slot_equivalent_days=weighted,elapsed_days_through_final_position=elapsed,
        filled_capital_time_fraction=weighted/elapsed if elapsed else 0.,
        selected_capital_reserved_days=sum(reserve(d) for d in batches if d['selected']),
        all_decision_reserved_days=sum(reserve(d) for d in batches),final_position_or_sample_end=str(last))


def performance(decisions,scenario,outcomes):
    wealth=peak=1.; worst=0.; annual={}; checkpoints=[]
    for d in decisions:
        if d['status']=='missing-formation': continue
        r=sum(outcomes[k][scenario] for k in d['outcome_ids'])/10
        assert r>=-1 and (d['filled'] or r==0)
        checkpoint=d['hard_exit_date'] if d['filled'] else d['knowledge_date']
        wealth=wealth*(1+r); peak=max(peak,wealth)
        drawdown=wealth/peak-1.; worst=min(worst,drawdown)
        year=checkpoint[:4]; annual[year]=annual.get(year,1.)*(1+r)
        checkpoints.append(dict(signal=d['signal'],checkpoint_date=checkpoint,
                                net_return=r,wealth=wealth,drawdown=drawdown))
    best=None
    for i,p in enumerate(checkpoints):
        if best is None or p['net_return']>checkpoints[best]['net_return']: best=i
    without=1.
    for i,p in enumerate(checkpoints):
        if i!=best: without*=1+p['net_return']
    return dict(terminal_wealth=wealth,exit_checkpoint_drawdown=worst,
        annual_exit_returns={y:v-1 for y,v in sorted(annual.items())},
        best_batch_signal=checkpoints[best]['signal'] if best is not None else None,
        best_batch_return=checkpoints[best]['net_return'] if best is not None else None,
        without_best_batch_wealth=without,checkpoints=checkpoints)


def aggregate(paths):
    groups=collections.defaultdict(list)
    for p in paths: groups[p['view'],p['method'],p['scheduler']].append(p)
    rows=[]
    for (view,method,scheduler),ps in sorted(groups.items()):
        assert sorted(p['offset'] for p in ps)==list(range(32))
        scenarios={}
        for s in SCENARIOS:
            results=[p['scenarios'][s] for p in ps]
            wealth=[r['terminal_wealth'] for r in results]
            removed=[r['without_best_batch_wealth'] for r in results]
            years=sorted({y for r in results for y in r['annual_exit_returns']})
            annual={}
            for y in years:
                values=[r['annual_exit_returns'].get(y,0.) for r in results]
                annual[y]=dict(min=min(values),median=st.median(values),max=max(values),
                               profitable_paths=sum(v>0 for v in values))
            scenarios[s]=dict(min_wealth=min(wealth),median_wealth=st.median(wealth),max_wealth=max(wealth),
                profitable_paths=sum(v>1 for v in wealth),min_without_best_batch_wealth=min(removed),
                median_without_best_batch_wealth=st.median(removed),
                profitable_without_best_paths=sum(v>1 for v in removed),
                worst_exit_checkpoint_drawdown=min(r['exit_checkpoint_drawdown'] for r in results),
                annual_exit_returns=annual)
        rows.append(dict(view=view,method=method,scheduler=scheduler,paths=len(ps),scenarios=scenarios))
    lookup={(p['view'],p['method'],p['scheduler'],p['offset']):p for p in paths}
    pairs=[]
    for view in VIEWS:
        for scheduler in ('responsive','scheduled'):
            for a,b in itertools.combinations(METHODS,2):
                for s in SCENARIOS:
                    deltas=[lookup[view,b,scheduler,i]['scenarios'][s]['terminal_wealth']-
                            lookup[view,a,scheduler,i]['scenarios'][s]['terminal_wealth'] for i in range(32)]
                    pairs.append(dict(view=view,scheduler=scheduler,baseline=a,candidate=b,scenario=s,
                        offsets=32,wins=sum(x>0 for x in deltas),losses=sum(x<0 for x in deltas),
                        ties=sum(x==0 for x in deltas),min_wealth_delta=min(deltas),
                        median_wealth_delta=st.median(deltas),max_wealth_delta=max(deltas),offset_wealth_deltas=deltas))
    return rows,pairs


def selftest():
    def c(signal,ids): return dict(signal=signal,holding=30,denominator=10,outcome_ids=ids)
    def o(signal,missing):
        d=date(signal)
        return dict(entry_date=str(d+2*DAY),exit_date=str(d+32*DAY),entry_missing=missing,
                    **{s:0. if missing else .1 for s in SCENARIOS})
    cs={('2023-12-28',7,'Breakout'):c('2023-12-28',[]),
        ('2023-12-29',7,'Breakout'):c('2023-12-29',['a']),
        ('2023-12-31',7,'Breakout'):c('2023-12-31',['b','c'])}
    os={'a':o('2023-12-29',True),'b':o('2023-12-31',False),'c':o('2023-12-31',True)}
    args=(cs,os,7,'Breakout',date('2023-12-28'))
    first=schedule(*args,'responsive',date('2023-12-31'))
    assert [d['signal'] for d in first]==['2023-12-28','2023-12-29','2023-12-31']
    assert first[1]['next_signal']=='2023-12-31' and first[2]['next_signal']=='2024-02-01'
    assert len(schedule(*args,'scheduled',date('2023-12-31')))==1
    for o_ in os.values():
        for s in SCENARIOS: o_[s]=999
    assert schedule(*args,'responsive',date('2023-12-31'))==first


def main():
    selftest()
    target=HERE/'capital-verification.json'
    if target.exists(): raise FileExistsError(target)
    started=dt.datetime.now(dt.timezone.utc).isoformat()
    summary=json.loads((HERE/'capital-summary.json').read_text())
    main_summary=json.loads((HERE/'summary.json').read_text())
    assert sha(HERE/'capital-ledger.json.gz')==summary['ledger_sha256']
    aliases={'source_ledger':'ledger.json.gz','source_summary':'summary.json'}
    for name,value in summary['hashes'].items(): assert sha(HERE/aliases.get(name,name))==value
    assert sha(HERE/'ledger.json.gz')==main_summary['ledger_sha256']
    report=json.loads((HERE/'verification.json').read_text())
    assert report['status']=='passed' and report['ledger_sha256']==main_summary['ledger_sha256']
    with gzip.open(HERE/'ledger.json.gz','rt') as f: source=json.load(f)
    cohorts={(c['signal'],c['view'],c['method']):c for c in source['cohorts']}
    assert len(cohorts)==len(source['cohorts'])
    outcomes=source['outcomes']
    del source
    with gzip.open(HERE/'capital-ledger.json.gz','rt') as f: saved=json.load(f)['paths']
    expected_keys=set(itertools.product(VIEWS,METHODS,('responsive','scheduled'),range(32)))
    observed_keys={(p['view'],p['method'],p['scheduler'],p['offset']) for p in saved}
    assert len(saved)==2304 and observed_keys==expected_keys
    decisions=checkpoints=0; statuses=collections.Counter()
    for p in saved:
        start=dt.date(2023,1,1)+p['offset']*DAY
        assert p['start']==str(start) and p['end_signal']=='2025-12-31' and p['holding']==30
        rebuilt=schedule(cohorts,outcomes,p['view'],p['method'],start,p['scheduler'])
        eq(p['schedule'],rebuilt,'schedule')
        eq(p['exposure'],exposure(rebuilt,start),'exposure')
        for s in SCENARIOS:
            expected=performance(rebuilt,s,outcomes)
            eq(p['scenarios'][s],expected,'scenario')
            checkpoints+=len(expected['checkpoints'])
        decisions+=len(rebuilt); statuses.update(d['status'] for d in rebuilt)
    rows,pairs=aggregate(saved)
    eq(summary['rows'],rows,'summary-rows'); eq(summary['method_pairs'],pairs,'method-pairs')
    eq(summary['counts'],dict(paths=len(saved),decisions=decisions))
    result=dict(status='passed',started_at_utc=started,completed_at_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        verifier_sha256=sha(Path(__file__)),runner_sha256=sha(HERE/'capital.py'),
        capital_ledger_sha256=sha(HERE/'capital-ledger.json.gz'),capital_summary_sha256=sha(HERE/'capital-summary.json'),
        source_ledger_sha256=sha(HERE/'ledger.json.gz'),paths=len(saved),decisions=decisions,
        status_counts=dict(statuses),scenario_checkpoints=checkpoints,summary_rows=len(rows),paired_rows=len(pairs),
        checked_values=COUNT,maximum_absolute_numeric_difference=MAX_ERROR,selftests='passed',
        independence='No capital or main runner imports; enumerates every calendar day, rebuilds entry-knowledge schedules and ten-slot returns from independently verified source outcomes, then wealth, drawdown, exposure, omission diagnostics and paired summaries.',
        limitations=['Checks arithmetic and stated causal schedule, not untouched validation or deployable expected gains.',
                     'Daily and phase paths share source outcomes; these are not independent statistical trials.'])
    with target.open('x') as f: json.dump(result,f,indent=2,allow_nan=False); f.write('\n')
    print(json.dumps(result))


if __name__=='__main__': main()
