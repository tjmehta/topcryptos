"""Independent frozen-output, causal-feature and equal-slot accounting checks.

Does not import the experiment runner or refit any models. Refuses to overwrite
its verification report. Execute with the isolated trading-libraries Python.
"""
import collections
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import statistics as st

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CANDIDATES = ('SMAATRBracket', 'ResistanceSMAATR')
MODES = ('geometry-ridge', 'state-ridge', 'historical-mean')


def close(a, b):
    if a is None or b is None:
        assert a is b, (a, b)
    else:
        assert math.isclose(a, b, rel_tol=1e-11, abs_tol=1e-12), (a, b)


def main():
    target = HERE / 'verification.json'
    if target.exists():
        raise FileExistsError(target)
    summary = json.loads((HERE / 'summary.json').read_text())
    raw = (HERE / 'ledger.json.gz').read_bytes()
    assert hashlib.sha256(raw).hexdigest() == summary['ledger_sha256']
    assert raw == (HERE / 'initial/ledger.json.gz').read_bytes()
    for filename, key in [('run.py', 'runner_sha256'), ('protocol.md', 'protocol_sha256')]:
        assert hashlib.sha256((HERE / filename).read_bytes()).hexdigest() == summary[key]
    source_raw = (ROOT / 'research/sell-zones/2026-09-13/ledger.json.gz').read_bytes()
    assert hashlib.sha256(source_raw).hexdigest() == summary['source_ledger_sha256']
    source = json.loads(gzip.decompress(source_raw))
    panel_raw = (ROOT / 'research/algorithm-comparison/high-flier-data/final/daily-panel.csv.gz').read_bytes()
    assert hashlib.sha256(panel_raw).hexdigest() == summary['panel_sha256']
    panel = list(csv.DictReader(io.StringIO(gzip.decompress(panel_raw).decode())))
    prices = {(b['cohort_year'] + ':' + b['identity_segment_id'], b['date']): b for b in panel}
    bitcoin = {(b['cohort_year'], b['date']): b for b in panel if b['symbol'] == 'BTCUSDT'}
    assert len(prices) == len(panel)
    data = json.loads(gzip.decompress(raw))
    events = {e['key']: e for e in data['events']}
    assert len(events) == len(data['events']) and events.keys() == source['outcomes'].keys()
    state_checks = geometry_checks = 0
    for key, event in events.items():
        identity, signal, holding = json.loads(key)
        variants = source['outcomes'][key]
        fixed = variants['FixedH']
        assert (event['entry'], event['hard_exit'], event['signal'], event['holding']) == (
            fixed['entry_date'], fixed['hard_exit_date'], signal, holding)
        day = dt.date.fromisoformat(signal)
        dates = [(day - dt.timedelta(days=i)).isoformat() for i in range(22)]
        bars = [prices.get((identity, d)) for d in dates]
        btc = [bitcoin.get((identity.split(':', 1)[0], d)) for d in dates]
        state = None
        if all(b is not None and b['bar_status'] == 'complete' for b in bars + btc):
            closes = np.array([float(b['close']) for b in bars])
            median_volume = float(np.median([float(b['quote_volume']) for b in bars[1:21]]))
            if np.isfinite(closes).all() and (closes > 0).all() and median_volume > 0 and float(btc[-1]['close']) > 0:
                state = [closes[0] / closes[i] - 1 for i in (1, 7, 21)] + [
                    float(np.std(np.log(closes[:20] / closes[1:21]))),
                    float(bars[0]['quote_volume']) / median_volume,
                    float(btc[0]['close']) / float(btc[-1]['close']) - 1]
                if not all(math.isfinite(v) for v in state):
                    state = None
        for candidate in CANDIDATES:
            o = variants[candidate]
            expected_delta = o['known_net'] - fixed['known_net'] if o['status'] == fixed['status'] == 'known' else None
            close(event['delta'][candidate], expected_delta)
            geometry = None
            entry = o['entry_price']
            if entry is not None and entry > 0 and all(o[k] is not None for k in ('target', 'stop', 'atr_sma14', 'prior20_resistance')):
                geometry = [o['target'] / entry - 1, o['stop'] / entry - 1,
                            o['atr_sma14'] / entry, o['prior20_resistance'] / entry - 1, math.log1p(holding)]
                if not all(math.isfinite(v) for v in geometry):
                    geometry = None
            expected = {'geometry-ridge': geometry,
                        'state-ridge': geometry + state if geometry is not None and state is not None else None}
            for mode, values in expected.items():
                got = event['features'][mode][candidate]
                if values is None:
                    assert got is None
                else:
                    assert len(values) == len(got)
                    for a, b in zip(values, got):
                        close(a, b)
                    geometry_checks += mode == 'geometry-ridge'
                    state_checks += mode == 'state-ridge'

    fits = {(f['mode'], f['candidate'], f['cutoff']): f for f in data['fits']}
    assert len(fits) == len(data['fits'])
    for (mode, candidate, cutoff), fit in fits.items():
        train = [e for e in events.values() if e['hard_exit'] < cutoff and e['delta'][candidate] is not None
                 and (mode == 'historical-mean' or e['features'][mode][candidate] is not None)]
        assert len(train) == fit['n']
        assert max((e['hard_exit'] for e in train), default=None) == fit['latest_training_exit']
        if mode == 'historical-mean':
            for hold, got in fit['means'].items():
                values = [e['delta'][candidate] for e in train if e['holding'] == int(hold)]
                close(st.mean(values) if len(values) >= 50 else None, got)
        else:
            assert len(train) >= 200
            assert len({e['signal'] for e in train}) == fit['distinct_training_signals']
            matrix = np.array([e['features'][mode][candidate] for e in train])
            assert np.allclose(matrix.mean(axis=0), fit['scaler_mean'], atol=1e-12, rtol=1e-11)
            scale = matrix.std(axis=0)
            scale[scale == 0] = 1
            assert np.allclose(scale, fit['scaler_scale'], atol=1e-12, rtol=1e-11)
    replayed_choices = 0
    expected_choices = {key for key, e in events.items() if '2023' <= e['entry'][:4] <= '2025'}
    assert data['choices'].keys() == expected_choices
    for key, modes in data['choices'].items():
        event = events[key]
        assert set(modes) == set(MODES)
        for mode, decision in modes.items():
            cutoff = event['entry'][:7] + '-01'
            assert decision['cutoff'] == cutoff <= event['entry']
            predicted = {}
            for candidate in CANDIDATES:
                fit = fits.get((mode, candidate, cutoff))
                values = event['features'].get(mode, {}).get(candidate)
                prediction = None
                if fit is not None:
                    if mode == 'historical-mean':
                        prediction = fit['means'][str(event['holding'])]
                    elif values is not None:
                        prediction = fit['intercept'] + sum(
                            (x - mean) / scale * coef for x, mean, scale, coef in zip(
                                values, fit['scaler_mean'], fit['scaler_scale'], fit['coefficients']))
                close(prediction, decision['predicted_advantages'][candidate])
                predicted[candidate] = prediction
            choice, best = 'FixedH', 0.
            for candidate in CANDIDATES:
                value = predicted[candidate]
                if value is not None and math.isfinite(value) and value > best:
                    choice, best = candidate, value
            assert choice == decision['choice']
            replayed_choices += 1

    cohorts = [r for r in source['cohorts'] if 2023 <= r['year'] <= 2025]
    assert cohorts == data['cohorts']
    aggregate_checks = 0
    for row in summary['summary']:
        sample = [r for r in cohorts if (r['view'], r['holding'], r['method']) == (
            row['view'], row['holding'], row['method']) and (row['period'] == '2023-2025' or str(r['year']) == row['period'])]
        assert len(sample) == row['cohorts']
        marks = {'net_zero': [], 'net_loss': []}
        differences = {'net_zero': [], 'net_loss': []}
        counts, statuses, durations = collections.Counter(), collections.Counter(), []
        for cohort in sample:
            outcomes = []
            for key in cohort['outcome_ids']:
                policy = row['policy'] if row['policy'] not in MODES else data['choices'][key][row['policy']]['choice']
                outcome = source['outcomes'][key][policy]
                outcomes.append(outcome)
                counts[policy] += 1
                statuses[outcome['status']] += 1
                if outcome['duration'] is not None:
                    durations.append(outcome['duration'])
            for mark in marks:
                fixed = sum(source['outcomes'][key]['FixedH'][mark] for key in cohort['outcome_ids']) / cohort['denominator']
                close(fixed, cohort['returns']['FixedH'][mark])
                value = sum(o[mark] for o in outcomes) / cohort['denominator']
                marks[mark].append(value)
                differences[mark].append(value - fixed)
        for mark, suffix in [('net_zero', 'zero'), ('net_loss', 'loss')]:
            close(st.mean(marks[mark]), row['mean_' + mark])
            close(st.mean(differences[mark]), row['paired_delta_' + suffix])
        ds = differences['net_zero']
        close(st.median(ds), row['median_paired_delta'])
        close(st.mean(sorted(ds)[:-1]) if len(ds) > 1 else None, row['without_best_paired_date'])
        assert sum(x > 0 for x in ds) == row['paired_wins']
        assert sum(x < 0 for x in ds) == row['paired_losses']
        assert dict(counts) == row['choice_counts'] and dict(statuses) == row['status_counts']
        assert sum(counts.values()) == row['selected_positions']
        close(st.mean(durations) if durations else None, row['mean_known_duration'])
        aggregate_checks += 1
    report = {'verified_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
              'scope': 'Independent raw feature reconstruction, source targets, mature training membership/scaling, fit arithmetic, choices and original-slot return aggregation; no refit or significance claim.',
              'ledger_sha256': summary['ledger_sha256'], 'verifier_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'initial_ledger_byte_identical': True, 'unique_events': len(events),
              'raw_geometry_vectors_checked': geometry_checks, 'raw_state_vectors_checked': state_checks,
              'prior_review': 'Before the BTC continuity guard correction, independent NumPy reconstruction also matched all 15,080 candidate state vectors; all 22-date BTC paths were complete. This verifier repeats the reconstruction against the corrected frozen run.',
              'verified_fits': len(fits), 'replayed_choices': replayed_choices,
              'source_cohorts_preserved': len(cohorts), 'verified_summary_rows': aggregate_checks}
    with target.open('x') as f:
        json.dump(report, f, indent=2)
        f.write('\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
