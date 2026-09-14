"""Post-result fixed initial-date robustness; no fitting or selection changes."""
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('frozen_indicator_selector', HERE / 'selector.py')
selector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selector)


def omit_best(path, scenario):
    executed = [p for p in path if 'returns' in p]
    if not executed:
        return dict(signal=None, cohort_return=None, terminal_wealth=1.0)
    selected = max(range(len(executed)), key=lambda i: executed[i]['returns'][scenario])
    wealth = 1.0
    for i, position in enumerate(executed):
        if i != selected:
            wealth *= 1 + position['returns'][scenario]
    return dict(signal=executed[selected]['signal'],
                cohort_return=executed[selected]['returns'][scenario], terminal_wealth=wealth)


def selftest():
    def event(signal, value):
        return dict(signal=signal, returns={s: value for s in selector.SCENARIOS})
    path = [event('2023-01-01', -1), event('2023-02-01', -1)]
    assert omit_best(path, 'net_loss')['terminal_wealth'] == 0
    assert omit_best(path, 'net_loss')['signal'] == '2023-01-01'
    assert omit_best(path[:1], 'net_loss')['terminal_wealth'] == 1
    path = [event('2023-01-01', .5), event('2023-02-01', .2)]
    assert math.isclose(omit_best(path, 'net_loss')['terminal_wealth'], 1.2)
    assert omit_best([], 'net_loss')['signal'] is None


def main():
    selftest()
    target = HERE / 'selection-sensitivity.json'
    if target.exists():
        raise SystemExit('Refusing to overwrite sensitivity output')
    source_files = ['ledger.json.gz', 'summary.json', 'selection.json',
                    'selection-ledger.json.gz', 'selector.py', 'selection-sensitivity.py',
                    'protocol.md', 'sensitivity-protocol.md']
    hashes = {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in source_files}
    primary = json.loads((HERE / 'selection.json').read_text())
    main_summary = json.loads((HERE / 'summary.json').read_text())
    assert hashes['ledger.json.gz'] == main_summary['ledger_sha256']
    assert hashes['selection-ledger.json.gz'] == primary['selection_ledger_sha256']
    for name, value in primary['hashes'].items():
        assert hashlib.sha256((HERE / name).read_bytes()).hexdigest() == value
    source = json.loads(gzip.decompress((HERE / 'ledger.json.gz').read_bytes()))
    grids = {}
    for row in source['cohorts']:
        if row['method'] not in selector.METHODS or row['holding'] not in selector.HOLDINGS:
            continue
        if not 2023 <= selector.day(row['signal']).year <= 2025:
            continue
        available = grids.setdefault(row['view'], {}).setdefault(row['signal'], {})
        key = (row['method'], row['holding'])
        assert key not in available
        available[key] = row
    expected = {(m, h) for m in selector.METHODS for h in selector.HOLDINGS}
    assert len(grids) == 12
    assert all(set(a) == expected for rows in grids.values() for a in rows.values())
    frozen_choices = {}
    for fit in primary['annual_fits']:
        chosen = fit['choice']
        frozen_choices.setdefault(fit['view'], {})[fit['year']] = (
            None if chosen is None else (chosen['method'], chosen['holding']))
    originals = {(e['view'], e['policy'], e.get('holding')): e for e in primary['evaluations']}
    reports = []
    phase0_count = 0
    executions_checked = 0
    for offset in (0, 28, 56):
        initial_day = dt.date(2023, 1, 1) + offset * selector.DAY
        for view, grid in sorted(grids.items()):
            rows = {s: available for s, available in grid.items() if selector.day(s) >= initial_day}
            policies = [('AnnualSelector', None), ('Cash', None)] + [
                (m, h) for m in selector.METHODS for h in selector.HOLDINGS]
            for policy, holding in policies:
                kwargs = {'choices': frozen_choices[view]} if policy == 'AnnualSelector' else (
                    {} if policy == 'Cash' else {'fixed': (policy, holding)})
                result = selector.replay(rows, **kwargs)
                compact = dict(view=view, policy=policy,
                               **({} if holding is None else {'holding': holding}),
                               **{k: v for k, v in result.items() if k != 'path'})
                if offset == 0:
                    assert compact == originals[(view, policy, holding)]
                    phase0_count += 1
                executed = [p for p in result['path'] if 'hard_exit' in p]
                assert all(selector.day(p['signal']) >= initial_day for p in result['path'])
                assert all(selector.day(p['signal']) >= selector.day(q['hard_exit'])
                           for q, p in zip(executed, executed[1:]))
                assert all(p['denominator'] == 10 and len(p['outcome_ids']) <= 10 for p in executed)
                assert all(p['hard_exit'] < primary['calendar_end'] for p in executed)
                for p in executed:
                    original = grid[p['signal']][(p['method'], p['holding'])]
                    assert p['outcome_ids'] == original['outcome_ids']
                    assert p['returns'] == {s: original[s] for s in selector.SCENARIOS}
                executions_checked += len(executed)
                reports.append(dict(initial_offset_days=offset, initial_available=initial_day.isoformat(),
                                    **compact, executed_signals=[p['signal'] for p in executed],
                                    omit_best_cohort={s: omit_best(result['path'], s)
                                                      for s in selector.SCENARIOS}))
    assert phase0_count == 384 and len(reports) == 1152
    output = dict(status='post-result-descriptive-phase-and-concentration-sensitivity',
                  completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(), hashes=hashes,
                  calendar_end=primary['calendar_end'], selftests='passed',
                  phase0_exact_summary_matches=phase0_count,
                  checked_execution_records=executions_checked, results=reports)
    with target.open('x') as f:
        json.dump(output, f, indent=2, allow_nan=False)
        f.write('\n')
    print(json.dumps(dict(results=len(reports), phase0_matches=phase0_count,
                          checked_execution_records=executions_checked,
                          output_sha256=hashlib.sha256(target.read_bytes()).hexdigest())))


if __name__ == '__main__':
    main()
