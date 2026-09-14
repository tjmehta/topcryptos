"""Bounded offline horizon comparison; see protocol.md. No production imports."""
import collections
import datetime as dt
import functools
import gzip
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import statistics as st
import sys

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / 'algorithm-comparison' / 'high-flier-runner.py'
spec = importlib.util.spec_from_file_location('frozen_high_flier', SOURCE)
hf = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = hf
spec.loader.exec_module(hf)
DAY = dt.timedelta(days=1)
VIEWS = (3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90)
HOLDINGS = (7, 14, 30, 60, 90, 365)


def grade(by_date, signal, holding):
    entry_day = signal + 2 * DAY
    exit_day = entry_day + holding * DAY
    entry, exit_bar = by_date.get(entry_day), by_date.get(exit_day)
    if entry is None or not hf.bar_open_is_executable(entry):
        return dict(entry_missing=True, exit_missing=False, net_zero=0., net_loss=0.,
                    known_net=None, hit=False, unknown_path=True, mfe=None, mae=None)
    good_exit = exit_bar is not None and hf.bar_open_is_executable(exit_bar)
    gross = exit_bar.open / entry.open - 1 if good_exit else None
    bars = [by_date.get(entry_day + i * DAY) for i in range(holding)]
    complete = all(b is not None and hf.bar_is_complete(b) for b in bars)
    highs = [b.high for b in bars if b is not None and hf.bar_is_complete(b)]
    lows = [b.low for b in bars if b is not None and hf.bar_is_complete(b)]
    return dict(entry_missing=False, exit_missing=not good_exit,
                net_zero=hf.net_return_from_gross(gross if good_exit else 0., 50),
                net_loss=hf.net_return_from_gross(gross if good_exit else -1., 50),
                known_net=hf.net_return_from_gross(gross, 50) if good_exit else None,
                hit=bool(highs and max(highs) >= 1.2 * entry.open),
                unknown_path=not complete,
                mfe=max(highs) / entry.open - 1 if complete else None,
                mae=min(lows) / entry.open - 1 if complete else None)


def selftest():
    signal = dt.date(2020, 1, 1)
    def bar(offset, price, high=None):
        return hf.Bar(symbol='X', date=signal + offset * DAY, open=price,
                      close=price, high=high or price, low=price, quote_volume=1e7,
                      cohort_member=True)
    rows = {b.date: b for b in [bar(1, 999), bar(2, 100, 150), bar(3, 110)]}
    x = grade(rows, signal, 1)
    assert math.isclose(x['known_net'], 1.1 * .995 / 1.005 - 1)
    assert x['hit'] and math.isclose(x['mfe'], .5)
    assert x['known_net'] < .1  # Never sell at the future high or signal close.
    missing_entry = grade({signal + DAY: bar(1, 100)}, signal, 1)
    assert missing_entry['entry_missing'] and missing_entry['net_loss'] == 0
    missing_exit = grade({signal + 2 * DAY: bar(2, 100)}, signal, 1)
    assert missing_exit['exit_missing'] and missing_exit['net_loss'] == -1
    assert missing_exit['net_zero'] < 0  # Fees on zero-gross missing mark.
    assert grade({}, signal, 1)['entry_missing']  # No other identity fallback.
    incomplete = grade(rows, signal, 4)
    assert incomplete['hit'] and incomplete['unknown_path'] and incomplete['mfe'] is None


def score(bars, index, view):
    values = [math.log(b.close) for b in bars[index-view+1:index+1]]
    momentum = values[-1] - values[0]
    if momentum <= 0:
        return None, None
    xs = [(i - (view - 1) / 2) for i in range(view)]
    average = st.mean(values)
    xx = sum(x*x for x in xs)
    yy = sum((y-average)**2 for y in values)
    xy = sum(x*(y-average) for x, y in zip(xs, values))
    slope = xy / xx
    quality = slope * min(1., xy*xy/(xx*yy)) if yy > 0 else 0.
    return momentum, quality if quality > 0 else None


def average(values):
    return st.mean(values) if values else None


def summarize(records):
    groups = collections.defaultdict(list)
    for r in records:
        labels = ['all', str(r['year']), '2020-2022' if r['year'] <= 2022 else '2023-2025']
        if r['anchor'] <= 2:
            labels += ['common-year-start', 'common-year-start-' + ('2020-2022' if r['year'] <= 2022 else '2023-2025')]
        for label in labels:
            groups[(r['view'], r['holding'], r['method'], label)].append(r)
    output = []
    for (view, holding, method, period), rs in sorted(groups.items()):
        positions = [p for r in rs for p in r['positions']]
        known = [p['known_net'] for p in positions if p['known_net'] is not None]
        row = dict(view=view, holding=holding, method=method, period=period,
                   cohorts=len(rs), slots=sum(r['denominator'] for r in rs),
                   selected=len(positions), entry_missing=sum(p['entry_missing'] for p in positions),
                   exit_missing=sum(p['exit_missing'] for p in positions),
                   mean_net_zero=average([r['net_zero'] for r in rs]),
                   mean_net_loss=average([r['net_loss'] for r in rs]),
                   mean_excess_zero=average([r['excess_zero'] for r in rs]),
                   mean_excess_loss=average([r['excess_loss'] for r in rs]),
                   median_known_net=st.median(known) if known else None,
                   positive_known=sum(x > 0 for x in known), known=len(known),
                   observed_20pct_hits=sum(p['hit'] for p in positions),
                   unknown_paths=sum(p['unknown_path'] for p in positions),
                   mean_mfe_complete=average([p['mfe'] for p in positions if p['mfe'] is not None]),
                   mean_mae_complete=average([p['mae'] for p in positions if p['mae'] is not None]))
        output.append(row)
    return output


def main():
    outputs = [HERE / 'summary.json', HERE / 'cohorts.json.gz']
    if any(p.exists() for p in outputs):
        raise SystemExit('Refusing to overwrite existing results')
    selftest()
    manifest, _, members, raw, provenance = hf.load_frozen_dataset(SOURCE.parent / 'high-flier-data' / 'final')
    panel = hf.read_panel_csv(raw, hf.read_membership_csv(members))
    positions, by_date = hf.panel_indexes(panel)
    @functools.lru_cache(maxsize=None)
    def outcome(key, signal, holding):
        return grade(by_date[key], signal, holding)
    year_keys = collections.defaultdict(list)
    for key, bars in panel.items():
        year_keys[bars[0].cohort_year].append(key)
    records, skips = [], []
    for year in range(2020, 2026):
        for anchor in range(12):
            signal = dt.date(year, 1, 1) + 28 * anchor * DAY
            for view in VIEWS:
                eligible, scores = [], {'Momentum': {}, 'TrendQuality': {}}
                for key in sorted(year_keys[year]):
                    idx = positions[key].get(signal)
                    bars = panel[key]
                    if idx is None or not hf.is_eligible(bars, idx) or not hf.consecutive_through(bars, idx, view):
                        continue
                    assert bars[idx].date == signal
                    eligible.append(key)
                    a, b = score(bars, idx, view)
                    for method, value in [('Momentum', a), ('TrendQuality', b)]:
                        if value is not None:
                            scores[method][key] = value
                if not eligible:
                    skips.append(dict(year=year, anchor=anchor, view=view, reason='no formation-eligible instruments'))
                    continue
                selected = {m: sorted(s, key=lambda k: (-s[k], k))[:10] for m, s in scores.items()}
                selected['Universe'] = eligible
                for holding in HOLDINGS:
                    if holding == 365 and anchor > 2:
                        continue
                    assert signal + (2 + holding) * DAY < dt.date(year+1, 3, 1)
                    universe = [outcome(k, signal, holding) for k in eligible]
                    baseline = {scenario: st.mean(p[scenario] for p in universe) for scenario in ['net_zero', 'net_loss']}
                    for method, keys in selected.items():
                        denominator = len(eligible) if method == 'Universe' else 10
                        ps = [dict(id=k, symbol=panel[k][0].symbol, **outcome(k, signal, holding)) for k in keys]
                        assert len(ps) <= denominator
                        means = {scenario: sum(p[scenario] for p in ps) / denominator for scenario in baseline}
                        records.append(dict(year=year, anchor=anchor, signal=signal.isoformat(), view=view,
                                            holding=holding, method=method, denominator=denominator,
                                            eligible=len(eligible), positions=ps, **means,
                                            excess_zero=means['net_zero']-baseline['net_zero'],
                                            excess_loss=means['net_loss']-baseline['net_loss']))
        print('Completed cohort year', year, flush=True)
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__), HERE/'protocol.md', SOURCE]}
    summary = dict(status='exploratory-price-signal-comparison-not-Classic', hashes=hashes,
                   provenance=provenance, views=VIEWS, holdings=HOLDINGS, selftest='passed',
                   skips=skips, summary=summarize(records))
    ledger = json.dumps(records, separators=(',', ':'), allow_nan=False).encode()
    with outputs[1].open('xb') as f:
        f.write(gzip.compress(ledger, mtime=0))
    summary['ledger_sha256'] = hashlib.sha256(outputs[1].read_bytes()).hexdigest()
    with outputs[0].open('x') as f:
        json.dump(summary, f, indent=2, allow_nan=False)
        f.write('\n')
    print(json.dumps({'cohort_records': len(records), 'summary_rows': len(summary['summary']),
                      'skips': len(skips), 'hashes': hashes}))


if __name__ == '__main__':
    main()
