"""Check external libraries against saved outcomes and evaluate paired candidates.

This is retrospective diagnostics, not new out-of-sample evidence. Run from repo root:
.cache/trading-libs-venv/bin/python research/trading-libraries/2026-09-13/check.py
"""
import gzip
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import talib
import vectorbt as vbt

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / 'research/interval-algorithms/2026-09-13'


def main():
    target = HERE / 'evaluation.json'
    if target.exists():
        raise FileExistsError('Preserve the previous evaluation; use a new dated run directory.')
    started = datetime.now(timezone.utc).isoformat()
    raw = (SOURCE / 'results.json.gz').read_bytes()
    summary = json.loads((SOURCE / 'summary.json').read_text())
    assert hashlib.sha256(raw).hexdigest() == summary['hashes']['ledger']
    records = json.loads(gzip.decompress(raw))['records']

    # Independent engine accounting: separate unit-capital round trips. Each
    # column is one saved known outcome, never a compounded/overlapping portfolio.
    positions = [p for r in records for p in r['positions'] if p['gross'] is not None]
    prices = np.vstack([np.ones(len(positions)), [1 + p['gross'] for p in positions]])
    errors = {}
    for bps in [0, 50, 100]:
        portfolio = vbt.Portfolio.from_orders(
            prices, size=np.array([[np.inf], [-np.inf]]),
            init_cash=1., fees=bps / 10000, cash_sharing=False,
            direction='longonly', freq='1D',
        )
        actual = np.asarray(portfolio.total_return())
        expected = np.array([p[f'net{bps}'] for p in positions])
        np.testing.assert_allclose(actual, expected, rtol=1e-10, atol=1e-12)
        assert len(portfolio.orders.records) == 2 * len(positions)
        errors[str(bps)] = float(np.max(np.abs(actual - expected)))

    # Exercise TA-Lib on real saved data and test prefix invariance: appending
    # later prices must not alter already computed historical indicator values.
    panel_path = ROOT / 'research/algorithm-comparison/high-flier-data/final/daily-panel.csv.gz'
    panel = pd.read_csv(panel_path)
    bars = panel[(panel.cohort_year == 2024) & (panel.symbol == 'BTCUSDT')].sort_values('date')
    assert len(bars) > 100 and bars.identity_segment_id.nunique() == 1
    assert bars.date.is_unique and (bars.bar_status == 'complete').all()
    assert pd.to_datetime(bars.date).diff().dropna().eq(pd.Timedelta(days=1)).all()
    close, high, low = (bars[k].to_numpy(dtype=float) for k in ['close', 'high', 'low'])
    signals = {
        'ROC7': (talib.ROC, [close], {'timeperiod': 7}),
        'EMA21': (talib.EMA, [close], {'timeperiod': 21}),
        'RSI14': (talib.RSI, [close], {'timeperiod': 14}),
        'ATR14': (talib.ATR, [high, low, close], {'timeperiod': 14}),
    }
    cut = len(close) // 2
    for name, (fn, args, kwargs) in signals.items():
        full = fn(*args, **kwargs)
        np.testing.assert_allclose(full[:cut], fn(*[a[:cut] for a in args], **kwargs), equal_nan=True)
    np.testing.assert_allclose(talib.ROC(close, timeperiod=7)[7:], (close[7:] / close[:-7] - 1) * 100)

    # Same decision dates, same hold, same universe comparison. Evaluate both
    # candidates against CURRENT corrected Classic, not only the old buggy code.
    lookup = {(r['comparison'], r['mode'], r['view'], r['holding'], r['method'], r['signal']): r for r in records}
    groups = {}
    for r in records:
        if r['method'] not in ['momentum', 'trend-quality']:
            continue
        key = tuple(r[k] for k in ['comparison', 'mode', 'view', 'holding', 'method'])
        base = lookup[(*key[:4], 'classic', r['signal'])]
        assert r['entrySnapshot'] == base['entrySnapshot'] and r['exitSnapshot'] == base['exitSnapshot']
        groups.setdefault(key, []).append((r, base))
    evaluations = []
    for key, pairs in sorted(groups.items()):
        pairs.sort(key=lambda p: p[0]['signal'])
        delta = np.array([r['net50'] - b['net50'] for r, b in pairs])
        split = len(pairs) // 2
        hits = lambda r: sum(p['hit'] for p in r['positions'])
        evaluations.append(dict(zip(['comparison', 'mode', 'view', 'holding', 'method'], key)) | {
            'cohorts': len(pairs), 'signal_dates': [r['signal'] for r, _ in pairs],
            'paired_wins': int((delta > 0).sum()), 'paired_losses': int((delta < 0).sum()),
            'mean_return_delta': float(delta.mean()),
            'median_return_delta': float(np.median(delta)),
            'delta_without_best_period': float((delta.sum() - delta.max()) / (len(delta) - 1)) if len(delta) > 1 else None,
            'earlier_half_delta': float(delta[:split].mean()) if split else None,
            'later_half_delta': float(delta[split:].mean()),
            'net100_delta': float(np.mean([r['net100'] - b['net100'] for r, b in pairs])),
            'missing_exit_total_loss_delta': float(np.mean([r['netLoss50'] - b['netLoss50'] for r, b in pairs])),
            'mover_hit_count_delta': sum(hits(r) - hits(b) for r, b in pairs),
        })
    result = {
        'started_at_utc': started, 'completed_at_utc': datetime.now(timezone.utc).isoformat(),
        'versions': {'vectorbt': vbt.__version__, 'TA-Lib': talib.__version__, 'numpy': np.__version__, 'pandas': pd.__version__},
        'source_ledger_sha256': hashlib.sha256(raw).hexdigest(),
        'panel_sha256': hashlib.sha256(panel_path.read_bytes()).hexdigest(),
        'runner_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'vectorbt_known_round_trips_checked_per_fee': len(positions), 'fee_max_errors': errors,
        'talib': {'bars': len(bars), 'symbol': 'BTCUSDT', 'cohort': 2024, 'prefix_invariance': list(signals), 'ROC_parity': 'passed'},
        'interpretation': 'All cells evaluated; exploratory paired diagnostics, no significance or untouched-holdout claim. Half-splits are descriptive, not trained walk-forward CV. No Sharpe or compounded return on overlapping cohorts.',
        'paired_evaluations': evaluations,
    }
    with target.open('x') as f:
        json.dump(result, f, indent=2)
        f.write('\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'paired_evaluations'}, indent=2))
    print('Paired candidate/current-Classic cells:', len(evaluations))


if __name__ == '__main__':
    main()
