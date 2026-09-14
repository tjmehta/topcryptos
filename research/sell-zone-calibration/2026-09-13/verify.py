"""Independent standard-library ledger, maturity, probability and metric checks."""
import collections
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parents[1]
KEYS = ('raw_probability', 'calibrated_probability', 'holding_baseline_probability')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def logistic(x):
    return 1/(1+math.exp(-x)) if x >= 0 else math.exp(x)/(1+math.exp(x))


def main():
    if (HERE/'verification.json').exists():
        raise FileExistsError('verification.json')
    summary = json.loads((HERE/'summary.json').read_text())
    for field, path in {
        'runner_sha256': HERE/'run.py', 'protocol_sha256': HERE/'protocol.md',
        'predictions_sha256': HERE/'predictions.json.gz',
        'source_ledger_sha256': RESEARCH/'sell-zones/2026-09-13/ledger.json.gz',
        'original_predictions_sha256': RESEARCH/'sell-zone-forecast/2026-09-13/predictions.json.gz',
        'original_runner_sha256': RESEARCH/'sell-zone-forecast/2026-09-13/run.py',
        'original_protocol_sha256': RESEARCH/'sell-zone-forecast/2026-09-13/protocol.md',
    }.items():
        assert digest(path) == summary[field], field
    source = json.loads(gzip.decompress((RESEARCH/'sell-zones/2026-09-13/ledger.json.gz').read_bytes()))['outcomes']
    ledger = json.loads(gzip.decompress((HERE/'predictions.json.gz').read_bytes()))
    forecasts = ledger['forecasts']
    fits = {f['fit_id']:f for f in ledger['fits']}
    assert len(fits) == len(ledger['fits'])
    assert len({(r['policy'],r['key']) for r in forecasts}) == len(forecasts)
    events = collections.defaultdict(list)
    for key, outcomes in sorted(source.items()):
        identity, signal, hold = json.loads(key)
        for policy in ['SMAATRBracket', 'ResistanceSMAATR']:
            o = outcomes[policy]
            entry, atr, resistance, target, stop = [o[k] for k in
                ['entry_price','atr_sma14','prior20_resistance','target','stop']]
            if entry is None or entry <= 0 or atr is None or atr < 0 or resistance is None or target is None or stop is None or target <= entry:
                continue
            xs = [target/entry-1, stop/entry-1, atr/entry, resistance/entry-1, math.log1p(hold)]
            if not all(math.isfinite(x) for x in xs):
                continue
            events[policy].append({'key':key, 'entry':o['entry_date'], 'hard_exit':o['hard_exit_date'],
                                   'label':o['target_reach'], 'hold':hold, 'features':xs})
    event_by_id = {(policy,r['key']):r for policy,rows in events.items() for r in rows}
    for fit in fits.values():
        train = [r for r in events[fit['policy']] if r['hard_exit'] < fit['month'] and r['label'] is not None]
        assert len(train) == fit['training_n'] >= 200
        assert sum(r['label'] for r in train) == fit['training_hits']
        assert max(r['hard_exit'] for r in train) == fit['latest_training_exit'] < fit['month']
        assert len({r['label'] for r in train}) == 2
        calibration = [r for r in forecasts if r['policy'] == fit['policy'] and r['hard_exit'] < fit['month'] and r['label'] is not None]
        assert all(r['entry'] < fit['month'] and fits[r['fit_id']]['month'] < fit['month'] for r in calibration)
        assert len(calibration) == fit['calibration_n']
        assert sum(r['label'] for r in calibration) == fit['calibration_hits']
        assert max((r['hard_exit'] for r in calibration), default=None) == fit['latest_calibration_exit']
        assert len({r['entry'] for r in calibration}) == fit['calibration_distinct_entry_dates']
        if fit['calibration_status'] == 'calibrated':
            assert len(calibration) >= 200 and len({r['label'] for r in calibration}) == 2
            residual = 0.
            for r in calibration:
                p = min(1-1e-12, max(1e-12, r['raw_probability']))
                residual += logistic(math.log(p/(1-p))+fit['offset'])-r['label']
            assert abs(residual) < 1e-8
        else:
            assert len(calibration) < 200 or len({r['label'] for r in calibration}) < 2
            assert fit['offset'] == 0
        for hold, baseline in fit['holding_baselines'].items():
            sample = [r for r in train if r['hold'] == int(hold)]
            assert len(sample) == baseline['n']
            assert sum(r['label'] for r in sample) == baseline['hits']
            assert baseline['probability'] == (baseline['hits']+1)/(baseline['n']+2)
    original = {(r['policy'],r['key']):r for r in json.loads(gzip.decompress((RESEARCH/'sell-zone-forecast/2026-09-13/predictions.json.gz').read_bytes()))['forecasts']}
    evaluation = []
    for r in forecasts:
        event = event_by_id[r['policy'],r['key']]
        fit = fits[r['fit_id']]
        for key in ['entry','hard_exit','label','hold','features']:
            assert r[key] == event[key]
        assert r['entry'][:7] == fit['month'][:7]
        x = fit['intercept'] + sum(c*(v-m)/s for c,v,m,s in zip(fit['coefficients'],r['features'],fit['scaler_mean'],fit['scaler_scale']))
        assert abs(logistic(x)-r['raw_probability']) < 1e-12
        raw = min(1-1e-12,max(1e-12,r['raw_probability']))
        assert abs(logistic(math.log(raw/(1-raw))+fit['offset'])-r['calibrated_probability']) < 1e-12
        assert fit['holding_baselines'][str(r['hold'])]['probability'] == r['holding_baseline_probability']
        if r['entry'] >= '2023-01-01':
            evaluation.append(r)
            assert abs(r['raw_probability']-original[r['policy'],r['key']]['probability']) < 1e-12
    assert len(evaluation) == len(original) == summary['evaluation_forecasts']
    metrics = []
    for cell in summary['summary']:
        rows = [r for r in evaluation if r['policy'] == cell['policy'] and
                (cell['period'] == 'all' or r['entry'].startswith(cell['period'])) and
                (cell['holding'] == 'all' or r['hold'] == cell['holding'])]
        known = [r for r in rows if r['label'] is not None]
        assert len(rows) == cell['events'] and len(known) == cell['known']
        assert len(rows)-len(known) == cell['unknown']
        assert len({r['entry'] for r in known}) == cell['distinct_entry_dates']
        checked = {k:cell[k] for k in ['policy','period','holding','known','unknown']}
        if known:
            assert abs(statistics.mean(r['label'] for r in known)-cell['hit_rate']) < 1e-12
            for key in KEYS:
                brier = statistics.mean((r[key]-r['label'])**2 for r in known)
                loss = statistics.mean(-r['label']*math.log(min(1-1e-12,max(1e-12,r[key])))-(1-r['label'])*math.log(1-min(1-1e-12,max(1e-12,r[key]))) for r in known)
                assert abs(brier-cell[key]['brier']) < 1e-12
                assert abs(loss-cell[key]['log_loss']) < 1e-12
                assert abs(statistics.mean(r[key] for r in known)-cell[key]['mean_probability']) < 1e-12
                assigned = 0
                for bucket in cell[key]['reliability']:
                    sample = [r for r in known if r[key] >= bucket['lower'] and (r[key] < bucket['upper'] or bucket['upper'] == 1 and r[key] <= 1)]
                    assigned += len(sample)
                    assert len(sample) == bucket['n']
                    assert abs(statistics.mean(r[key] for r in sample)-bucket['mean_probability']) < 1e-12
                    assert abs(statistics.mean(r['label'] for r in sample)-bucket['hit_rate']) < 1e-12
                assert assigned == len(known)
                checked[key+'_brier'] = brier
        metrics.append(checked)
    result = {'verified_at_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
        'verifier_sha256':digest(Path(__file__)), 'predictions_sha256':summary['predictions_sha256'],
        'verified_fits':len(fits), 'verified_forecasts':len(forecasts), 'verified_evaluation_forecasts':len(evaluation),
        'verified_cells':len(metrics), 'scope':'Independent source, strict hard-horizon maturity, prequential calibration membership, offset likelihood score, probability, baseline, all metric and reliability arithmetic checks. Base fitting is separately covered by runner perturbation tests and exact original replay.',
        'summary':metrics}
    with (HERE/'verification.json').open('x') as f:
        json.dump(result,f,indent=2,allow_nan=False)
        f.write('\n')
    print(json.dumps({k:v for k,v in result.items() if k != 'summary'},indent=2))


if __name__ == '__main__':
    main()
