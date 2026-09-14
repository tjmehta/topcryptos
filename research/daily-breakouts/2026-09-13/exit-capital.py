"""Apply paired exits to immutable daily batch entry schedules, holding early cash."""
import collections
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import statistics as st

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('frozen_daily_capital',HERE/'capital.py')
cp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cp)
POLICIES = ('FixedH','SMAATRBracket','ResistanceSMAATR')


def equivalent(a,b):
    if isinstance(a,dict):
        assert a.keys()==b.keys()
        for k,v in a.items():
            equivalent(v,b[k])
    elif isinstance(a,list):
        assert len(a)==len(b)
        for x,y in zip(a,b):
            equivalent(x,y)
    elif isinstance(a,(int,float)) and not isinstance(a,bool):
        assert math.isclose(a,b,rel_tol=1e-10,abs_tol=1e-12),(a,b)
    else:
        assert a==b,(a,b)


def main():
    if any((HERE/name).exists() for name in ['exit-capital-summary.json','exit-capital-ledger.json.gz']):
        raise FileExistsError('Paired exit capital outputs exist')
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    paths = [HERE/n for n in ['capital.py','capital-ledger.json.gz','capital-summary.json','exit-ledger.json.gz','exit-summary.json','protocol.md','exits-protocol.md']]+[Path(__file__)]
    hashes = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    capital_summary = json.loads((HERE/'capital-summary.json').read_text())
    exit_summary = json.loads((HERE/'exit-summary.json').read_text())
    assert capital_summary['ledger_sha256']==hashes['capital-ledger.json.gz']
    assert exit_summary['ledger_sha256']==hashes['exit-ledger.json.gz']
    # Root capital helper must still match the hash frozen by its source run.
    capital_hashes = capital_summary['hashes']
    assert hashes['capital.py'] in capital_hashes.values()
    capital = json.load(gzip.open(HERE/'capital-ledger.json.gz','rt'))['paths']
    outcomes = json.load(gzip.open(HERE/'exit-ledger.json.gz','rt'))['outcomes']
    results,paired,rows = [],[],[]
    parity = 0
    for policy in POLICIES:
        policy_paths = []
        for original in capital:
            schedule = original['schedule']
            def returns(decision,scenario):
                return sum(outcomes[k][policy][scenario] for k in decision['outcome_ids'])/10
            scenarios = {}
            for scenario in cp.SCENARIOS:
                replayed = cp.replay(schedule,scenario,returns)
                if policy=='FixedH':
                    equivalent(replayed,original['scenarios'][scenario])
                    parity += 1
                scenarios[scenario] = {k:v for k,v in replayed.items() if k!='checkpoints'}
            policy_paths.append(dict(view=original['view'],method=original['method'],scheduler=original['scheduler'],
                offset=original['offset'],policy=policy,scenarios=scenarios))
        summarized,_ = cp.summarize(policy_paths)
        rows.extend(dict(policy=policy,**r) for r in summarized)
        results.extend(policy_paths)
    lookup = {(p['view'],p['method'],p['scheduler'],p['offset'],p['policy']):p for p in results}
    for view in cp.VIEWS:
        for method in cp.METHODS:
            for scheduler in ['responsive','scheduled']:
                for policy in POLICIES[1:]:
                    for scenario in cp.SCENARIOS:
                        ds = [lookup[view,method,scheduler,i,policy]['scenarios'][scenario]['terminal_wealth']-
                              lookup[view,method,scheduler,i,'FixedH']['scenarios'][scenario]['terminal_wealth'] for i in range(32)]
                        paired.append(dict(view=view,method=method,scheduler=scheduler,policy=policy,scenario=scenario,
                            wins=sum(d>1e-12 for d in ds),losses=sum(d < -1e-12 for d in ds),ties=sum(abs(d)<=1e-12 for d in ds),
                            min_delta=min(ds),median_delta=st.median(ds),max_delta=max(ds)))
    payload = dict(source_hashes=hashes,paths=results)
    raw = gzip.compress(json.dumps(payload,separators=(',',':'),allow_nan=False).encode(),mtime=0)
    with (HERE/'exit-capital-ledger.json.gz').open('xb') as f:
        f.write(raw)
    summary = dict(started_utc=started,completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(),hashes=hashes,
        ledger_sha256=hashlib.sha256(raw).hexdigest(),paths=len(results),fixed_replay_parity=parity,rows=rows,paired=paired)
    with (HERE/'exit-capital-summary.json').open('x') as f:
        json.dump(summary,f,indent=2,allow_nan=False)
        f.write('\n')
    print(json.dumps({k:v for k,v in summary.items() if k not in ('hashes','rows','paired')}))


if __name__=='__main__':
    main()
