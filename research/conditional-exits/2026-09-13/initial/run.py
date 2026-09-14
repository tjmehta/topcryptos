"""Entry-time conditional level-exit models; see the frozen protocol."""
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
import sys

import numpy as np
import sklearn
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / 'research/sell-zones/2026-09-13'
DATA = ROOT / 'research/algorithm-comparison/high-flier-data/final'
CANDIDATES = ('SMAATRBracket', 'ResistanceSMAATR')
MODES = ('geometry-ridge', 'state-ridge', 'historical-mean')
DAY = dt.timedelta(days=1)


def geometry(o, holding):
    entry = o['entry_price']
    if entry is None or entry <= 0 or any(o[k] is None for k in ['target', 'stop', 'atr_sma14', 'prior20_resistance']):
        return None
    xs = [o['target']/entry-1, o['stop']/entry-1, o['atr_sma14']/entry,
          o['prior20_resistance']/entry-1, math.log1p(holding)]
    return xs if all(math.isfinite(x) for x in xs) else None


def signal_state(identity, signal, prices, bitcoin):
    date = dt.date.fromisoformat(signal)
    dates = [(date-i*DAY).isoformat() for i in range(22)]
    bars = [prices.get((identity, d)) for d in dates]
    btc = [bitcoin.get((identity.split(':', 1)[0], dates[i])) for i in [0, 21]]
    if any(b is None or b['bar_status'] != 'complete' for b in bars + btc):
        return None
    closes = [float(b['close']) for b in bars]
    if any(x <= 0 or not math.isfinite(x) for x in closes):
        return None
    previous_volume = st.median(float(b['quote_volume']) for b in bars[1:21])
    if previous_volume <= 0 or float(btc[1]['close']) <= 0:
        return None
    xs = [closes[0]/closes[i]-1 for i in [1, 7, 21]]
    xs += [st.pstdev(math.log(closes[i]/closes[i+1]) for i in range(20)),
           float(bars[0]['quote_volume'])/previous_volume,
           float(btc[0]['close'])/float(btc[1]['close'])-1]
    return xs if all(math.isfinite(x) for x in xs) else None


def pick(predictions):
    valid = [(value, -i, name) for i, name in enumerate(CANDIDATES)
             if (value := predictions.get(name)) is not None and math.isfinite(value) and value > 0]
    return max(valid)[2] if valid else 'FixedH'


def training_rows(events, cutoff, candidate, mode):
    return [r for r in events if r['hard_exit'] < cutoff and r['delta'][candidate] is not None
            and (mode == 'historical-mean' or r['features'][mode][candidate] is not None)]


def selftest():
    assert pick({}) == 'FixedH'
    assert pick({'SMAATRBracket': -1, 'ResistanceSMAATR': 0}) == 'FixedH'
    assert pick({'SMAATRBracket': .1, 'ResistanceSMAATR': .2}) == 'ResistanceSMAATR'
    assert pick({'SMAATRBracket': .1, 'ResistanceSMAATR': .1}) == 'SMAATRBracket'
    event = {'hard_exit': '2023-01-01', 'delta': {'SMAATRBracket': .1}, 'features': {}}
    assert not training_rows([event], '2023-01-01', 'SMAATRBracket', 'historical-mean')
    assert training_rows([event], '2023-01-02', 'SMAATRBracket', 'historical-mean') == [event]
    o = {'entry_price': 100., 'target': 120., 'stop': 90., 'atr_sma14': 5., 'prior20_resistance': 130.}
    assert geometry(o, 30) == geometry({**o, 'exit_price': 1., 'target_reach': False}, 30)
    signal = dt.date(2022, 1, 25)
    prices, btc = {}, {}
    for i in range(22):
        d = (signal-i*DAY).isoformat()
        bar = {'bar_status': 'complete', 'close': str(100-i), 'quote_volume': '1000000'}
        prices['2022:X', d] = bar
        btc['2022', d] = bar
    before = signal_state('2022:X', signal.isoformat(), prices, btc)
    prices['2022:X', (signal+DAY).isoformat()] = {'close': '100000000'}
    assert signal_state('2022:X', signal.isoformat(), prices, btc) == before


def summarize(cohorts, choices, outcomes):
    groups = collections.defaultdict(list)
    for r in cohorts:
        for period in ['2023-2025', str(r['year'])]:
            groups[r['view'], r['holding'], r['method'], period].append(r)
    result = []
    for (view, holding, method, period), rs in sorted(groups.items()):
        for mode in ('FixedH', *CANDIDATES, *MODES):
            returns = {'net_zero': [], 'net_loss': []}
            deltas = {'net_zero': [], 'net_loss': []}
            counts, statuses, durations = collections.Counter(), collections.Counter(), []
            details = []
            for r in rs:
                selected = [(key, choices[key][mode]['choice'] if mode in MODES else mode) for key in r['outcome_ids']]
                vals = [outcomes[key][policy] for key, policy in selected]
                counts.update(policy for _, policy in selected)
                statuses.update(o['status'] for o in vals)
                durations += [o['duration'] for o in vals if o['duration'] is not None]
                detail = {'signal': r['signal'], 'selected': selected}
                for scenario in returns:
                    value = sum(o[scenario] for o in vals)/r['denominator']
                    returns[scenario].append(value)
                    deltas[scenario].append(value-r['returns']['FixedH'][scenario])
                    detail[scenario] = value
                details.append(detail)
            ds = deltas['net_zero']
            result.append({'view': view, 'holding': holding, 'method': method, 'period': period,
                'policy': mode, 'cohorts': len(rs), 'selected_positions': sum(counts.values()),
                'mean_net_zero': st.mean(returns['net_zero']), 'mean_net_loss': st.mean(returns['net_loss']),
                'paired_delta_zero': st.mean(ds), 'paired_delta_loss': st.mean(deltas['net_loss']),
                'paired_wins': sum(x > 0 for x in ds), 'paired_losses': sum(x < 0 for x in ds),
                'median_paired_delta': st.median(ds),
                'without_best_paired_date': (sum(ds)-max(ds))/(len(ds)-1) if len(ds)>1 else None,
                'choice_counts': dict(counts), 'status_counts': dict(statuses),
                'mean_known_duration': st.mean(durations) if durations else None})
    return result


def main():
    selftest()
    if '--selftest' in sys.argv:
        print('Fallback, tie, maturity, future-bar and future-outcome feature tests passed')
        return
    for name in ['summary.json', 'ledger.json.gz']:
        if (HERE/name).exists():
            raise FileExistsError(name)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    raw = (SOURCE/'ledger.json.gz').read_bytes()
    source_summary = json.loads((SOURCE/'summary.json').read_text())
    assert hashlib.sha256(raw).hexdigest() == source_summary['ledger_sha256']
    source = json.loads(gzip.decompress(raw))
    panel_raw = (DATA/'daily-panel.csv.gz').read_bytes()
    manifest = json.loads((DATA/'file-hashes.json').read_text())
    expected = next(x['sha256'] for x in manifest['artifacts'] if x['path'].endswith('/daily-panel.csv.gz'))
    assert hashlib.sha256(panel_raw).hexdigest() == expected
    prices, btc = {}, {}
    for bar in csv.DictReader(io.StringIO(gzip.decompress(panel_raw).decode())):
        key = bar['cohort_year']+':'+bar['identity_segment_id']
        assert (key, bar['date']) not in prices
        prices[key, bar['date']] = bar
        if bar['symbol'] == 'BTCUSDT':
            assert (bar['cohort_year'], bar['date']) not in btc
            btc[bar['cohort_year'], bar['date']] = bar
    events, states = [], {}
    for key, outcomes in sorted(source['outcomes'].items()):
        identity, signal, hold = json.loads(key)
        if (identity, signal) not in states:
            states[identity, signal] = signal_state(identity, signal, prices, btc)
        state = states[identity, signal]
        gs = {candidate: geometry(outcomes[candidate], hold) for candidate in CANDIDATES}
        deltas = {candidate: outcomes[candidate]['known_net']-outcomes['FixedH']['known_net']
                  if outcomes[candidate]['status'] == outcomes['FixedH']['status'] == 'known' else None for candidate in CANDIDATES}
        events.append({'key': key, 'entry': outcomes['FixedH']['entry_date'], 'hard_exit': outcomes['FixedH']['hard_exit_date'],
            'holding': hold, 'signal': signal, 'delta': deltas,
            'features': {'geometry-ridge': gs, 'state-ridge': {c: gs[c]+state if gs[c] is not None and state is not None else None for c in CANDIDATES}}})
    assert len({r['key'] for r in events}) == len(events)
    fits, choices = [], {}
    for year in range(2023, 2026):
        for month in range(1, 13):
            cutoff = f'{year}-{month:02d}-01'
            test = [r for r in events if r['entry'][:7] == cutoff[:7]]
            if not test:
                continue
            for r in test:
                choices[r['key']] = {}
            for mode in MODES:
                models, means = {}, {}
                for candidate in CANDIDATES:
                    train = training_rows(events, cutoff, candidate, mode)
                    assert all(r['hard_exit'] < cutoff <= min(t['entry'] for t in test) for r in train)
                    if mode == 'historical-mean':
                        means[candidate] = {}
                        for hold in [14,30,60,90]:
                            sample = [r['delta'][candidate] for r in train if r['holding'] == hold]
                            means[candidate][hold] = st.mean(sample) if len(sample) >= 50 else None
                        fits.append({'mode': mode, 'candidate': candidate, 'cutoff': cutoff, 'n': len(train),
                                     'latest_training_exit': max((r['hard_exit'] for r in train), default=None),
                                     'means': means[candidate]})
                    elif len(train) >= 200:
                        x = np.array([r['features'][mode][candidate] for r in train])
                        y = np.array([r['delta'][candidate] for r in train])
                        model = make_pipeline(StandardScaler(), Ridge(alpha=10.))
                        model.fit(x, y)
                        models[candidate] = model
                        fits.append({'mode': mode, 'candidate': candidate, 'cutoff': cutoff, 'n': len(train),
                            'latest_training_exit': max(r['hard_exit'] for r in train),
                            'distinct_training_signals': len({r['signal'] for r in train}),
                            'scaler_mean': model[0].mean_.tolist(), 'scaler_scale': model[0].scale_.tolist(),
                            'coefficients': model[-1].coef_.tolist(), 'intercept': float(model[-1].intercept_)})
                for r in test:
                    predictions = {}
                    for candidate in CANDIDATES:
                        if mode == 'historical-mean':
                            predictions[candidate] = means[candidate].get(r['holding'])
                        else:
                            xs = r['features'][mode][candidate]
                            predictions[candidate] = float(models[candidate].predict([xs])[0]) if candidate in models and xs is not None else None
                    choices[r['key']][mode] = {'choice': pick(predictions), 'predicted_advantages': predictions, 'cutoff': cutoff}
    cohorts = [r for r in source['cohorts'] if 2023 <= r['year'] <= 2025]
    assert all(key in choices for r in cohorts for key in r['outcome_ids'])
    summaries = summarize(cohorts, choices, source['outcomes'])
    payload = {'events': events, 'fits': fits, 'choices': choices, 'cohorts': cohorts}
    compressed = gzip.compress(json.dumps(payload, allow_nan=False).encode(), mtime=0)
    result = {'started_at_utc': started, 'completed_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
        'source_ledger_sha256': source_summary['ledger_sha256'], 'panel_sha256': expected,
        'runner_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'protocol_sha256': hashlib.sha256((HERE/'protocol.md').read_bytes()).hexdigest(),
        'ledger_sha256': hashlib.sha256(compressed).hexdigest(), 'sklearn': sklearn.__version__, 'numpy': np.__version__,
        'unique_events': len(events), 'evaluation_events': len(choices), 'cohorts': len(cohorts),
        'missing_signal_states': sum(v is None for v in states.values()), 'summary': summaries}
    with (HERE/'ledger.json.gz').open('xb') as f:
        f.write(compressed)
    with (HERE/'summary.json').open('x') as f:
        json.dump(result, f, indent=2, allow_nan=False)
        f.write('\n')
    print(json.dumps({k:v for k,v in result.items() if k != 'summary'}, indent=2))


if __name__ == '__main__':
    main()
