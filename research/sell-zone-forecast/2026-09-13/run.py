"""Retrospective monthly forecasts of frozen target reachability; see protocol."""
import collections
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / 'sell-zones/2026-09-13'
POLICIES = ('SMAATRBracket', 'ResistanceSMAATR')


def features(outcome, hold):
    entry, atr, resistance = (outcome[k] for k in ['entry_price', 'atr_sma14', 'prior20_resistance'])
    if entry is None or entry <= 0 or atr is None or atr < 0 or resistance is None:
        return None
    if outcome['target'] is None or outcome['stop'] is None or outcome['target'] <= entry:
        return None
    xs = [outcome['target'] / entry - 1, outcome['stop'] / entry - 1,
          atr / entry, resistance / entry - 1, math.log1p(hold)]
    return xs if all(math.isfinite(x) for x in xs) else None


def eligible_train(rows, cutoff):
    return [r for r in rows if r['hard_exit'] < cutoff and r['label'] is not None]


def score(rows):
    known = [r for r in rows if r['label'] is not None]
    if not known:
        return {'events': len(rows), 'known': 0}
    y = np.array([r['label'] for r in known], dtype=float)
    p = np.array([r['probability'] for r in known])
    base = np.array([r['baseline_probability'] for r in known])
    logloss = lambda x: float(np.mean(-y * np.log(np.clip(x, 1e-12, 1-1e-12)) - (1-y)*np.log(np.clip(1-x, 1e-12, 1-1e-12))))
    model_brier, base_brier = float(np.mean((p-y)**2)), float(np.mean((base-y)**2))
    bins = []
    for i in range(10):
        ix = np.where((p >= i/10) & ((p < (i+1)/10) if i < 9 else (p <= 1)))[0]
        if len(ix):
            bins.append({'lower': i/10, 'upper': (i+1)/10, 'n': len(ix),
                         'mean_probability': float(p[ix].mean()), 'hit_rate': float(y[ix].mean())})
    return {'events': len(rows), 'known': len(known), 'unknown': len(rows)-len(known),
            'distinct_entry_dates': len({r['entry'] for r in known}),
            'hit_rate': float(y.mean()), 'mean_probability': float(p.mean()),
            'model_brier': model_brier, 'baseline_brier': base_brier,
            'brier_improvement': base_brier-model_brier,
            'model_log_loss': logloss(p), 'baseline_log_loss': logloss(base), 'reliability': bins}


def selftest():
    x = {'entry_price': 100., 'atr_sma14': 5., 'prior20_resistance': 120., 'target': 115., 'stop': 90.}
    assert features(x, 30) == features({**x, 'target_reach': True, 'exit_price': 5000}, 30)
    assert features(x, 30) == features({**x, 'target_reach': False, 'exit_price': 1}, 30)
    rows = [{'hard_exit': '2023-01-01', 'label': True}, {'hard_exit': '2022-12-31', 'label': False},
            {'hard_exit': '2022-12-01', 'label': None}]
    assert eligible_train(rows, '2023-01-01') == [rows[1]]


def main():
    selftest()
    for name in ['summary.json', 'predictions.json.gz']:
        if (HERE/name).exists():
            raise FileExistsError(name)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    raw = (SOURCE/'ledger.json.gz').read_bytes()
    source_summary = json.loads((SOURCE/'summary.json').read_text())
    source_hash = hashlib.sha256(raw).hexdigest()
    assert source_hash == source_summary['ledger_sha256']
    outcomes = json.loads(gzip.decompress(raw))['outcomes']
    by_policy = collections.defaultdict(list)
    skipped_features = collections.Counter()
    for key, variants in sorted(outcomes.items()):
        identity, signal, hold = json.loads(key)
        for policy in POLICIES:
            outcome = variants[policy]
            xs = features(outcome, hold)
            if xs is None:
                skipped_features[policy] += 1
                continue
            assert outcome['level_source_date'] == signal < outcome['entry_date'] < outcome['hard_exit_date']
            by_policy[policy].append({'key': key, 'identity': identity, 'signal': signal, 'hold': hold,
                'entry': outcome['entry_date'], 'hard_exit': outcome['hard_exit_date'],
                'features': xs, 'label': outcome['target_reach'], 'target': outcome['target'],
                'stop': outcome['stop'], 'entry_price': outcome['entry_price']})
    forecasts, fits, skipped_months = [], [], []
    for policy, events in by_policy.items():
        assert len({r['key'] for r in events}) == len(events)
        for year in range(2023, 2026):
            for month in range(1, 13):
                cutoff = f'{year}-{month:02d}-01'
                test = [r for r in events if r['entry'][:7] == cutoff[:7]]
                if not test:
                    continue
                train = eligible_train(events, cutoff)
                if len(train) < 200 or len({r['label'] for r in train}) < 2:
                    skipped_months.append({'policy': policy, 'month': cutoff, 'training': len(train), 'events': len(test)})
                    continue
                assert max(r['hard_exit'] for r in train) < cutoff <= min(r['entry'] for r in test)
                x, y = np.array([r['features'] for r in train]), np.array([r['label'] for r in train], dtype=int)
                model = make_pipeline(StandardScaler(), LogisticRegression(C=1., solver='lbfgs', max_iter=1000))
                model.fit(x, y)
                assert int(model[-1].n_iter_[0]) < 1000
                probs = model.predict_proba(np.array([r['features'] for r in test]))[:, 1]
                base = (int(y.sum()) + 1) / (len(y) + 2)
                fit_id = f'{policy}:{cutoff}'
                fits.append({'fit_id': fit_id, 'policy': policy, 'month': cutoff, 'training_n': len(train),
                    'training_hits': int(y.sum()), 'distinct_training_signals': len({r['signal'] for r in train}),
                    'latest_training_exit': max(r['hard_exit'] for r in train), 'base_rate': base,
                    'scaler_mean': model[0].mean_.tolist(), 'scaler_scale': model[0].scale_.tolist(),
                    'coefficients': model[-1].coef_[0].tolist(), 'intercept': float(model[-1].intercept_[0])})
                forecasts.extend({**r, 'policy': policy, 'fit_id': fit_id, 'probability': float(prob),
                                  'baseline_probability': base} for r, prob in zip(test, probs))
    summaries = []
    for policy in POLICIES:
        rows = [r for r in forecasts if r['policy'] == policy]
        for label in ['all', '2023', '2024', '2025']:
            selected = rows if label == 'all' else [r for r in rows if r['entry'].startswith(label)]
            summaries.append({'policy': policy, 'period': label, 'holding': 'all', **score(selected)})
        for hold in [14,30,60,90]:
            summaries.append({'policy': policy, 'period': 'all', 'holding': hold,
                              **score([r for r in rows if r['hold'] == hold])})
    payload = {'fits': fits, 'forecasts': forecasts}
    compressed = gzip.compress(json.dumps(payload, allow_nan=False).encode(), mtime=0)
    result = {'started_at_utc': started, 'completed_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
              'source_ledger_sha256': source_hash,
              'runner_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'protocol_sha256': hashlib.sha256((HERE/'protocol.md').read_bytes()).hexdigest(),
              'predictions_sha256': hashlib.sha256(compressed).hexdigest(),
              'sklearn': sklearn.__version__, 'numpy': np.__version__,
              'fit_count': len(fits), 'forecast_count': len(forecasts), 'skipped_features': dict(skipped_features),
              'skipped_months': skipped_months, 'summary': summaries}
    with (HERE/'predictions.json.gz').open('xb') as f:
        f.write(compressed)
    with (HERE/'summary.json').open('x') as f:
        json.dump(result, f, indent=2, allow_nan=False)
        f.write('\n')
    print(json.dumps({k:v for k,v in result.items() if k != 'summary'}, indent=2))
    for row in summaries:
        if row['period'] == 'all' and row['holding'] == 'all':
            print(json.dumps({k:v for k,v in row.items() if k != 'reliability'}))


if __name__ == '__main__':
    main()
