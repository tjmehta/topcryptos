"""Predeclared offline, entry-paired level exit study; see protocol.md."""
import collections
import datetime as dt
import functools
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import statistics as st
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / 'research/holding-horizons'
HELPER = ROOT / 'research/algorithm-comparison/high-flier-runner.py'
spec = importlib.util.spec_from_file_location('sell_zone_frozen', HELPER)
hf = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = hf
spec.loader.exec_module(hf)
DAY = dt.timedelta(days=1)
POLICIES = ('FixedH', 'SMAATRBracket', 'ResistanceSMAATR')


def levels(bars, signal):
    past = [b for b in bars if b.date <= signal]
    atr = hf.atr14_by_date(past).get(signal)
    index = {b.date: b for b in past}
    previous = [index.get(signal - i * DAY) for i in range(1, 21)]
    resistance = max(b.high for b in previous) if all(b is not None and hf.bar_is_complete(b) for b in previous) else None
    return atr, resistance


def evaluate(index, signal, holding, policy, atr, resistance):
    entry_day = signal + 2 * DAY
    hard = entry_day + holding * DAY
    entry = index.get(entry_day)
    result = dict(entry_date=entry_day.isoformat(), hard_exit_date=hard.isoformat(),
                  level_source_date=signal.isoformat(), atr_sma14=atr, prior20_resistance=resistance,
                  status='missing_entry', reason='missing_entry', entry_price=None,
                  target=None, stop=None, target_return=None, stop_return=None,
                  trigger_date=None, exit_date=None, exit_price=None, duration=None,
                  known_net=None, net_zero=0., net_loss=0., target_reach=None, stop_reach=None,
                  full_horizon_path_complete=None)
    if entry is None or not hf.bar_open_is_executable(entry):
        return result
    result['entry_price'] = entry.open
    target = entry.open + 3 * atr if atr is not None else None
    stop = max(0., entry.open - 2 * atr) if atr is not None else None
    if policy == 'ResistanceSMAATR' and resistance is not None and target is not None and resistance > entry.open:
        target = min(resistance, target)
    if policy != 'FixedH':
        result.update(target=target, stop=stop,
                      target_return=target/entry.open-1 if target is not None else None,
                      stop_return=stop/entry.open-1 if stop is not None else None)
        path = [index.get(entry_day + i * DAY) for i in range(holding)]
        complete = all(b is not None and hf.bar_is_complete(b) for b in path)
        result['full_horizon_path_complete'] = complete
        known = [b for b in path if b is not None and hf.bar_is_complete(b)]
        for label, threshold, hit in [('target_reach', target, lambda b: b.high >= target),
                                     ('stop_reach', stop, lambda b: b.low <= stop)]:
            if threshold is not None:
                reached = any(hit(b) for b in known)
                result[label] = True if reached else False if complete else None
    exit_day, reason = hard, 'hard'
    unknown = policy != 'FixedH' and (atr is None or (policy == 'ResistanceSMAATR' and resistance is None))
    if not unknown and policy != 'FixedH':
        for offset in range(holding - 1):
            date = entry_day + offset * DAY
            bar = index.get(date)
            if bar is None or not hf.bar_is_complete(bar):
                unknown = True
                break
            if bar.close >= target or bar.close <= stop:
                reason = 'target' if bar.close >= target else 'stop'
                result['trigger_date'] = date.isoformat()
                exit_day = min(date + 2 * DAY, hard)
                break
    exit_bar = index.get(exit_day)
    result.update(net_zero=hf.net_return_from_gross(0., 50), net_loss=-1.)
    if unknown:
        result.update(status='unknown_trigger_order', reason='unknown')
    elif exit_bar is None or not hf.bar_open_is_executable(exit_bar):
        result.update(status='missing_exit', reason=reason)
    else:
        net = hf.exact_unit_return(entry.open, exit_bar.open, 50)
        result.update(status='known', reason=reason, exit_date=exit_day.isoformat(),
                      exit_price=exit_bar.open, duration=(exit_day-entry_day).days,
                      known_net=net, net_zero=net, net_loss=net)
    return result


def average(values):
    return st.mean(values) if values else None


def summarize(cohorts, outcomes):
    groups = collections.defaultdict(list)
    for row in cohorts:
        for period in ['all', str(row['year']), '2020-2022' if row['year'] < 2023 else '2023-2025']:
            groups[(row['view'], row['holding'], row['method'], period)].append(row)
    summaries = []
    for (view, holding, method, period), rows in sorted(groups.items()):
        for policy in POLICIES:
            positions = [outcomes[key][policy] for row in rows for key in row['outcome_ids']]
            delta = [row['returns'][policy]['net_zero']-row['returns']['FixedH']['net_zero'] for row in rows]
            summaries.append(dict(view=view, holding=holding, method=method, period=period, policy=policy,
                cohorts=len(rows), selected=len(positions),
                mean_net_zero=average([r['returns'][policy]['net_zero'] for r in rows]),
                mean_net_loss=average([r['returns'][policy]['net_loss'] for r in rows]),
                paired_delta_zero=average(delta),
                paired_delta_loss=average([r['returns'][policy]['net_loss']-r['returns']['FixedH']['net_loss'] for r in rows]),
                paired_wins=sum(x>0 for x in delta), paired_losses=sum(x<0 for x in delta),
                reason_counts=dict(collections.Counter(p['reason'] for p in positions)),
                status_counts=dict(collections.Counter(p['status'] for p in positions)),
                mean_duration=average([p['duration'] for p in positions if p['duration'] is not None]),
                target_reach_counts=dict(collections.Counter(str(p['target_reach']) for p in positions)),
                stop_reach_counts=dict(collections.Counter(str(p['stop_reach']) for p in positions))))
    return summaries


def independently_verify(outcomes, by_date):
    # Independent execution scan: do not call evaluate; chronological candidate list.
    checked = 0
    chosen = list(sorted(outcomes))[::max(1, len(outcomes)//120)]
    for key in chosen:
        identity, signal, hold = json.loads(key)
        signal, hold = dt.date.fromisoformat(signal), int(hold)
        index = by_date[identity]
        entry_day, hard = signal+2*DAY, signal+(2+hold)*DAY
        for policy, got in outcomes[key].items():
            if got['status'] != 'known':
                continue
            expected_day = hard
            if policy != 'FixedH':
                for offset in range(hold-1):
                    d = entry_day+offset*DAY
                    assert d in index and hf.bar_is_complete(index[d])
                    if index[d].close >= got['target'] or index[d].close <= got['stop']:
                        expected_day = d+2*DAY
                        break
            expected = (index[expected_day].open/index[entry_day].open)*.995/1.005-1
            assert got['exit_date'] == expected_day.isoformat()
            assert abs(got['known_net']-expected) < 1e-12
            checked += 1
    return checked


def main():
    if any((HERE/name).exists() for name in ['summary.json', 'ledger.json.gz']):
        raise SystemExit('Refusing to overwrite frozen results')
    import unittest
    suite = unittest.defaultTestLoader.discover(str(HERE), pattern='test_run.py')
    if not unittest.TextTestRunner().run(suite).wasSuccessful():
        raise SystemExit('Synthetic tests failed')
    manifest, _, members, raw, provenance = hf.load_frozen_dataset(HELPER.parent/'high-flier-data/final')
    panel = hf.read_panel_csv(raw, hf.read_membership_csv(members))
    _, by_date = hf.panel_indexes(panel)
    source_rows = json.loads(gzip.decompress((SOURCE/'cohorts.json.gz').read_bytes()))
    rows = [r for r in source_rows if r['method'] in ['Momentum', 'TrendQuality'] and r['holding'] in [14,30,60,90]]
    outcomes, cohorts = {}, []
    @functools.lru_cache(None)
    def frozen_levels(identity, signal):
        return levels(panel[identity], signal)
    parity = 0
    for r in rows:
        ids = []
        signal = dt.date.fromisoformat(r['signal'])
        for p in r['positions']:
            key = json.dumps([p['id'], r['signal'], r['holding']], separators=(',', ':'))
            if key not in outcomes:
                atr, resistance = frozen_levels(p['id'], signal)
                outcomes[key] = {policy: evaluate(by_date[p['id']], signal, r['holding'], policy, atr, resistance) for policy in POLICIES}
            for scenario in ['net_zero','net_loss']:
                assert abs(outcomes[key]['FixedH'][scenario]-p[scenario]) < 1e-12
            parity += 1
            ids.append(key)
        returns = {policy: {scenario:sum(outcomes[key][policy][scenario] for key in ids)/r['denominator']
                              for scenario in ['net_zero','net_loss']} for policy in POLICIES}
        cohorts.append({**{k:r[k] for k in ['year','anchor','signal','view','holding','method','denominator']},
                        'outcome_ids':ids, 'returns':returns})
    verification = independently_verify(outcomes, by_date)
    hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in
              [Path(__file__), HERE/'protocol.md', HERE/'test_run.py', HELPER, SOURCE/'cohorts.json.gz', SOURCE/'summary.json']}
    ledger = dict(cohorts=cohorts, outcomes=outcomes)
    with (HERE/'ledger.json.gz').open('xb') as f:
        f.write(gzip.compress(json.dumps(ledger,separators=(',', ':'),allow_nan=False).encode(),mtime=0))
    summary = dict(created_utc=dt.datetime.now(dt.timezone.utc).isoformat(), status='exploratory-no-automatic-promotion',
                   hashes=hashes, provenance=provenance, cohorts=len(cohorts), distinct_entry_horizons=len(outcomes),
                   policies=POLICIES, fixed_position_parity_checks=parity, independent_replay_checks=verification,
                   ledger_sha256=hashlib.sha256((HERE/'ledger.json.gz').read_bytes()).hexdigest(),
                   summaries=summarize(cohorts,outcomes))
    with (HERE/'summary.json').open('x') as f:
        json.dump(summary,f,indent=2,allow_nan=False)
    print(json.dumps({k:v for k,v in summary.items() if k not in ['hashes','provenance','summaries']},indent=2))


if __name__ == '__main__':
    main()
