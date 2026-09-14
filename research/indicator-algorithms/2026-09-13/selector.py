"""Frozen causal method/holding selector; see protocol.md. No production changes."""
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
METHODS = ('Momentum', 'TrendQuality', 'ATRNormalizedMomentum',
           'EMAConfirmedMomentum', 'Breakout', 'VolumeBreakout')
HOLDINGS = (7, 14, 30, 60, 90)
SCENARIOS = ('net_zero', 'net_loss', 'net100_zero', 'net100_loss')
DAY = dt.timedelta(days=1)


def day(value):
    return dt.date.fromisoformat(value)


def hard_exit(row):
    return day(row['signal']) + (2 + row['holding']) * DAY


def replay(rows, choices=None, fixed=None):
    """Signal must be on/after prior exit; empty selected cohorts also occupy H."""
    wealth = {s: 1.0 for s in SCENARIOS}
    peaks = dict(wealth)
    drawdowns = {s: 0.0 for s in SCENARIOS}
    annual = {}
    path = []
    free_on = dt.date.min
    for signal, available in sorted(rows.items()):
        signal_day = day(signal)
        if signal_day < free_on:
            continue
        policy = fixed if choices is None else choices[signal_day.year]
        if policy is None:
            path.append(dict(signal=signal, choice='Cash', wealth=dict(wealth)))
            continue
        method, holding = policy
        row = available[(method, holding)]
        exit_day = hard_exit(row)
        before = dict(wealth)
        marks = {}
        for scenario in SCENARIOS:
            value = row[scenario]
            assert math.isfinite(value) and value >= -1
            wealth[scenario] *= 1 + value
            peaks[scenario] = max(peaks[scenario], wealth[scenario])
            drawdowns[scenario] = max(drawdowns[scenario], 1 - wealth[scenario] / peaks[scenario])
            year_marks = annual.setdefault(str(exit_day.year), {s: 1.0 for s in SCENARIOS})
            year_marks[scenario] *= 1 + value
            marks[scenario] = value
        path.append(dict(signal=signal, entry=(signal_day + 2 * DAY).isoformat(),
                         hard_exit=exit_day.isoformat(), method=method, holding=holding,
                         outcome_ids=row.get('outcome_ids', []), denominator=row['denominator'],
                         returns=marks, wealth_before=before, wealth=dict(wealth)))
        free_on = exit_day
    executed = [p for p in path if 'hard_exit' in p]
    return dict(terminal_wealth=wealth, exit_checkpoint_drawdown=drawdowns,
                executed_cohorts=len(executed),
                final_hard_exit=executed[-1]['hard_exit'] if executed else None,
                annual_exit_returns={y: {s: v - 1 for s, v in marks.items()}
                                     for y, marks in sorted(annual.items())}, path=path)


def training_calendar(rows, cutoff):
    return {signal: available for signal, available in rows.items()
            if dt.date(2020, 1, 1) <= day(signal)
            and day(signal) + 92 * DAY < cutoff}


def fit_choice(rows, cutoff, minimum=6):
    eligible_rows = training_calendar(rows, cutoff)
    candidates = []
    for method in METHODS:
        for holding in HOLDINGS:
            result = replay(eligible_rows, fixed=(method, holding))
            candidates.append(dict(method=method, holding=holding,
                                   eligible=result['executed_cohorts'] >= minimum, **result))
    # Iteration order implements frozen method order, then shorter hold, for ties.
    best, best_wealth = None, 1.0
    for candidate in candidates:
        wealth = candidate['terminal_wealth']['net_loss']
        if candidate['eligible'] and wealth > best_wealth:
            best = (candidate['method'], candidate['holding'])
            best_wealth = wealth
    return dict(cutoff=cutoff.isoformat(), training_signals=sorted(eligible_rows),
                common_latest_possible_exit=(day(max(eligible_rows)) + 92 * DAY).isoformat()
                if eligible_rows else None,
                choice=None if best is None else dict(method=best[0], holding=best[1]),
                chosen_training_wealth=best_wealth, candidates=candidates)


def selftest():
    def sample(signal, holding, value):
        return dict(signal=signal, holding=holding, denominator=10, outcome_ids=[],
                    **{s: value for s in SCENARIOS})
    dates = ['2020-01-01', '2020-01-29', '2020-02-26', '2020-03-25']
    rows = {d: {('Momentum', 30): sample(d, 30, .1)} for d in dates}
    result = replay(rows, fixed=('Momentum', 30))
    assert [p['signal'] for p in result['path']] == [dates[0], dates[2]]
    assert math.isclose(result['terminal_wealth']['net_loss'], 1.21)
    equality = {'2020-01-01': {('Momentum', 30): sample('2020-01-01', 30, 0)},
                '2020-02-02': {('Momentum', 30): sample('2020-02-02', 30, .1)}}
    assert replay(equality, fixed=('Momentum', 30))['executed_cohorts'] == 2
    cutoff = dt.date(2023, 1, 1)
    boundary = (cutoff - 92 * DAY).isoformat()
    allowed = (cutoff - 93 * DAY).isoformat()
    assert list(training_calendar({boundary: {}, allowed: {}}, cutoff)) == [allowed]
    full = {}
    for i in range(20):
        signal = (dt.date(2020, 1, 1) + 28 * i * DAY).isoformat()
        full[signal] = {(m, h): sample(signal, h, .01 if m == 'Momentum' else 0)
                        for m in METHODS for h in HOLDINGS}
    fitted = fit_choice(full, cutoff)
    assert fitted['choice'] == {'method': 'Momentum', 'holding': 7}
    full[boundary] = {(m, h): sample(boundary, h, 1000 if m == 'VolumeBreakout' else 0)
                      for m in METHODS for h in HOLDINGS}
    assert fit_choice(full, cutoff) == fitted  # Huge future returns cannot affect choice.
    assert fit_choice(full, cutoff, minimum=100)['choice'] is None
    year_rows = {'2023-12-01': {('Momentum', 90): sample('2023-12-01', 90, .1)},
                 '2024-01-01': {},
                 '2024-03-04': {('Breakout', 7): sample('2024-03-04', 7, .2)}}
    path = replay(year_rows, choices={2023: ('Momentum', 90), 2024: ('Breakout', 7)})
    assert [p['method'] for p in path['path']] == ['Momentum', 'Breakout']
    assert math.isclose(path['terminal_wealth']['net_loss'], 1.32)
    losses = {'2020-01-01': {('Momentum', 7): sample('2020-01-01', 7, -1)},
              '2020-02-01': {('Momentum', 7): sample('2020-02-01', 7, 100)}}
    assert replay(losses, fixed=('Momentum', 7))['terminal_wealth']['net_loss'] == 0
    assert replay(rows, fixed=None)['executed_cohorts'] == 0


def main():
    selftest()
    targets = [HERE / 'selection.json', HERE / 'selection-ledger.json.gz']
    if any(p.exists() for p in targets):
        raise SystemExit('Refusing to overwrite selector outputs')
    sources = [HERE / 'ledger.json.gz', HERE / 'summary.json', HERE / 'protocol.md',
               HERE / 'run.py', Path(__file__)]
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    source_summary = json.loads(sources[1].read_text())
    assert source_summary['ledger_sha256'] == hashes['ledger.json.gz']
    source = json.loads(gzip.decompress(sources[0].read_bytes()))
    grids = {}
    for row in source['cohorts']:
        if row['method'] not in METHODS or row['holding'] not in HOLDINGS:
            continue
        available = grids.setdefault(row['view'], {}).setdefault(row['signal'], {})
        key = (row['method'], row['holding'])
        assert key not in available
        available[key] = row
    assert len(grids) == 12
    expected = {(m, h) for m in METHODS for h in HOLDINGS}
    for rows in grids.values():
        assert all(set(available) == expected for available in rows.values())
    fits, evaluations = [], []
    for view, rows in sorted(grids.items()):
        choices = {}
        for year in (2023, 2024, 2025):
            fit = dict(view=view, year=year, **fit_choice(rows, dt.date(year, 1, 1)))
            fits.append(fit)
            choice = fit['choice']
            choices[year] = None if choice is None else (choice['method'], choice['holding'])
        evaluation_rows = {s: a for s, a in rows.items() if 2023 <= day(s).year <= 2025}
        evaluations.append(dict(view=view, policy='AnnualSelector',
                                **replay(evaluation_rows, choices=choices)))
        evaluations.append(dict(view=view, policy='Cash', **replay(evaluation_rows)))
        for method in METHODS:
            for holding in HOLDINGS:
                evaluations.append(dict(view=view, policy=method, holding=holding,
                                        **replay(evaluation_rows, fixed=(method, holding))))
    # Structural assertions cover every saved path, independent of chosen outcomes.
    for result in [c for f in fits for c in f['candidates']] + evaluations:
        positions = [p for p in result['path'] if 'hard_exit' in p]
        assert all(day(p['signal']) >= day(q['hard_exit']) for q, p in zip(positions, positions[1:]))
    ledger = dict(hashes=hashes, annual_fits=fits, evaluations=evaluations)
    compressed = gzip.compress(json.dumps(ledger, separators=(',', ':'), allow_nan=False).encode(), mtime=0)
    targets[1].write_bytes(compressed)
    compact_fits = [{k: v for k, v in fit.items() if k != 'candidates'} | {
        'candidates': [{k: v for k, v in c.items() if k != 'path'} for c in fit['candidates']]}
                    for fit in fits]
    summary = dict(status='retrospective-causal-selection-not-production-mapping',
                   completed_utc=dt.datetime.now(dt.timezone.utc).isoformat(), hashes=hashes,
                   selftests='passed', selection_ledger_sha256=hashlib.sha256(compressed).hexdigest(),
                   calendar_start='2023-01-01', calendar_end='2026-03-01',
                   calendar_end_note='Final scheduled exits occur before this common cash-marking boundary.',
                   annual_fits=compact_fits,
                   evaluations=[{k: v for k, v in e.items() if k != 'path'} for e in evaluations])
    assert all(e['final_hard_exit'] is None or e['final_hard_exit'] < summary['calendar_end']
               for e in evaluations)
    with targets[0].open('x') as f:
        json.dump(summary, f, indent=2, allow_nan=False)
        f.write('\n')
    print(json.dumps(dict(annual_fits=len(fits), evaluations=len(evaluations),
                          selection_ledger_sha256=summary['selection_ledger_sha256'])))


if __name__ == '__main__':
    main()
