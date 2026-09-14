"""Independent arithmetic verifier for frozen daily exit-capital paths.

Imports neither capital.py nor exit-capital.py. Reconstructs returns directly
from executed exit prices, then accounts for cash through the original deadline.
"""
import collections
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics as st

HERE = Path(__file__).resolve().parent
POLICIES = ('FixedH', 'SMAATRBracket', 'ResistanceSMAATR')
MARKS = ('net_zero', 'net_loss', 'net100_zero', 'net100_loss')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def same(a, b):
    if isinstance(a, dict):
        assert a.keys() == b.keys(), (a.keys(), b.keys())
        for key in a:
            same(a[key], b[key])
    elif isinstance(a, list):
        assert len(a) == len(b)
        for left, right in zip(a, b):
            same(left, right)
    elif isinstance(a, (int, float)) and not isinstance(a, bool):
        assert math.isclose(a, b, rel_tol=1e-10, abs_tol=1e-12), (a, b)
    else:
        assert a == b, (a, b)


def slot_return(outcome, mark):
    if outcome['status'] == 'missing_entry':
        return 0.
    if outcome['status'] != 'known' and mark.endswith('_loss'):
        return -1.
    ratio = outcome['exit_price']/outcome['entry_price'] if outcome['status'] == 'known' else 1.
    fee = .01 if mark.startswith('net100') else .005
    return ratio*(1-fee)/(1+fee)-1


def reconstruct(schedule, outcomes, policy, mark):
    checkpoints, returns, year_factors = [], [], collections.defaultdict(list)
    wealth, peak, drawdown = 1., 1., 0.
    for d in schedule:
        if d['status'] == 'missing-formation':
            continue
        ps = [outcomes[key][policy] for key in d['outcome_ids']]
        assert all(p['entry_date'] == d['entry_date'] and p['hard_exit_date'] == d['hard_exit_date'] for p in ps)
        assert all(p['exit_date'] is None or p['exit_date'] <= d['hard_exit_date'] for p in ps)
        assert sum(p['status'] != 'missing_entry' for p in ps) == d['filled']
        r = sum(slot_return(p, mark) for p in ps)/10
        assert r >= -1 and math.isfinite(r)
        if not d['filled']:
            assert r == 0
        day = d['hard_exit_date'] if d['filled'] else d['knowledge_date']
        returns.append(r)
        wealth = wealth*(1+r)
        peak = max(peak, wealth)
        dd = wealth/peak-1
        drawdown = min(drawdown, dd)
        year_factors[day[:4]].append(1+r)
        checkpoints.append(dict(signal=d['signal'], checkpoint_date=day, net_return=r, wealth=wealth, drawdown=dd))
    best = returns.index(max(returns)) if returns else None
    return dict(terminal_wealth=wealth, exit_checkpoint_drawdown=drawdown,
        annual_exit_returns={year:math.prod(factors)-1 for year,factors in sorted(year_factors.items())},
        best_batch_signal=checkpoints[best]['signal'] if best is not None else None,
        best_batch_return=returns[best] if best is not None else None,
        without_best_batch_wealth=math.prod(1+r for i,r in enumerate(returns) if i != best),
        checkpoints=checkpoints)


def main():
    destination = HERE/'exit-capital-verification.json'
    if destination.exists():
        raise FileExistsError(destination)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    manifests = {}
    for prefix in ['capital', 'exit', 'exit-capital']:
        manifest = json.loads((HERE/(prefix+'-summary.json')).read_text())
        assert digest(HERE/(prefix+'-ledger.json.gz')) == manifest['ledger_sha256']
        manifests[prefix] = manifest
    result_manifest = manifests['exit-capital']
    for name, sha in result_manifest['hashes'].items():
        assert digest(HERE/name) == sha, name
    assert result_manifest['hashes']['capital.py'] == manifests['capital']['hashes']['capital.py']
    sources = json.load(gzip.open(HERE/'capital-ledger.json.gz', 'rt'))['paths']
    outcomes = json.load(gzip.open(HERE/'exit-ledger.json.gz', 'rt'))['outcomes']
    result_data = json.load(gzip.open(HERE/'exit-capital-ledger.json.gz', 'rt'))
    same(result_data['source_hashes'], result_manifest['hashes'])
    results = result_data['paths']
    lookup = {(p['view'],p['method'],p['scheduler'],p['offset'],p['policy']):p for p in results}
    assert len(lookup) == len(results) == len(sources)*3 == 6912
    assert result_manifest['paths'] == len(results)
    comparisons = fixed = checkpoints = schedule_checks = 0
    rebuilt = {}
    schedule_hashes = {}
    for source in sources:
        ident = source['view'],source['method'],source['scheduler'],source['offset']
        schedule = source['schedule']
        schedule_hashes[json.dumps(ident,separators=(',',':'))] = hashlib.sha256(json.dumps(schedule,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        assert schedule[0]['signal'] == source['start']
        for previous, following in zip(schedule, schedule[1:]):
            assert previous['next_signal'] == following['signal']
        for d in schedule:
            if d['status'] != 'missing-formation':
                assert d['selected'] == len(d['outcome_ids']) <= 10
                assert len(set(d['outcome_ids'])) == d['selected']
                assert all(json.loads(key)[1:] == [d['signal'],30] for key in d['outcome_ids'])
                if d['filled']:
                    assert d['next_signal'] == d['hard_exit_date']
            schedule_checks += 1
        for policy in POLICIES:
            row = lookup[ident+(policy,)]
            rebuilt[ident+(policy,)] = {}
            for mark in MARKS:
                replayed = reconstruct(schedule, outcomes, policy, mark)
                checkpoints += len(replayed['checkpoints'])
                if policy == 'FixedH':
                    same(replayed, source['scenarios'][mark])
                    fixed += 1
                del replayed['checkpoints']
                same(replayed, row['scenarios'][mark])
                rebuilt[ident+(policy,)][mark] = replayed
                comparisons += 1
    # Every published phase distribution is independently aggregated.
    aggregate_checks = 0
    for row in result_manifest['rows']:
        prefixes = [(row['view'],row['method'],row['scheduler'],i,row['policy']) for i in range(32)]
        assert row['paths'] == 32
        for mark in MARKS:
            xs = [rebuilt[key][mark] for key in prefixes]
            wealth = [x['terminal_wealth'] for x in xs]
            removed = [x['without_best_batch_wealth'] for x in xs]
            years = sorted({y for x in xs for y in x['annual_exit_returns']})
            expected = dict(min_wealth=min(wealth),median_wealth=st.median(wealth),max_wealth=max(wealth),
                profitable_paths=sum(x>1 for x in wealth),min_without_best_batch_wealth=min(removed),
                median_without_best_batch_wealth=st.median(removed),profitable_without_best_paths=sum(x>1 for x in removed),
                worst_exit_checkpoint_drawdown=min(x['exit_checkpoint_drawdown'] for x in xs),annual_exit_returns={})
            for year in years:
                values = [x['annual_exit_returns'].get(year,0.) for x in xs]
                expected['annual_exit_returns'][year] = dict(min=min(values),median=st.median(values),max=max(values),profitable_paths=sum(x>0 for x in values))
            same(expected,row['scenarios'][mark])
            aggregate_checks += 1
    assert len(result_manifest['rows']) == 216
    paired_checks = 0
    for row in result_manifest['paired']:
        prefix = row['view'],row['method'],row['scheduler']
        mark = row['scenario']
        deltas = [rebuilt[prefix+(i,row['policy'])][mark]['terminal_wealth']-rebuilt[prefix+(i,'FixedH')][mark]['terminal_wealth'] for i in range(32)]
        expected = dict(wins=sum(x>1e-12 for x in deltas),losses=sum(x < -1e-12 for x in deltas),ties=sum(abs(x)<=1e-12 for x in deltas),
            min_delta=min(deltas),median_delta=st.median(deltas),max_delta=max(deltas))
        same(expected,{k:row[k] for k in expected})
        paired_checks += 1
    assert paired_checks == 576 and fixed == 9216 and comparisons == 27648
    assert result_manifest['fixed_replay_parity'] == fixed
    result = dict(started_utc=started,completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(),status='passed',
        verifier_sha256=digest(Path(__file__)),source_hashes=result_manifest['hashes'],
        checked_ledger_sha256=result_manifest['ledger_sha256'],independent_scenario_paths=comparisons,
        original_fixed_scenario_parity=fixed,computed_checkpoints=checkpoints,original_schedule_decisions=schedule_checks,
        original_schedule_hashes=schedule_hashes,phase_distribution_checks=aggregate_checks,paired_phase_checks=paired_checks,
        scope='Executed-price slot returns; fixed original entry decisions; early proceeds held to hard deadline; all four costs/missing marks; annual returns, checkpoint drawdown, best-batch removal and 32-phase summaries.')
    with destination.open('x') as f:
        json.dump(result,f,indent=2,allow_nan=False)
    print(json.dumps({k:v for k,v in result.items() if k not in ['source_hashes','original_schedule_hashes']},indent=2))


if __name__ == '__main__':
    main()
