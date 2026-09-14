"""Fixed intercept-only prequential calibration; protocol.md defines scope."""
import collections
import datetime as dt
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parents[1]
ORIGINAL = RESEARCH / 'sell-zone-forecast/2026-09-13'
SOURCE = RESEARCH / 'sell-zones/2026-09-13'
spec = importlib.util.spec_from_file_location('frozen_forecast', ORIGINAL/'run.py')
frozen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frozen)
POLICIES = frozen.POLICIES
HOLDS = (14, 30, 60, 90)
PROBABILITIES = ('raw_probability', 'calibrated_probability', 'holding_baseline_probability')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def eligible(rows, cutoff):
    return [r for r in rows if r['hard_exit'] < cutoff and r['label'] is not None]


def sigmoid(value):
    return 1/(1+math.exp(-value)) if value >= 0 else math.exp(value)/(1+math.exp(value))


def logit(p):
    p = min(1-1e-12, max(1e-12, p))
    return math.log(p/(1-p))


def fit_offset(rows):
    if len(rows) < 200 or len({r['label'] for r in rows}) < 2:
        return 0., 'raw_fallback_insufficient_mature_prequential_support'
    logits = np.array([logit(r['raw_probability']) for r in rows])
    hits = sum(r['label'] for r in rows)
    lo, hi = -80., 80.
    for _ in range(90):
        mid = (lo+hi)/2
        expectation = np.sum(1/(1+np.exp(-(logits+mid))))
        if expectation > hits:
            hi = mid
        else:
            lo = mid
    return (lo+hi)/2, 'calibrated'


def metrics(rows):
    known = [r for r in rows if r['label'] is not None]
    result = {'events': len(rows), 'known': len(known), 'unknown': len(rows)-len(known),
              'distinct_entry_dates': len({r['entry'] for r in known})}
    if not known:
        return result
    y = np.array([r['label'] for r in known], dtype=float)
    result['hit_rate'] = float(y.mean())
    for key in PROBABILITIES:
        p = np.array([r[key] for r in known])
        clipped = np.clip(p, 1e-12, 1-1e-12)
        bins = []
        for i in range(10):
            indices = (p >= i/10) & ((p < (i+1)/10) if i < 9 else (p <= 1))
            if indices.any():
                bins.append({'lower': i/10, 'upper': (i+1)/10, 'n': int(indices.sum()),
                             'mean_probability': float(p[indices].mean()), 'hit_rate': float(y[indices].mean())})
        result[key] = {'brier': float(np.mean((p-y)**2)), 'mean_probability': float(p.mean()),
                       'log_loss': float(np.mean(-y*np.log(clipped)-(1-y)*np.log(1-clipped))),
                       'reliability': bins}
    result['calibration_brier_improvement'] = result['raw_probability']['brier']-result['calibrated_probability']['brier']
    result['improvement_over_holding_baseline'] = result['holding_baseline_probability']['brier']-result['calibrated_probability']['brier']
    return result


def base_fit(train):
    model = make_pipeline(StandardScaler(), LogisticRegression(C=1., solver='lbfgs', max_iter=1000))
    model.fit(np.array([r['features'] for r in train]), np.array([r['label'] for r in train], dtype=int))
    assert model[-1].n_iter_[0] < 1000
    return model


def selftest():
    rows = [{'key': str(i), 'hard_exit': '2022-12-31', 'label': bool(i%2),
             'features': [float(i%7), float(i%5), .2, .3, math.log1p(14)],
             'raw_probability': .3 if i%2 else .6} for i in range(220)]
    future = [{'key': 'future', 'hard_exit': '2023-01-01', 'exit_date': '2020-01-01',
               'label': True, 'features': [999.]*5, 'raw_probability': .999}]
    changed = [{**r, 'label': False, 'raw_probability': .001} for r in future]
    a = eligible(rows+future, '2023-01-01')
    b = eligible(rows+changed, '2023-01-01')
    assert a == b == rows
    assert fit_offset(a) == fit_offset(b)
    assert np.array_equal(base_fit(a).predict_proba([[1.,2.,.2,.3,math.log1p(14)]]),
                          base_fit(b).predict_proba([[1.,2.,.2,.3,math.log1p(14)]]))
    assert fit_offset(rows[:199])[1].startswith('raw_fallback')
    assert fit_offset([{**r, 'label': True} for r in rows])[1].startswith('raw_fallback')
    assert eligible([{'hard_exit': '2022-01-01', 'label': None}], '2023-01-01') == []
    assert abs(fit_offset([{**r, 'raw_probability': .5} for r in rows])[0]) < 1e-12


def main():
    selftest()
    for filename in ['summary.json', 'predictions.json.gz']:
        if (HERE/filename).exists():
            raise FileExistsError(filename)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    source_bytes = (SOURCE/'ledger.json.gz').read_bytes()
    original_summary = json.loads((ORIGINAL/'summary.json').read_text())
    original_bytes = (ORIGINAL/'predictions.json.gz').read_bytes()
    assert digest(source_bytes) == original_summary['source_ledger_sha256']
    assert digest(original_bytes) == original_summary['predictions_sha256']
    assert digest((ORIGINAL/'run.py').read_bytes()) == original_summary['runner_sha256']
    assert digest((ORIGINAL/'protocol.md').read_bytes()) == original_summary['protocol_sha256']
    by_policy = collections.defaultdict(list)
    skipped_features = collections.Counter()
    for key, variants in sorted(json.loads(gzip.decompress(source_bytes))['outcomes'].items()):
        identity, signal, hold = json.loads(key)
        for policy in POLICIES:
            outcome = variants[policy]
            xs = frozen.features(outcome, hold)
            if xs is None:
                skipped_features[policy] += 1
                continue
            assert hold in HOLDS
            assert outcome['level_source_date'] == signal < outcome['entry_date'] < outcome['hard_exit_date']
            by_policy[policy].append({'key': key, 'identity': identity, 'signal': signal, 'hold': hold,
                'entry': outcome['entry_date'], 'hard_exit': outcome['hard_exit_date'], 'features': xs,
                'label': outcome['target_reach'], 'policy': policy})
    all_forecasts, fits, skipped_months = [], [], []
    for policy, events in by_policy.items():
        history = []
        assert len({r['key'] for r in events}) == len(events)
        for year in range(2020, 2026):
            for month in range(1, 13):
                cutoff = f'{year}-{month:02d}-01'
                current = [r for r in events if r['entry'][:7] == cutoff[:7]]
                if not current:
                    continue
                train = eligible(events, cutoff)
                if len(train) < 200 or len({r['label'] for r in train}) < 2:
                    skipped_months.append({'policy': policy, 'month': cutoff, 'training_n': len(train), 'events': len(current)})
                    continue
                model = base_fit(train)
                calibration_train = eligible(history, cutoff)
                assert all(r['entry'] < cutoff and r['fit_id'].split(':')[1] < cutoff for r in calibration_train)
                offset, status = fit_offset(calibration_train)
                fit_id = f'{policy}:{cutoff}'
                baseline = {}
                for hold in HOLDS:
                    sample = [r for r in train if r['hold'] == hold]
                    baseline[str(hold)] = {'n': len(sample), 'hits': sum(r['label'] for r in sample),
                                           'probability': (sum(r['label'] for r in sample)+1)/(len(sample)+2)}
                fits.append({'fit_id': fit_id, 'policy': policy, 'month': cutoff,
                    'training_n': len(train), 'training_hits': sum(r['label'] for r in train),
                    'latest_training_exit': max(r['hard_exit'] for r in train),
                    'distinct_training_signals': len({r['signal'] for r in train}),
                    'scaler_mean': model[0].mean_.tolist(), 'scaler_scale': model[0].scale_.tolist(),
                    'coefficients': model[-1].coef_[0].tolist(), 'intercept': float(model[-1].intercept_[0]),
                    'calibration_n': len(calibration_train), 'calibration_hits': sum(r['label'] for r in calibration_train),
                    'calibration_distinct_entry_dates': len({r['entry'] for r in calibration_train}),
                    'latest_calibration_exit': max((r['hard_exit'] for r in calibration_train), default=None),
                    'offset': offset, 'calibration_status': status, 'holding_baselines': baseline})
                probabilities = model.predict_proba(np.array([r['features'] for r in current]))[:,1]
                current_forecasts = [{**r, 'fit_id': fit_id, 'raw_probability': float(p),
                    'calibrated_probability': sigmoid(logit(float(p))+offset),
                    'holding_baseline_probability': baseline[str(r['hold'])]['probability'],
                    'calibration_status': status} for r, p in zip(current, probabilities)]
                history.extend(current_forecasts)
        all_forecasts.extend(history)
    evaluation = [r for r in all_forecasts if r['entry'] >= '2023-01-01']
    original = {(r['policy'], r['key']):r for r in json.loads(gzip.decompress(original_bytes))['forecasts']}
    assert len(evaluation) == len(original)
    max_replay_error = max(abs(r['raw_probability']-original[r['policy'],r['key']]['probability']) for r in evaluation)
    assert max_replay_error < 1e-12
    summaries = []
    for policy in POLICIES:
        for year in ['all','2023','2024','2025']:
            for hold in ['all',*HOLDS]:
                sample = [r for r in evaluation if r['policy'] == policy and
                          (year == 'all' or r['entry'].startswith(year)) and (hold == 'all' or r['hold'] == hold)]
                summaries.append({'policy': policy, 'period': year, 'holding': hold, **metrics(sample)})
    payload = {'schema_version': 1, 'fits': fits, 'forecasts': all_forecasts}
    compressed = gzip.compress(json.dumps(payload, allow_nan=False).encode(), mtime=0)
    summary = {'started_at_utc': started, 'completed_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
        'source_ledger_sha256': digest(source_bytes), 'original_predictions_sha256': digest(original_bytes),
        'original_runner_sha256': digest((ORIGINAL/'run.py').read_bytes()),
        'original_protocol_sha256': digest((ORIGINAL/'protocol.md').read_bytes()),
        'runner_sha256': digest(Path(__file__).read_bytes()), 'protocol_sha256': digest((HERE/'protocol.md').read_bytes()),
        'predictions_sha256': digest(compressed), 'numpy': np.__version__, 'sklearn': sklearn.__version__,
        'all_forecasts': len(all_forecasts), 'warmup_forecasts': len(all_forecasts)-len(evaluation),
        'evaluation_forecasts': len(evaluation), 'fit_count': len(fits), 'max_original_replay_error': max_replay_error,
        'skipped_features': dict(skipped_features), 'skipped_base_months': skipped_months,
        'evaluation_calibration_status': dict(collections.Counter(r['calibration_status'] for r in evaluation)),
        'summary': summaries}
    with (HERE/'predictions.json.gz').open('xb') as f:
        f.write(compressed)
    with (HERE/'summary.json').open('x') as f:
        json.dump(summary, f, indent=2, allow_nan=False)
        f.write('\n')
    print(json.dumps({k:v for k,v in summary.items() if k not in ['summary','skipped_base_months']}, indent=2))
    for row in summaries:
        if row['holding'] == 'all':
            print(json.dumps({k:v for k,v in row.items() if k not in PROBABILITIES}))


if __name__ == '__main__':
    main()
