"""Frozen daily batch-capital replay; no policy fitting or phase selection."""
import collections
import datetime as dt
import gzip
import hashlib
import itertools
import json
import math
from pathlib import Path
import statistics as st
import sys

HERE = Path(__file__).resolve().parent
DAY = dt.timedelta(days=1)
SCENARIOS = ('net_zero', 'net_loss', 'net100_zero', 'net100_loss')
METHODS = ('Momentum', 'Breakout', 'VolumeBreakout')
VIEWS = (3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90)
END_SIGNAL = dt.date(2025, 12, 31)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cohort_key(c):
    return (c['signal'], c['view'], c['method'])


def make_schedule(cohorts, outcomes, view, method, start, end=END_SIGNAL,
                  scheduler='responsive'):
    """Only entry availability controls schedule; future exits/returns never do.

    Empty decisions release after today's signal. Failed orders release at entry
    open, not signal time. Any filled slot retains the batch until hard exit.
    Missing formation records advance a day under both frozen schedulers.
    """
    assert scheduler in ('responsive', 'scheduled')
    signal = start
    decisions = []
    while signal <= end:
        c = cohorts.get((signal.isoformat(), view, method))
        if c is None:
            decisions.append(dict(signal=signal.isoformat(), status='missing-formation',
                                  next_signal=(signal + DAY).isoformat()))
            signal += DAY
            continue
        assert c['holding'] == 30 and c['denominator'] == 10
        ids = c['outcome_ids']
        assert len(ids) <= 10 and len(ids) == len(set(ids))
        entry, hard_exit = signal + 2 * DAY, signal + 32 * DAY
        ps = [outcomes[k] for k in ids]
        for p in ps:
            assert p['entry_date'] == entry.isoformat()
            assert p['exit_date'] == hard_exit.isoformat()
        filled = sum(not p['entry_missing'] for p in ps)
        status = 'held' if filled else ('all-entries-missing' if ids else 'empty-selection')
        free = (hard_exit if scheduler == 'scheduled' or filled else
                entry if ids else signal + DAY)
        # Cash decisions have no trade P&L. A scheduled empty batch still records
        # the full reservation; failed orders' absence is known only at entry.
        decision = dict(signal=signal.isoformat(), status=status, selected=len(ids),
                        filled=filled, entry_date=entry.isoformat(),
                        hard_exit_date=hard_exit.isoformat(), next_signal=free.isoformat(),
                        knowledge_date=(entry if ids else signal).isoformat(),
                        outcome_ids=ids)
        decisions.append(decision)
        signal = free
    return decisions


def replay(schedule, scenario, returns_for_cohort):
    """Replay frozen entry decisions with caller-supplied batch returns.

    Alternate exits must keep proceeds as cash until each original hard deadline.
    Replacing returns cannot advance entries or select a new schedule.
    """
    wealth, highwater, worst_drawdown = 1., 1., 0.
    annual = collections.defaultdict(lambda: 1.)
    checkpoints = []
    known = []
    for d in schedule:
        if d['status'] == 'missing-formation':
            continue
        r = float(returns_for_cohort(d, scenario))
        assert math.isfinite(r) and r >= -1.
        if not d['filled']:
            assert r == 0., 'Unfilled batch must remain cash'
        # For a failed responsive order, zero return becomes known at its entry;
        # scheduled batches remain reserved until the hard deadline.
        exit_date = (d['hard_exit_date'] if d['filled'] else d['knowledge_date'])
        wealth *= 1. + r
        highwater = max(highwater, wealth)
        dd = wealth / highwater - 1.
        worst_drawdown = min(worst_drawdown, dd)
        annual[exit_date[:4]] *= 1. + r
        checkpoints.append(dict(signal=d['signal'], checkpoint_date=exit_date,
                                net_return=r, wealth=wealth, drawdown=dd))
        known.append(r)
    # Remove one best batch independently in each cost/mark scenario. Decisions
    # stay byte-identical; do not improve later entries or reallocate idle cash.
    best_index = max(range(len(known)), key=known.__getitem__) if known else None
    without_best = math.prod(1. + r for i, r in enumerate(known) if i != best_index)
    return dict(terminal_wealth=wealth, exit_checkpoint_drawdown=worst_drawdown,
                annual_exit_returns={y: f - 1. for y, f in sorted(annual.items())},
                best_batch_signal=checkpoints[best_index]['signal'] if best_index is not None else None,
                best_batch_return=known[best_index] if best_index is not None else None,
                without_best_batch_wealth=without_best,
                checkpoints=checkpoints)


def describe_schedule(schedule, start):
    counts = collections.Counter(d['status'] for d in schedule)
    trade_decisions = [d for d in schedule if d['status'] != 'missing-formation']
    selected = sum(d['selected'] for d in trade_decisions)
    filled = sum(d['filled'] for d in trade_decisions)
    weighted_exposure = sum(d['filled'] / 10 * 30 for d in trade_decisions)
    # Explicitly distinguish reserved capital (includes t -> t+2 order delay)
    # from observed filled-slot exposure at entry -> exit.
    reserved_days = sum((dt.date.fromisoformat(d['next_signal']) -
                         dt.date.fromisoformat(d['signal'])).days
                        for d in trade_decisions if d['selected'])
    scheduled_days = sum((dt.date.fromisoformat(d['next_signal']) -
                          dt.date.fromisoformat(d['signal'])).days
                         for d in trade_decisions)
    final_date = max([END_SIGNAL + DAY] + [dt.date.fromisoformat(d['hard_exit_date'])
                     for d in trade_decisions if d['filled']])
    elapsed = (final_date - start).days
    return dict(decisions=len(schedule), formations=len(trade_decisions),
                status_counts=dict(sorted(counts.items())), selected_positions=selected,
                filled_positions=filled, unfilled_positions=selected-filled,
                offered_slots=10*len(trade_decisions),
                unused_slots=10*len(trade_decisions)-selected,
                filled_slot_equivalent_days=weighted_exposure,
                elapsed_days_through_final_position=elapsed,
                filled_capital_time_fraction=weighted_exposure/elapsed if elapsed else 0.,
                selected_capital_reserved_days=reserved_days,
                all_decision_reserved_days=scheduled_days,
                final_position_or_sample_end=final_date.isoformat())


def summarize(paths):
    groups = collections.defaultdict(list)
    for p in paths:
        groups[p['view'], p['method'], p['scheduler']].append(p)
    rows = []
    for (view, method, scheduler), ps in sorted(groups.items()):
        assert sorted(p['offset'] for p in ps) == list(range(32))
        scenarios = {}
        for s in SCENARIOS:
            wealth = [p['scenarios'][s]['terminal_wealth'] for p in ps]
            removed = [p['scenarios'][s]['without_best_batch_wealth'] for p in ps]
            years = sorted({y for p in ps for y in p['scenarios'][s]['annual_exit_returns']})
            scenarios[s] = dict(min_wealth=min(wealth), median_wealth=st.median(wealth),
                max_wealth=max(wealth), profitable_paths=sum(w>1. for w in wealth),
                min_without_best_batch_wealth=min(removed),
                median_without_best_batch_wealth=st.median(removed),
                profitable_without_best_paths=sum(w>1. for w in removed),
                worst_exit_checkpoint_drawdown=min(p['scenarios'][s]['exit_checkpoint_drawdown'] for p in ps),
                annual_exit_returns={y:dict(
                    min=min(p['scenarios'][s]['annual_exit_returns'].get(y,0.) for p in ps),
                    median=st.median(p['scenarios'][s]['annual_exit_returns'].get(y,0.) for p in ps),
                    max=max(p['scenarios'][s]['annual_exit_returns'].get(y,0.) for p in ps),
                    profitable_paths=sum(p['scenarios'][s]['annual_exit_returns'].get(y,0.)>0 for p in ps)) for y in years})
        rows.append(dict(view=view, method=method, scheduler=scheduler, paths=len(ps),
                         scenarios=scenarios))
    lookup = {(p['view'],p['scheduler'],p['offset'],p['method']):p for p in paths}
    pairs = []
    for view in VIEWS:
        for scheduler in ('responsive', 'scheduled'):
            for a,b in itertools.combinations(METHODS,2):
                for s in SCENARIOS:
                    deltas = [lookup[view,scheduler,i,b]['scenarios'][s]['terminal_wealth'] -
                              lookup[view,scheduler,i,a]['scenarios'][s]['terminal_wealth'] for i in range(32)]
                    pairs.append(dict(view=view,scheduler=scheduler,baseline=a,candidate=b,
                        scenario=s,offsets=32,wins=sum(x>0 for x in deltas),losses=sum(x<0 for x in deltas),
                        ties=sum(x==0 for x in deltas),min_wealth_delta=min(deltas),
                        median_wealth_delta=st.median(deltas),max_wealth_delta=max(deltas),
                        offset_wealth_deltas=deltas))
    return rows, pairs


def selftest():
    def cohort(signal, ids):
        return dict(signal=signal, view=7, method='Breakout', holding=30,
                    denominator=10, outcome_ids=ids, **{s:.01*len(ids) for s in SCENARIOS})
    def outcome(signal, missing=False):
        day = dt.date.fromisoformat(signal)
        return dict(entry_date=(day+2*DAY).isoformat(), exit_date=(day+32*DAY).isoformat(),
                    entry_missing=missing, exit_price=100.)
    rows = [cohort('2023-12-28', []), cohort('2023-12-29', ['old-a']),
            cohort('2023-12-31', ['old-b','old-c']), cohort('2024-02-01', ['new-a'])]
    lookup = {cohort_key(c):c for c in rows}
    os = {'old-a':outcome('2023-12-29',True),
          'old-b':outcome('2023-12-31'), 'old-c':outcome('2023-12-31',True),
          'new-a':outcome('2024-02-01')}
    start, end = dt.date(2023,12,28),dt.date(2024,2,1)
    path = make_schedule(lookup,os,7,'Breakout',start,end)
    assert [d['signal'] for d in path] == ['2023-12-28','2023-12-29','2023-12-31','2024-02-01']
    assert path[1]['knowledge_date'] == '2023-12-31' and path[1]['next_signal'] == '2023-12-31'
    assert path[2]['outcome_ids'] == ['old-b','old-c'] and path[2]['next_signal'] == '2024-02-01'
    assert path[2]['filled'] == 1
    scheduled = make_schedule(lookup,os,7,'Breakout',start,end,scheduler='scheduled')
    assert scheduled[0]['next_signal'] == '2024-01-29'
    assert scheduled[1]['status'] == 'missing-formation'
    failed_scheduled = make_schedule(lookup,os,7,'Breakout',dt.date(2023,12,29),end,scheduler='scheduled')
    assert failed_scheduled[0]['status'] == 'all-entries-missing'
    assert failed_scheduled[0]['knowledge_date'] == '2023-12-31'
    assert failed_scheduled[0]['next_signal'] == '2024-01-30'
    original = json.dumps(path,sort_keys=True)
    for p in os.values():
        p['exit_price'] = -999999.
    for c in lookup.values():
        for s in SCENARIOS:
            c[s] = -.99
    assert json.dumps(make_schedule(lookup,os,7,'Breakout',start,end),sort_keys=True) == original
    returns = lambda d,s: .2 if d['filled'] and d['signal']=='2023-12-31' else -.1 if d['filled'] else 0.
    result = replay(path,'net_loss',returns)
    assert math.isclose(result['terminal_wealth'],1.08)
    assert math.isclose(result['annual_exit_returns']['2024'],.08)
    assert math.isclose(result['without_best_batch_wealth'],.9)
    assert math.isclose(result['exit_checkpoint_drawdown'],-.1)
    assert json.dumps(path,sort_keys=True) == original
    alternate = replay(path,'net_loss',lambda d,s: .5 if d['filled'] else 0.)
    assert math.isclose(alternate['terminal_wealth'],2.25)
    assert [d['signal'] for d in alternate['checkpoints']] == [d['signal'] for d in result['checkpoints']]
    assert replay([], 'net_zero', returns)['terminal_wealth'] == 1.


def main():
    selftest()
    if '--selftest' in sys.argv:
        print('Capital schedule: empty/missing entry knowledge, partial fill, year carry, future invariance, drawdown and frozen alternate-exit tests passed')
        return
    outputs = ['capital-summary.json','capital-ledger.json.gz']
    for name in outputs:
        if (HERE/name).exists():
            raise FileExistsError(name)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    source = HERE/'ledger.json.gz'
    manifest = json.loads((HERE/'summary.json').read_text())
    assert digest(source) == manifest['ledger_sha256']
    for relative, expected in manifest['hashes'].items():
        assert digest(HERE.parents[2]/relative) == expected, relative
    data = json.loads(gzip.decompress(source.read_bytes()))
    cohorts = {cohort_key(c):c for c in data['cohorts']}
    assert len(cohorts) == len(data['cohorts'])
    outcomes = data['outcomes']
    paths = []
    for view,method,scheduler,offset in itertools.product(VIEWS,METHODS,('responsive','scheduled'),range(32)):
        start = dt.date(2023,1,1) + offset*DAY
        decisions = make_schedule(cohorts,outcomes,view,method,start,scheduler=scheduler)
        def returns(d,s):
            return cohorts[d['signal'],view,method][s]
        scenarios = {s:replay(decisions,s,returns) for s in SCENARIOS}
        paths.append(dict(view=view,method=method,holding=30,scheduler=scheduler,offset=offset,
                          start=start.isoformat(),end_signal=END_SIGNAL.isoformat(),
                          schedule=decisions,exposure=describe_schedule(decisions,start),scenarios=scenarios))
    rows,pairs = summarize(paths)
    ledger = dict(paths=paths)
    raw = gzip.compress(json.dumps(ledger,separators=(',',':'),allow_nan=False).encode(),mtime=0)
    summary = dict(started_utc=started,completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        hashes={'capital.py':digest(HERE/'capital.py'),'protocol.md':digest(HERE/'protocol.md'),
                'source_ledger':digest(source),'source_summary':digest(HERE/'summary.json')},
        ledger_sha256=hashlib.sha256(raw).hexdigest(),counts=dict(paths=len(paths),
            decisions=sum(len(p['schedule']) for p in paths)),
        primary_scenario='net_loss',primary_scheduler='responsive',rows=rows,method_pairs=pairs,
        limitations=['Retrospective frozen candidate validation on preselected annual venue universe.',
            '2023-2025 signal window; late-2025 positions exit in 2026 using original cohort identities.',
            'Drawdown observed only at execution checkpoints, not mark-to-market intraperiod.',
            'All 32 phases reported; no best phase, scheduler or strategy is selected.',
            'Alternate exits must replay fixed schedules and retain cash through original deadlines.'])
    with (HERE/'capital-ledger.json.gz').open('xb') as f:
        f.write(raw)
    with (HERE/'capital-summary.json').open('x') as f:
        json.dump(summary,f,indent=2,allow_nan=False)
        f.write('\n')
    print(json.dumps({k:summary[k] for k in ['completed_utc','counts','ledger_sha256']}))


if __name__ == '__main__':
    main()
