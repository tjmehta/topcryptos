"""Independent initial-date and concentration verification; no experiment imports."""
import collections
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Reuse only our independently authored binary-search/prefix-product verifier.
spec = importlib.util.spec_from_file_location('independent_selection_verifier', HERE / 'verify-selection.py')
independent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(independent)


def main():
    target = HERE / 'sensitivity-verification.json'
    if target.exists():
        raise SystemExit('Refusing to overwrite verification report')
    source_names = ['ledger.json.gz', 'summary.json', 'selection.json', 'selection-ledger.json.gz',
                    'selector.py', 'selection-sensitivity.py', 'selection-sensitivity.json',
                    'protocol.md', 'sensitivity-protocol.md', 'verify-selection.py',
                    'selection-verification.json', Path(__file__).name]
    hashes = {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in source_names}
    primary = json.loads((HERE / 'selection.json').read_text())
    prior_verification = json.loads((HERE / 'selection-verification.json').read_text())
    saved = json.loads((HERE / 'selection-sensitivity.json').read_text())
    base = json.loads(gzip.decompress((HERE / 'ledger.json.gz').read_bytes()))
    for name, digest in saved['hashes'].items():
        assert hashes[name] == digest, name
    for name in ['ledger.json.gz', 'selection.json', 'selection-ledger.json.gz', 'selector.py', 'verify-selection.py']:
        assert hashes[name] == prior_verification['hashes'][name], name
    assert prior_verification['status'] == 'passed'
    assert saved['calendar_end'] == primary['calendar_end'] == '2026-03-01'

    grids = {view: {} for view in independent.VIEWS}
    for row in base['cohorts']:
        if row['method'] in independent.METHODS and row['holding'] in independent.HOLDS and 2023 <= row['year'] <= 2025:
            assert row['denominator'] == 10
            grids[row['view']][row['signal'], row['method'], row['holding']] = row
    annual = {view: {} for view in independent.VIEWS}
    for fit in primary['annual_fits']:
        choice = fit['choice']
        annual[fit['view']][fit['year']] = None if choice is None else (choice['method'], choice['holding'])
    originals = {(r['view'], r['policy'], r.get('holding')): r for r in primary['evaluations']}
    lookup = {(r['initial_offset_days'], r['view'], r['policy'], r.get('holding')): r for r in saved['results']}
    assert len(lookup) == len(saved['results']) == 1152
    counts = collections.Counter()
    later_schedules = collections.defaultdict(dict)
    for offset in [0, 28, 56]:
        initial = dt.date(2023, 1, 1).toordinal() + offset
        for view, grid in grids.items():
            signals = sorted({key[0] for key in grid if independent.ordinal(key[0]) >= initial})
            assert independent.ordinal(signals[0]) >= initial  # Some long views lack initial formation history.
            policies = [('AnnualSelector', None), ('Cash', None)]
            policies += [(method, holding) for method in independent.METHODS for holding in independent.HOLDS]
            for method, holding in policies:
                fixed = (method, holding) if holding is not None else None
                choices = annual[view] if method == 'AnnualSelector' else None
                rebuilt = independent.reconstructed_path(signals, grid, annual=choices, fixed=fixed)
                compact = dict(view=view, policy=method,
                               **{k: v for k, v in rebuilt.items() if k != 'path'})
                if holding is not None:
                    compact['holding'] = holding
                actual = lookup[offset, view, method, holding]
                if offset == 0:
                    # Exact comparison of saved phase-zero and saved primary values.
                    assert {k: actual[k] for k in compact} == originals[view, method, holding]
                    counts['phase_zero_exact_primary_matches'] += 1
                positions = [r for r in rebuilt['path'] if 'hard_exit' in r]
                assert all(independent.ordinal(r['signal']) >= initial for r in positions)
                assert all(r['hard_exit'] < primary['calendar_end'] for r in positions)
                executed_signals = [r['signal'] for r in positions]
                later_schedules[view, method, holding][offset] = tuple(s for s in executed_signals if s >= '2024-01-01')
                omissions = {}
                for scenario in independent.SCENARIOS:
                    if positions:
                        # Explicit return/chronology sort gives earliest execution on ties.
                        best = sorted(positions, key=lambda r: (-r['returns'][scenario], r['signal']))[0]
                        other_factors = [1 + r['returns'][scenario] for r in positions if r['signal'] != best['signal']]
                        omissions[scenario] = dict(signal=best['signal'], cohort_return=best['returns'][scenario],
                                                   terminal_wealth=math.prod(other_factors))
                        counts['omitted_best_scenario_paths'] += 1
                    else:
                        omissions[scenario] = dict(signal=None, cohort_return=None, terminal_wealth=1.)
                        counts['empty_cash_scenario_paths'] += 1
                expected = dict(initial_offset_days=offset, initial_available=independent.iso(initial),
                                **compact, executed_signals=executed_signals, omit_best_cohort=omissions)
                independent.same(actual, expected, f'sensitivity {offset} {view} {method} {holding}')
                counts['verified_paths'] += 1
                counts['executed_records'] += len(positions)
    assert counts['phase_zero_exact_primary_matches'] == saved['phase0_exact_summary_matches'] == 384
    assert counts['executed_records'] == saved['checked_execution_records'] == 24318
    aligned = sum(len(set(phases.values())) == 1 for phases in later_schedules.values())
    counts['policies_with_identical_2024_onward_execution_dates_across_all_phases'] = aligned
    counts['policies_compared_for_later_alignment'] = len(later_schedules)
    counts['compared_values'] = independent.CHECKS['compared_values']
    report = dict(status='passed', verified_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
                  hashes=hashes, counts=dict(counts),
                  scope='All 1152 initial-date sensitivity outputs independently replayed from frozen main cohorts '
                  'and previously verified annual choices, with no training or source implementation imports. '
                  'All four cost/missing scenarios, initial cutoffs, scheduled signal IDs, wealth, annual returns, '
                  'drawdown and schedule-preserving best-cohort omission arithmetic matched.',
                  source_review='selection-sensitivity.py invokes replay with original annual choices; '
                  'there is no fitting, parameter selection or shifted full signal-calendar generation.',
                  limitations='These offsets delay only initial capital availability on the existing calendar. '
                  'They do not shift every yearly alert date and do not test daily alerts. '
                  f'{aligned} of {len(later_schedules)} policies have identical execution dates from 2024 onward '
                  'across all initial offsets, so this is a limited initial-date concentration check, '
                  'not independent calendar-phase or out-of-sample evidence.')
    with target.open('x') as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
        handle.write('\n')
    print(json.dumps(dict(status=report['status'], counts=report['counts'])))


if __name__ == '__main__':
    main()
