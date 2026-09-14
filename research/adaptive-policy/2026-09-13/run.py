"""Maturity-aware sequential policy evaluation over preserved cohort outcomes."""
import bisect
import collections
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / 'holding-horizons'
DAY = dt.timedelta(days=1)
METHODS = ('Momentum', 'TrendQuality')
HOLDS = (7, 14, 30, 60, 90)
START, END = dt.date(2023, 1, 1), dt.date(2026, 3, 1)
CALENDAR = sorted(dt.date(y, 1, 1) + 28 * k * DAY for y in range(2020, 2029) for k in range(12))


def date(r):
    return dt.date.fromisoformat(r['signal'])


def maturity(r):
    return date(r) + (2 + r['holding']) * DAY


def capital_days(r):
    # Signals are after close; an exit on the same date occurs at open and
    # permits another decision that evening. Include gaps between year schedules.
    nxt = CALENDAR[bisect.bisect_left(CALENDAR, maturity(r))]
    return (nxt - date(r)).days


def historical(records, decision, method, hold):
    return sorted((r for r in records if r['method'] == method and r['holding'] == hold
                   and maturity(r) < decision), key=date)[-24:]


def prediction(sample):
    xs = sorted(r['net_loss'] for r in sample)
    def q(p):
        index = (len(xs) - 1) * p
        low = math.floor(index)
        return xs[low] + (xs[min(low + 1, len(xs) - 1)] - xs[low]) * (index - low)
    return {'n': len(xs), 'mean': statistics.mean(xs), 'median': statistics.median(xs),
            'q20': q(.2), 'q80': q(.8), 'latest_training_exit': max(maturity(r) for r in sample).isoformat()}


def choose(records, decision, policy):
    choices = []
    for method in METHODS:
        for hold in HOLDS:
            if policy == 'method-only' and hold != 14:
                continue
            if policy == 'hold-only' and method != 'Momentum':
                continue
            sample = historical(records, decision, method, hold)
            if len(sample) < 12:
                continue
            utility = statistics.mean(math.log1p(max(-.999999999999, r['net_loss'])) / capital_days(r) for r in sample)
            choices.append((utility, method, hold, sample))
    if not choices:
        return None
    # Explicit deterministic ties, independent of input ordering.
    best = max(choices, key=lambda x: (x[0], -METHODS.index(x[1]), -x[2]))
    return best if best[0] > 0 else None


def selftest():
    r = {'signal': '2020-01-01', 'method': 'Momentum', 'holding': 7, 'net_loss': .1}
    assert maturity(r) == dt.date(2020, 1, 10)
    assert not historical([r], maturity(r), 'Momentum', 7)
    assert historical([r], maturity(r) + DAY, 'Momentum', 7) == [r]
    assert capital_days(r) == 28
    old = [dict(r, signal=(dt.date(2020, 1, 1) + 28 * i * DAY).isoformat()) for i in range(12)]
    future = dict(r, signal='2023-01-01', net_loss=10000)
    a = choose(old + [future], START, 'joint')
    future['net_loss'] = -.99
    b = choose(old + [future], START, 'joint')
    assert a == b and a[1:3] == ('Momentum', 7)
    assert choose([dict(x, net_loss=-.1) for x in old], START, 'joint') is None


def simulate(records, policy):
    lookup = {(date(r), r['method'], r['holding']): r for r in records}
    signals = sorted({date(r) for r in records if START <= date(r) < dt.date(2026, 1, 1)})
    available = START
    wealth = {'net_zero': 1., 'net_loss': 1.}
    peak = dict(wealth)
    drawdown = {'net_zero': 0., 'net_loss': 0.}
    ledger = []
    cash = busy = 0
    for signal in signals:
        if signal < available:
            busy += 1
            continue
        if policy.startswith('fixed:'):
            _, method, hold = policy.split(':')
            hold = int(hold)
            sample = historical(records, signal, method, hold)
            forecast = prediction(sample) if len(sample) >= 12 else None
            utility = None
        else:
            picked = choose(records, signal, policy)
            if picked is None:
                cash += 1
                continue
            utility, method, hold, sample = picked
            assert all(maturity(r) < signal for r in sample)
            forecast = prediction(sample)
        outcome = lookup[(signal, method, hold)]
        available = maturity(outcome)
        assert available <= END
        before = dict(wealth)
        for key in wealth:
            wealth[key] *= 1 + outcome[key]
            peak[key] = max(peak[key], wealth[key])
            drawdown[key] = min(drawdown[key], wealth[key] / peak[key] - 1)
        ledger.append({'signal': signal.isoformat(), 'entry': (signal + 2 * DAY).isoformat(),
                       'exit': available.isoformat(), 'method': method, 'hold': hold,
                       'estimated_growth_per_calendar_day': utility, 'forecast': forecast,
                       'net_zero': outcome['net_zero'], 'net_loss': outcome['net_loss'],
                       'wealth_before': before, 'wealth_after': dict(wealth),
                       'selected_ids': [p['id'] for p in outcome['positions']]})
    for a, b in zip(ledger, ledger[1:]):
        assert a['exit'] <= b['signal']
    for key in wealth:
        assert math.isclose(wealth[key], math.prod(1 + r[key] for r in ledger))
    forecasts = [r for r in ledger if r['forecast']]
    summary = {'policy': policy, 'trades': len(ledger), 'cash_decisions': cash, 'occupied_signals': busy,
               'terminal_wealth': wealth, 'exit_checkpoint_drawdown': drawdown,
               'holding_days': sum(r['hold'] for r in ledger),
               'choices': dict(collections.Counter(f"{r['method']}/{r['hold']}" for r in ledger)),
               'forecast_count': len(forecasts),
               'forecast_20_80_coverage': statistics.mean(r['forecast']['q20'] <= r['net_loss'] <= r['forecast']['q80'] for r in forecasts) if forecasts else None,
               'forecast_mean_absolute_error': statistics.mean(abs(r['forecast']['mean'] - r['net_loss']) for r in forecasts) if forecasts else None}
    return summary, ledger


def main():
    selftest()
    if '--selftest' in sys.argv:
        print('Maturity, idle-time, future-outcome perturbation and cash checks passed')
        return
    for name in ['summary.json', 'decisions.json.gz']:
        if (HERE / name).exists():
            raise FileExistsError(name)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    source_summary = json.loads((SOURCE / 'summary.json').read_text())
    raw = (SOURCE / 'cohorts.json.gz').read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert digest == source_summary['ledger_sha256']
    rows = [r for r in json.loads(gzip.decompress(raw)) if r['method'] in METHODS and r['holding'] in HOLDS]
    policies = ['method-only', 'hold-only', 'joint'] + [f'fixed:{m}:{h}' for m in METHODS for h in HOLDS]
    summaries, decisions = [], []
    for view in sorted({r['view'] for r in rows}):
        records = [r for r in rows if r['view'] == view]
        for policy in policies:
            s, ledger = simulate(records, policy)
            summaries.append({'view': view, **s})
            decisions.extend({'view': view, 'policy': policy, **r} for r in ledger)
    compressed = gzip.compress(json.dumps(decisions, allow_nan=False).encode(), mtime=0)
    result = {'started_at_utc': started, 'completed_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
              'source_ledger_sha256': digest, 'protocol_sha256': hashlib.sha256((HERE / 'protocol.md').read_bytes()).hexdigest(),
              'runner_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'decision_ledger_sha256': hashlib.sha256(compressed).hexdigest(), 'python': sys.version,
              'start': START.isoformat(), 'accounting_end': END.isoformat(), 'summary': summaries}
    with (HERE / 'decisions.json.gz').open('xb') as f:
        f.write(compressed)
    with (HERE / 'summary.json').open('x') as f:
        json.dump(result, f, indent=2, allow_nan=False)
        f.write('\n')
    print('Saved', len(summaries), 'view/policy evaluations and', len(decisions), 'executed cohorts')


if __name__ == '__main__':
    main()
