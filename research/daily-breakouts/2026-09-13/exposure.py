"""Frozen same-count and same-schedule Momentum counterfactual; see protocol."""
import collections
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import statistics as st

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('frozen_daily_capital',HERE/'capital.py')
capital=importlib.util.module_from_spec(spec); spec.loader.exec_module(capital)
SCENARIOS=capital.SCENARIOS
CANDIDATES=('Breakout','VolumeBreakout')


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def compare(xs):
    return dict(mean=st.mean(xs),median=st.median(xs),minimum=min(xs),maximum=max(xs),
                wins=sum(x>0 for x in xs),losses=sum(x<0 for x in xs),ties=sum(x==0 for x in xs))


def metrics(ids,outcomes):
    ps=[outcomes[k] for k in ids]
    known=[p['known_net'] for p in ps if p['known_net'] is not None]
    return dict(selected=len(ps),filled=sum(not p['entry_missing'] for p in ps),
                entry_missing=sum(p['entry_missing'] for p in ps),exit_missing=sum(p['exit_missing'] for p in ps),
                unknown_paths=sum(p['unknown_path'] for p in ps),known=len(known),
                observed_20pct_hits=sum(p['hit'] for p in ps),realized_20pct_hits=sum(r>=.2 for r in known),
                losing_known=sum(r<0 for r in known))


def daily_summary(records):
    groups=collections.defaultdict(list)
    for r in records:
        for period in ('all',str(r['year']),'2020-2022' if r['year']<2023 else '2023-2025'):
            groups[r['view'],r['method'],period].append(r)
    summaries=[]
    for (view,method,period),rs in sorted(groups.items()):
        metrics_by_role={role:{k:sum(r['metrics'][role][k] for r in rs) for k in rs[0]['metrics'][role]}
                         for role in ('candidate','matched_momentum')}
        scenarios={s:dict(candidate_mean=st.mean(r['returns']['candidate'][s] for r in rs),
                         benchmark_mean=st.mean(r['returns']['matched_momentum'][s] for r in rs),
                         paired=compare([r['returns']['candidate'][s]-r['returns']['matched_momentum'][s] for r in rs]))
                   for s in SCENARIOS}
        summaries.append(dict(view=view,method=method,holding=30,period=period,cohorts=len(rs),
                              slots=len(rs)*10,metrics=metrics_by_role,scenarios=scenarios))
    return summaries


def capital_summary(paths):
    groups=collections.defaultdict(list)
    for p in paths: groups[p['view'],p['method'],p['scheduler']].append(p)
    summaries=[]
    for (view,method,scheduler),ps in sorted(groups.items()):
        assert sorted(p['offset'] for p in ps)==list(range(32))
        scenarios={}
        for s in SCENARIOS:
            candidate=[p['scenarios']['candidate'][s] for p in ps]
            benchmark=[p['scenarios']['matched_momentum'][s] for p in ps]
            wealth=lambda rs:[r['terminal_wealth'] for r in rs]
            years=sorted({y for r in candidate+benchmark for y in r['annual_exit_returns']})
            scenarios[s]=dict(candidate_wealth=compare(wealth(candidate)),benchmark_wealth=compare(wealth(benchmark)),
                paired_wealth=compare([a['terminal_wealth']-b['terminal_wealth'] for a,b in zip(candidate,benchmark)]),
                candidate_profitable_phases=sum(a['terminal_wealth']>1 for a in candidate),
                benchmark_profitable_phases=sum(b['terminal_wealth']>1 for b in benchmark),
                candidate_worst_exit_drawdown=min(a['exit_checkpoint_drawdown'] for a in candidate),
                benchmark_worst_exit_drawdown=min(b['exit_checkpoint_drawdown'] for b in benchmark),
                annual_paired_returns={y:compare([a['annual_exit_returns'].get(y,0)-b['annual_exit_returns'].get(y,0)
                                                for a,b in zip(candidate,benchmark)]) for y in years})
        summaries.append(dict(view=view,method=method,scheduler=scheduler,phases=32,scenarios=scenarios))
    return summaries


def main():
    targets=[HERE/'exposure-summary.json',HERE/'exposure-ledger.json.gz']
    if any(p.exists() for p in targets): raise FileExistsError('Exposure outputs exist')
    started=dt.datetime.now(dt.timezone.utc).isoformat()
    names=['exposure.py','exposure-protocol.md','capital.py','ledger.json.gz','summary.json',
           'capital-ledger.json.gz','capital-summary.json','verification.json','capital-verification.json']
    hashes={name:sha(HERE/name) for name in names}
    source_summary=json.loads((HERE/'summary.json').read_text())
    capsummary=json.loads((HERE/'capital-summary.json').read_text())
    assert hashes['ledger.json.gz']==source_summary['ledger_sha256']
    assert hashes['capital-ledger.json.gz']==capsummary['ledger_sha256']
    for filename in ('verification.json','capital-verification.json'):
        assert json.loads((HERE/filename).read_text())['status']=='passed'
    with gzip.open(HERE/'ledger.json.gz','rt') as f: source=json.load(f)
    cohorts={(r['signal'],r['view'],r['method']):r for r in source['cohorts']}
    outcomes=source['outcomes']
    formations={(r['signal'],r['view']):r for r in source['formations']}
    records=[]
    for c in source['cohorts']:
        if c['method'] not in CANDIDATES: continue
        k=len(c['outcome_ids']); mom=cohorts[c['signal'],c['view'],'Momentum']
        assert len(mom['outcome_ids'])>=k and c['denominator']==mom['denominator']==10
        formation=formations[c['signal'],c['view']]
        assert formation['selected']['Momentum']==[json.loads(x)[0] for x in mom['outcome_ids']]
        ids=dict(candidate=c['outcome_ids'],matched_momentum=mom['outcome_ids'][:k])
        assert len(ids['candidate'])==len(ids['matched_momentum'])
        returns={role:{s:sum(outcomes[key][s] for key in keys)/10 for s in SCENARIOS}
                 for role,keys in ids.items()}
        assert returns['candidate']=={s:c[s] for s in SCENARIOS}
        records.append(dict(year=c['year'],signal=c['signal'],view=c['view'],method=c['method'],holding=30,
                            denominator=10,outcome_ids=ids,returns=returns,
                            metrics={role:metrics(keys,outcomes) for role,keys in ids.items()}))
    paired={(r['signal'],r['view'],r['method']):r for r in records}
    assert len(records)==2*len(formations) and len(paired)==len(records)
    del source,formations
    with gzip.open(HERE/'capital-ledger.json.gz','rt') as f: originals=json.load(f)['paths']
    paths=[]; candidate_checks=0; schedule_conflicts=0
    for original in originals:
        if original['method'] not in CANDIDATES: continue
        view,method=original['view'],original['method']; schedule=original['schedule']
        roles={}
        selected_counts={role:0 for role in ('candidate','matched_momentum')}
        filled_counts=dict(selected_counts); different_filled_batches=0
        for decision in schedule:
            if decision['status']=='missing-formation': continue
            record=paired[decision['signal'],view,method]
            assert record['outcome_ids']['candidate']==decision['outcome_ids']
            for role in selected_counts:
                selected_counts[role]+=record['metrics'][role]['selected']
                filled_counts[role]+=record['metrics'][role]['filled']
            different_filled_batches+=record['metrics']['candidate']['filled']!=record['metrics']['matched_momentum']['filled']
            if record['metrics']['matched_momentum']['filled'] and decision['next_signal']<decision['hard_exit_date']:
                schedule_conflicts+=1
        assert schedule_conflicts==0,'Matched filled batch would overlap frozen next signal'
        for role in selected_counts:
            def returns(d,s): return paired[d['signal'],view,method]['returns'][role][s]
            roles[role]={s:capital.replay(schedule,s,returns) for s in SCENARIOS}
        assert roles['candidate']==original['scenarios']
        candidate_checks+=1
        paths.append(dict(view=view,method=method,scheduler=original['scheduler'],offset=original['offset'],
                          start=original['start'],end_signal=original['end_signal'],schedule=schedule,
                          selected_positions=selected_counts,filled_positions=filled_counts,
                          different_filled_batches=different_filled_batches,scenarios=roles))
    assert len(paths)==1536
    rows=daily_summary(records); phase_rows=capital_summary(paths)
    payload=dict(cohorts=records,paths=paths)
    with targets[1].open('xb') as raw:
        with gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as compressed:
            import io
            with io.TextIOWrapper(compressed,encoding='utf8') as f:
                json.dump(payload,f,separators=(',',':'),allow_nan=False)
    summary=dict(status='retrospective-same-count-and-schedule-counterfactual',started_utc=started,
        completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(),hashes=hashes,
        ledger_sha256=sha(targets[1]),counts=dict(cohorts=len(records),paths=len(paths),
            candidate_cohort_exact_matches=len(records),candidate_path_exact_matches=candidate_checks,
            schedule_overlap_conflicts=schedule_conflicts,daily_summary_rows=len(rows),capital_summary_rows=len(phase_rows)),
        daily=rows,capital=phase_rows,
        limitations=['Momentum benchmark uses candidate timing and count; it is not a standalone Momentum policy.',
                     'Matched offered slots do not guarantee identical fills; differing fills are retained and reported.',
                     'Prior outcomes inspected; overlapping dates and phases are not independent samples.',
                     'Wealth summaries across phases are descriptive, not an estimated future expected return.'])
    with targets[0].open('x') as f: json.dump(summary,f,indent=2,allow_nan=False); f.write('\n')
    print(json.dumps(dict(counts=summary['counts'],ledger_sha256=summary['ledger_sha256'])))


if __name__=='__main__': main()
