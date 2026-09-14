"""Independent probability arithmetic and stronger same-horizon baseline.

Added after first model results; no model is refit. The extra baseline prevents
crediting the model solely for knowing that longer horizons have more hits.
"""
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics as st

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / 'sell-zones/2026-09-13'


def main():
    summary = json.loads((HERE/'summary.json').read_text())
    raw = (HERE/'predictions.json.gz').read_bytes()
    assert hashlib.sha256(raw).hexdigest() == summary['predictions_sha256']
    source_raw = (SOURCE/'ledger.json.gz').read_bytes()
    assert hashlib.sha256(source_raw).hexdigest() == summary['source_ledger_sha256']
    for name in ['runner', 'protocol']:
        filename = 'run.py' if name == 'runner' else 'protocol.md'
        assert hashlib.sha256((HERE/filename).read_bytes()).hexdigest() == summary[name+'_sha256']
    source = json.loads(gzip.decompress(source_raw))['outcomes']
    payload = json.loads(gzip.decompress(raw))
    fits = {f['fit_id']: f for f in payload['fits']}
    training = {}
    for fit_id, fit in fits.items():
        sample = []
        for key, variants in source.items():
            o = variants[fit['policy']]
            if o['hard_exit_date'] >= fit['month'] or o['target_reach'] is None:
                continue
            if o['entry_price'] is None or o['target'] is None or o['stop'] is None or o['prior20_resistance'] is None or o['atr_sma14'] is None:
                continue
            sample.append((key, o))
        assert len(sample) == fit['training_n']
        assert sum(o['target_reach'] for _, o in sample) == fit['training_hits']
        assert max(o['hard_exit_date'] for _, o in sample) == fit['latest_training_exit'] < fit['month']
        assert fit['base_rate'] == (fit['training_hits']+1)/(len(sample)+2)
        training[fit_id] = sample
    observations = []
    for r in payload['forecasts']:
        fit = fits[r['fit_id']]
        o = source[r['key']][r['policy']]
        assert o['target_reach'] == r['label'] and o['entry_date'] == r['entry']
        assert r['entry'][:7] == fit['month'][:7]
        entry = o['entry_price']
        expected = [o['target']/entry-1, o['stop']/entry-1, o['atr_sma14']/entry,
                    o['prior20_resistance']/entry-1, math.log1p(r['hold'])]
        assert expected == r['features']
        linear = fit['intercept'] + sum(c*(x-m)/s for c,x,m,s in zip(fit['coefficients'], expected, fit['scaler_mean'], fit['scaler_scale']))
        p = 1/(1+math.exp(-linear))
        assert abs(p-r['probability']) < 1e-12
        sample = [o for key,o in training[r['fit_id']] if json.loads(key)[2] == r['hold']]
        base = (sum(o['target_reach'] for o in sample)+1)/(len(sample)+2)
        observations.append({**r, 'holding_baseline_probability': base})
    rows = []
    for policy in ['SMAATRBracket', 'ResistanceSMAATR']:
        for period in ['all', '2023', '2024', '2025']:
            selected = [r for r in observations if r['policy'] == policy and r['label'] is not None
                        and (period == 'all' or r['entry'].startswith(period))]
            losses = {k: st.mean((r[k]-r['label'])**2 for r in selected) for k in
                      ['probability', 'baseline_probability', 'holding_baseline_probability']}
            original = next(x for x in summary['summary'] if x['policy'] == policy and x['period'] == period and x['holding'] == 'all')
            assert abs(losses['probability'] - original['model_brier']) < 1e-12
            assert abs(losses['baseline_probability'] - original['baseline_brier']) < 1e-12
            rows.append({'policy': policy, 'period': period, 'known': len(selected),
                         'model_brier': losses['probability'], 'pooled_baseline_brier': losses['baseline_probability'],
                         'same_holding_baseline_brier': losses['holding_baseline_probability'],
                         'improvement_over_same_holding': losses['holding_baseline_probability']-losses['probability']})
    result = {'verified_forecasts': len(observations), 'verified_fits': len(fits),
              'forecast_ledger_sha256': summary['predictions_sha256'],
              'verifier_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'scope': 'Arithmetic/source/maturity checks and post-result same-holding baseline; no refit',
              'summary': rows}
    target = HERE/'verification.json'
    with target.open('x') as f:
        json.dump(result, f, indent=2)
        f.write('\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
