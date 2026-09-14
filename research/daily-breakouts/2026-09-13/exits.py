"""Frozen level-exit policies paired to the daily breakout selections."""
import collections
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import statistics as st
import sys
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FROZEN = ROOT / 'research/sell-zones/2026-09-13'
manifest = json.loads((FROZEN/'summary.json').read_text())
for path in [FROZEN/'run.py', ROOT/'research/algorithm-comparison/high-flier-runner.py']:
    assert hashlib.sha256(path.read_bytes()).hexdigest() == manifest['hashes'][str(path.relative_to(ROOT))]
spec = importlib.util.spec_from_file_location('daily_frozen_exits', FROZEN/'run.py')
sz = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sz)
hf, DAY, POLICIES = sz.hf, sz.DAY, sz.POLICIES
MARKS = ('net_zero', 'net_loss', 'net100_zero', 'net100_loss')


def level_index(panel):
    result = {}
    for identity, bars in panel.items():
        atr = hf.atr14_by_date(bars)
        index = {b.date: b for b in bars}
        for bar in bars:
            previous = [index.get(bar.date-i*DAY) for i in range(1, 21)]
            resistance = max(b.high for b in previous) if all(b is not None and hf.bar_is_complete(b) for b in previous) else None
            result[(identity, bar.date)] = atr.get(bar.date), resistance
    return result


def add_cost_stress(outcome):
    out = dict(outcome)
    if out['status'] == 'missing_entry':
        out.update(net100_zero=0., net100_loss=0.)
    elif out['status'] == 'known':
        net = out['exit_price']/out['entry_price']*.99/1.01-1
        out.update(net100_zero=net, net100_loss=net)
    else:
        out.update(net100_zero=.99/1.01-1, net100_loss=-1.)
    return out


def verify_level(index, signal, actual):
    """Rebuild the frozen geometry from calendar-indexed raw bars."""
    recent = [index.get(signal-i*DAY) for i in range(15)]
    if all(b is not None and hf.bar_is_complete(b) for b in recent):
        atr = sum(max(recent[i].high-recent[i].low,
                      abs(recent[i].high-recent[i+1].close),
                      abs(recent[i].low-recent[i+1].close)) for i in range(14))/14
    else:
        atr = None
    prior = [index.get(signal-i*DAY) for i in range(1, 21)]
    resistance = max(b.high for b in prior) if all(b is not None and hf.bar_is_complete(b) for b in prior) else None
    assert actual[1] == resistance
    assert (actual[0] is None and atr is None) or (actual[0] is not None and atr is not None and abs(actual[0]-atr) <= 1e-12*max(1.,abs(atr)))


def replay(index, signal, holding, policy, atr, resistance, got):
    """Independent chronology/return/label checks; never call evaluate."""
    entry_day = signal+2*DAY
    hard = entry_day+holding*DAY
    entry = index.get(entry_day)
    if entry is None or not hf.bar_open_is_executable(entry):
        assert got['status'] == 'missing_entry'
        assert all(got[m] == 0 for m in MARKS)
        return
    target = entry.open+3*atr if atr is not None else None
    stop = max(0., entry.open-2*atr) if atr is not None else None
    if policy == 'ResistanceSMAATR':
        if resistance is None:
            target = None
        elif target is not None and resistance > entry.open:
            target = min(resistance, target)
    unknown = policy != 'FixedH' and (atr is None or (policy == 'ResistanceSMAATR' and resistance is None))
    trigger, exit_day, reason = None, hard, 'hard'
    if policy != 'FixedH':
        assert got['target'] == target and got['stop'] == stop
        path = [index.get(entry_day+i*DAY) for i in range(holding)]
        complete = all(b is not None and hf.bar_is_complete(b) for b in path)
        assert got['full_horizon_path_complete'] == complete
        for label, level in [('target_reach', target), ('stop_reach', stop)]:
            if level is None:
                expected = None
            else:
                known = [b for b in path if b is not None and hf.bar_is_complete(b)]
                reached = any((b.high >= level if label == 'target_reach' else b.low <= level) for b in known)
                expected = True if reached else False if complete else None
            assert got[label] == expected
        if not unknown:
            for i in range(holding-1):
                day = entry_day+i*DAY
                b = index.get(day)
                if b is None or not hf.bar_is_complete(b):
                    unknown = True
                    break
                if b.close >= target or b.close <= stop:
                    trigger = day.isoformat()
                    exit_day = min(day+2*DAY, hard)
                    reason = 'target' if b.close >= target else 'stop'
                    break
    assert got['trigger_date'] == trigger
    exit_bar = index.get(exit_day)
    status = 'unknown_trigger_order' if unknown else 'missing_exit' if exit_bar is None or not hf.bar_open_is_executable(exit_bar) else 'known'
    assert got['status'] == status
    assert got['reason'] == ('unknown' if unknown else reason)
    if status == 'known':
        assert got['exit_date'] == exit_day.isoformat()
        assert got['exit_price'] == exit_bar.open
        assert got['duration'] == (exit_day-entry_day).days
        gross_multiplier = exit_bar.open/entry.open
    else:
        gross_multiplier = 1.
        assert got['exit_date'] is None and got['known_net'] is None
    for bps, prefix in [(50, 'net'), (100, 'net100')]:
        fee = bps/10000
        zero = gross_multiplier*(1-fee)/(1+fee)-1
        loss = zero if status == 'known' else -1.
        assert abs(got[prefix+'_zero']-zero) < 1e-12
        assert abs(got[prefix+'_loss']-loss) < 1e-12


def selftest():
    suite = unittest.defaultTestLoader.discover(str(FROZEN), pattern='test_run.py')
    assert unittest.TextTestRunner().run(suite).wasSuccessful()
    signal = dt.date(2020, 2, 1)
    def bar(offset, close=100., high=101.):
        return hf.Bar(symbol='X', date=signal+offset*DAY, open=100., high=max(high, close), low=min(99., close), close=close, quote_volume=1e7, cohort_member=True)
    bars = [bar(i) for i in range(-30, 33)]
    before = level_index({'X': bars[:31]})[('X', signal)]
    assert before == (2., 101.)
    assert level_index({'X': bars})[('X', signal)] == before
    missing = [b for b in bars if b.date != signal-10*DAY]
    assert level_index({'X': missing})[('X', signal)] == (None, None)
    verify_level({b.date:b for b in bars}, signal, before)
    verify_level({b.date:b for b in missing}, signal, (None, None))
    index = {b.date:b for b in bars}
    index[signal+2*DAY] = bar(2, close=140., high=140.)
    del index[signal+3*DAY]  # Gap after a known trigger cannot invalidate its fill.
    for policy in POLICIES:
        for atr, resistance in [(10., 200.), (None, 200.), (10., None)]:
            out = add_cost_stress(sz.evaluate(index, signal, 30, policy, atr, resistance))
            replay(index, signal, 30, policy, atr, resistance, out)
            if policy != 'FixedH' and atr is not None and (policy != 'ResistanceSMAATR' or resistance is not None):
                assert out['status'] == 'known' and out['duration'] == 2
    for index in [{}, {signal+2*DAY:bar(2)}]:
        for policy in POLICIES:
            out = add_cost_stress(sz.evaluate(index, signal, 30, policy, 10., 200.))
            replay(index, signal, 30, policy, 10., 200., out)


def summarize(cohorts, outcomes):
    groups = collections.defaultdict(list)
    for row in cohorts:
        for period in ['all', str(row['year']), '2020-2022' if row['year'] < 2023 else '2023-2025']:
            groups[(row['view'], row['method'], period)].append(row)
    results = []
    for (view, method, period), rows in sorted(groups.items()):
        for policy in POLICIES:
            positions = [outcomes[key][policy] for row in rows for key in row['outcome_ids']]
            deltas = [r['returns'][policy]['net_zero']-r['returns']['FixedH']['net_zero'] for r in rows]
            results.append(dict(view=view, holding=30, method=method, period=period, policy=policy,
                cohorts=len(rows), selected=len(positions),
                **{'mean_'+m:st.mean(r['returns'][policy][m] for r in rows) for m in MARKS},
                **{'paired_delta_'+m:st.mean(r['returns'][policy][m]-r['returns']['FixedH'][m] for r in rows) for m in MARKS},
                paired_median_delta_zero=st.median(deltas), paired_wins=sum(d>0 for d in deltas), paired_losses=sum(d<0 for d in deltas),
                paired_without_best_delta_zero=(sum(deltas)-max(deltas))/(len(deltas)-1) if len(deltas)>1 else None,
                reason_counts=dict(collections.Counter(p['reason'] for p in positions)),
                status_counts=dict(collections.Counter(p['status'] for p in positions)),
                target_reach_counts=dict(collections.Counter(str(p['target_reach']) for p in positions)),
                stop_reach_counts=dict(collections.Counter(str(p['stop_reach']) for p in positions)),
                mean_known_duration=st.mean(p['duration'] for p in positions if p['duration'] is not None) if any(p['duration'] is not None for p in positions) else None))
    return results


def main():
    if '--self-test' in sys.argv:
        selftest()
        return
    for name in ['exit-summary.json', 'exit-ledger.json.gz']:
        if (HERE/name).exists():
            raise SystemExit('Refusing to overwrite frozen '+name)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    selftest()
    source_manifest = json.loads((HERE/'summary.json').read_text())
    source_bytes = (HERE/'ledger.json.gz').read_bytes()
    assert hashlib.sha256(source_bytes).hexdigest() == source_manifest['ledger_sha256']
    source = json.loads(gzip.decompress(source_bytes))
    # Exit replay needs saved selections, not the full daily scoring matrix.
    source.pop('formations', None)
    _, _, members, raw, provenance = hf.load_frozen_dataset(sz.HELPER.parent/'high-flier-data/final')
    panel = hf.read_panel_csv(raw, hf.read_membership_csv(members))
    _, by_date = hf.panel_indexes(panel)
    cached = level_index(panel)
    outcomes, cohorts = {}, []
    level_checks = parity = replay_checks = 0
    keys = sorted(source['outcomes'])
    sampled = set(keys[::max(1, len(keys)//200)])
    for key in keys:
        identity, signal_text, holding = json.loads(key)
        signal = dt.date.fromisoformat(signal_text)
        atr, resistance = cached.get((identity, signal), (None, None))
        if key in sampled:
            assert (atr, resistance) == sz.levels(panel[identity], signal)
            verify_level(by_date[identity], signal, (atr, resistance))
            level_checks += 1
        outcomes[key] = {}
        for policy in POLICIES:
            out = add_cost_stress(sz.evaluate(by_date[identity], signal, holding, policy, atr, resistance))
            replay(by_date[identity], signal, holding, policy, atr, resistance, out)
            replay_checks += 1
            outcomes[key][policy] = out
        for mark in MARKS:
            assert abs(outcomes[key]['FixedH'][mark]-source['outcomes'][key][mark]) < 1e-12, (key, mark)
            parity += 1
    for row in source['cohorts']:
        returns = {policy:{mark:sum(outcomes[k][policy][mark] for k in row['outcome_ids'])/row['denominator'] for mark in MARKS} for policy in POLICIES}
        for mark in MARKS:
            assert abs(returns['FixedH'][mark]-row[mark]) < 1e-12
            parity += 1
        cohorts.append({**{k:row[k] for k in ['year','signal','view','holding','method','denominator','outcome_ids']}, 'returns':returns})
    payload = gzip.compress(json.dumps(dict(cohorts=cohorts,outcomes=outcomes), separators=(',',':'), allow_nan=False).encode(), mtime=0)
    with (HERE/'exit-ledger.json.gz').open('xb') as f:
        f.write(payload)
    hash_paths = [Path(__file__), HERE/'exits-protocol.md', HERE/'summary.json', HERE/'ledger.json.gz', FROZEN/'run.py', FROZEN/'summary.json', FROZEN/'test_run.py', sz.HELPER]
    summary = dict(started_utc=started, completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        status='retrospective-exploratory-no-automatic-promotion', policies=POLICIES, marks=MARKS,
        cohorts=len(cohorts), unique_selected_outcomes=len(outcomes), fixed_mark_parity_checks=parity,
        independent_exit_replays=replay_checks, original_prefix_level_checks=level_checks,
        ledger_sha256=hashlib.sha256(payload).hexdigest(),
        hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in hash_paths}, provenance=provenance,
        summaries=summarize(cohorts,outcomes))
    with (HERE/'exit-summary.json').open('x') as f:
        json.dump(summary, f, indent=2, allow_nan=False)
    print(json.dumps({k:v for k,v in summary.items() if k not in ['summaries','provenance','hashes']}, indent=2))


if __name__ == '__main__':
    main()
