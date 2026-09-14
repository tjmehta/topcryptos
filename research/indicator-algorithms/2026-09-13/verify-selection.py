"""Independent selector reconstruction; imports no experiment implementation."""
import bisect
import collections
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
METHODS = ['Momentum', 'TrendQuality', 'ATRNormalizedMomentum',
           'EMAConfirmedMomentum', 'Breakout', 'VolumeBreakout']
HOLDS = [7, 14, 30, 60, 90]
VIEWS = [3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90]
SCENARIOS = ['net_zero', 'net_loss', 'net100_zero', 'net100_loss']
CHECKS = collections.Counter()


def ordinal(date):
    return dt.date.fromisoformat(date).toordinal()


def iso(number):
    return dt.date.fromordinal(number).isoformat()


def same(actual, expected, context=''):
    CHECKS['compared_values'] += 1
    if isinstance(expected, float):
        assert isinstance(actual, (int, float)) and math.isfinite(actual), context
        assert math.isclose(actual, expected, rel_tol=2e-12, abs_tol=2e-12), (context, actual, expected)
    elif isinstance(expected, dict):
        assert set(actual) == set(expected), (context, set(actual), set(expected))
        for key, value in expected.items():
            same(actual[key], value, f'{context}/{key}')
    elif isinstance(expected, list):
        assert len(actual) == len(expected), (context, len(actual), len(expected))
        for i, (a, e) in enumerate(zip(actual, expected)):
            same(a, e, f'{context}/{i}')
    else:
        assert actual == expected, (context, actual, expected)


def reconstructed_path(signals, grid, annual=None, fixed=None):
    """Choose disjoint scheduled cohorts by binary search, then value prefixes."""
    days = [ordinal(s) for s in signals]
    events = []
    index = 0
    while index < len(days):
        signal, number = signals[index], days[index]
        policy = fixed if annual is None else annual[int(signal[:4])]
        if policy is None:
            events.append({'signal': signal, 'choice': 'Cash'})
            index += 1
            continue
        method, holding = policy
        row = grid[signal, method, holding]
        end = number + 2 + holding
        events.append(dict(signal=signal, entry=iso(number + 2), hard_exit=iso(end),
                           method=method, holding=holding, outcome_ids=row['outcome_ids'],
                           denominator=row['denominator'],
                           returns={s: row[s] for s in SCENARIOS}))
        index = bisect.bisect_left(days, end, lo=index + 1)

    multipliers = {s: [] for s in SCENARIOS}
    checkpoints = {s: [1.] for s in SCENARIOS}
    year_factors = collections.defaultdict(lambda: {s: [] for s in SCENARIOS})
    for event in events:
        if 'returns' in event:
            event['wealth_before'] = {s: math.prod(multipliers[s]) for s in SCENARIOS}
            for s in SCENARIOS:
                factor = 1 + event['returns'][s]
                assert math.isfinite(factor) and factor >= 0
                multipliers[s].append(factor)
                year_factors[event['hard_exit'][:4]][s].append(factor)
                checkpoints[s].append(math.prod(multipliers[s]))
        event['wealth'] = {s: math.prod(multipliers[s]) for s in SCENARIOS}
    positions = [event for event in events if 'hard_exit' in event]
    for previous, current in zip(positions, positions[1:]):
        assert ordinal(current['signal']) >= ordinal(previous['hard_exit'])
    CHECKS['nonoverlap_paths'] += 1
    CHECKS['executed_path_events'] += len(positions)
    drawdowns = {s: max(1 - value / max(checkpoints[s][:i + 1])
                       for i, value in enumerate(checkpoints[s])) for s in SCENARIOS}
    return dict(terminal_wealth={s: math.prod(multipliers[s]) for s in SCENARIOS},
                exit_checkpoint_drawdown=drawdowns, executed_cohorts=len(positions),
                final_hard_exit=positions[-1]['hard_exit'] if positions else None,
                annual_exit_returns={y: {s: math.prod(values[s]) - 1 for s in SCENARIOS}
                                     for y, values in sorted(year_factors.items())}, path=events)


def main():
    output = HERE / 'selection-verification.json'
    if output.exists():
        raise SystemExit('Refusing to overwrite verification report')
    files = ['ledger.json.gz', 'summary.json', 'protocol.md', 'run.py', 'selector.py',
             'selection.json', 'selection-ledger.json.gz', Path(__file__).name]
    hashes = {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in files}
    base = json.loads(gzip.decompress((HERE / 'ledger.json.gz').read_bytes()))
    base_summary = json.loads((HERE / 'summary.json').read_text())
    saved = json.loads(gzip.decompress((HERE / 'selection-ledger.json.gz').read_bytes()))
    summary = json.loads((HERE / 'selection.json').read_text())
    assert base_summary['ledger_sha256'] == hashes['ledger.json.gz']
    assert base_summary['runner_sha256'] == hashes['run.py']
    assert base_summary['protocol_sha256'] == hashes['protocol.md']
    assert summary['selection_ledger_sha256'] == hashes['selection-ledger.json.gz']
    for name, digest in saved['hashes'].items():
        assert digest == hashes[name], name
    same(summary['hashes'], saved['hashes'], 'source hashes')

    # Recover all four cost/missing marks from saved executable prices, independently.
    for key, outcome in base['outcomes'].items():
        identity, signal, holding = json.loads(key)
        assert identity == outcome['id']
        assert outcome['entry_date'] == iso(ordinal(signal) + 2)
        assert outcome['exit_date'] == iso(ordinal(signal) + 2 + holding)
        entry, exit_price = outcome['entry_price'], outcome['exit_price']
        for scenario in SCENARIOS:
            fee = .01 if scenario.startswith('net100') else .005
            if entry is None:
                value = 0.
            else:
                ratio = exit_price / entry if exit_price is not None else (0. if scenario.endswith('loss') else 1.)
                value = ratio * (1 - fee) / (1 + fee) - 1
            same(outcome[scenario], value, f'outcome {key} {scenario}')
        CHECKS['outcomes_cost_and_date_verified'] += 1

    grids = {view: {} for view in VIEWS}
    for row in base['cohorts']:
        if row['holding'] not in HOLDS or row['method'] not in METHODS:
            continue
        key = row['signal'], row['method'], row['holding']
        assert key not in grids[row['view']]
        assert row['denominator'] == 10 and len(row['outcome_ids']) <= 10
        assert len(set(row['outcome_ids'])) == len(row['outcome_ids'])
        for outcome_key in row['outcome_ids']:
            identity, signal, holding = json.loads(outcome_key)
            assert signal == row['signal'] and holding == row['holding']
            assert identity.startswith(str(row['year']) + ':')
        for s in SCENARIOS:
            same(row[s], math.fsum(base['outcomes'][k][s] for k in row['outcome_ids']) / 10,
                 f'cohort {row["view"]} {key} {s}')
        grids[row['view']][key] = row
        CHECKS['cohorts_slot_means_verified'] += 1

    all_signals = [iso(dt.date(y, 1, 1).toordinal() + 28 * k)
                   for y in range(2020, 2026) for k in range(12)]
    skipped = {(r['view'], iso(dt.date(r['year'], 1, 1).toordinal() + 28 * r['anchor']))
               for r in base_summary['skips']}
    fit_lookup = {(r['view'], r['year']): r for r in saved['annual_fits']}
    evaluation_lookup = {(r['view'], r['policy'], r.get('holding')): r for r in saved['evaluations']}
    assert len(fit_lookup) == len(saved['annual_fits']) == 36
    assert len(evaluation_lookup) == len(saved['evaluations']) == 384
    rebuilt_fits, rebuilt_evaluations = [], []
    decisions = []
    for view, grid in grids.items():
        dates = [s for s in all_signals if (view, s) not in skipped]
        assert set(grid) == {(s, m, h) for s in dates for m in METHODS for h in HOLDS}
        annual = {}
        for year in [2023, 2024, 2025]:
            cutoff = dt.date(year, 1, 1).toordinal()
            train_dates = [s for s in dates if ordinal(s) + 92 < cutoff]
            candidates = []
            for method in METHODS:
                for holding in HOLDS:
                    result = reconstructed_path(train_dates, grid, fixed=(method, holding))
                    assert result['final_hard_exit'] is None or ordinal(result['final_hard_exit']) < cutoff
                    candidates.append(dict(method=method, holding=holding,
                                           eligible=result['executed_cohorts'] >= 6, **result))
            ranked = sorted([c for c in candidates if c['eligible'] and c['terminal_wealth']['net_loss'] > 1],
                            key=lambda c: (-c['terminal_wealth']['net_loss'], METHODS.index(c['method']), c['holding']))
            winner = ranked[0] if ranked else None
            choice = None if winner is None else dict(method=winner['method'], holding=winner['holding'])
            annual[year] = None if winner is None else (winner['method'], winner['holding'])
            fit = dict(view=view, year=year, cutoff=iso(cutoff), training_signals=train_dates,
                       common_latest_possible_exit=iso(ordinal(train_dates[-1]) + 92) if train_dates else None,
                       choice=choice, chosen_training_wealth=winner['terminal_wealth']['net_loss'] if winner else 1.,
                       candidates=candidates)
            same(fit_lookup[view, year], fit, f'fit {view} {year}')
            rebuilt_fits.append(fit)
            decisions.append(dict(view=view, year=year, choice=choice))
            CHECKS['annual_fits_verified'] += 1
        evaluation_dates = [s for s in dates if 2023 <= int(s[:4]) <= 2025]
        policies = [('AnnualSelector', None, annual), ('Cash', None, None)]
        policies += [(method, holding, None) for method in METHODS for holding in HOLDS]
        for method, holding, mapping in policies:
            policy = None if holding is None else (method, holding)
            result = reconstructed_path(evaluation_dates, grid, annual=mapping, fixed=policy)
            rebuilt = dict(view=view, policy=method, **result)
            if holding is not None:
                rebuilt['holding'] = holding
            same(evaluation_lookup[view, method, holding], rebuilt, f'evaluation {view} {method} {holding}')
            assert result['final_hard_exit'] is None or result['final_hard_exit'] < summary['calendar_end']
            rebuilt_evaluations.append(rebuilt)
            CHECKS['evaluation_paths_verified'] += 1

    compact_fits = [{**{k: v for k, v in fit.items() if k != 'candidates'},
                     'candidates': [{k: v for k, v in c.items() if k != 'path'} for c in fit['candidates']]}
                    for fit in rebuilt_fits]
    same(summary['annual_fits'], compact_fits, 'summary fits')
    same(summary['evaluations'], [{k: v for k, v in row.items() if k != 'path'}
                                 for row in rebuilt_evaluations], 'summary evaluations')
    assert summary['calendar_start'] == '2023-01-01'
    assert summary['calendar_end'] == '2026-03-01'
    report = dict(status='passed', verified_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
                  hashes=hashes, counts=dict(CHECKS), scenarios=SCENARIOS,
                  method='Independent standard-library reconstruction; no source implementation imports. '
                  'Cost marks recovered from saved executable prices; nonoverlap calendars built with binary search; '
                  'wealth and annual returns recovered from prefix products; all selector and fixed policy outputs compared.',
                  limitations='Executable source prices and indicator selections are frozen inputs here; '
                  'this verifier does not independently reconstruct raw candle eligibility, signals or prices.',
                  annual_decisions=decisions)
    with output.open('x') as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
        handle.write('\n')
    print(json.dumps(dict(status=report['status'], counts=report['counts'])))


if __name__ == '__main__':
    main()
