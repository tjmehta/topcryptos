"""Independent raw-CSV reconstruction; does not import either experiment runner."""
import collections
import csv
import datetime as dt
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics as st

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATA = ROOT / 'research/algorithm-comparison/high-flier-data/final'
NATIVE = ROOT / 'research/holding-horizons'
DAY = dt.timedelta(days=1)
VIEWS = (3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90)
HOLDS = (7, 14, 30, 60, 90, 365)
METHODS = ('Momentum', 'TrendQuality', 'ATRNormalizedMomentum', 'EMAConfirmedMomentum', 'Breakout', 'VolumeBreakout')
SCENARIOS = ('net_zero', 'net_loss', 'net100_zero', 'net100_loss')
MAX_ERROR = 0.


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def eq(actual, expected, where=''):
    global MAX_ERROR
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys(), (where, actual.keys(), expected.keys())
        for key in expected:
            eq(actual[key], expected[key], where+'/'+str(key))
    elif isinstance(expected, (list, tuple)):
        assert len(actual) == len(expected), (where, len(actual), len(expected))
        for i, (a, b) in enumerate(zip(actual, expected)):
            eq(a, b, where+'/'+str(i))
    elif isinstance(expected, float):
        assert math.isfinite(actual) and math.isclose(actual, expected, rel_tol=2e-11, abs_tol=2e-13), (where, actual, expected)
        MAX_ERROR = max(MAX_ERROR, abs(actual-expected))
    else:
        assert actual == expected, (where, actual, expected)


def status(row):
    raw = row['bar_status'].split('|')[0]
    return 'complete' if raw == 'valid' else raw


def complete(row):
    return row is not None and status(row) == 'complete'


def executable(row):
    return row is not None and status(row) in ('complete', 'partial_terminal') and not (
        {'not_utc_midnight', 'non_midnight_first_trade'} & set(row['bar_status'].split('|')[1:])) and (
        math.isfinite(row['open']) and row['open'] > 0 and row['trade_count'] > 0
        and row['base_volume'] > 0 and row['quote_volume'] > 0)


def eligible(rows, signal, view, membership):
    last = rows.get(signal)
    if not complete(last) or (signal.year, last['symbol']) not in membership:
        return False
    if not all(complete(rows.get(signal-i*DAY)) for i in range(max(60, view))):
        return False
    return st.median(rows[signal-i*DAY]['quote_volume'] for i in range(1, 21)) >= 1e6


def ema(xs, period):
    value = sum(xs[:period])/period
    for x in xs[period:]:
        value += 2/(period+1)*(x-value)
    return value


def scores(rows, signal, view):
    bars = [rows[signal-i*DAY] for i in reversed(range(max(60, view)))]
    closes = [r['close'] for r in bars]
    ys = [math.log(x) for x in closes[-view:]]
    momentum = ys[-1]-ys[0]
    xs = [i-(view-1)/2 for i in range(view)]
    ybar = st.mean(ys)
    cov = sum(x*(y-ybar) for x,y in zip(xs, ys))
    xx = sum(x*x for x in xs)
    yy = sum((y-ybar)**2 for y in ys)
    quality = cov/xx*min(1., cov*cov/(xx*yy)) if yy > 0 else 0.
    tr = [max(b['high']-b['low'], abs(b['high']-a['close']), abs(b['low']-a['close'])) for a,b in zip(bars, bars[1:])]
    atr = sum(tr[:14])/14
    for value in tr[14:]:
        atr = (13*atr+value)/14
    fast = ema(closes, max(2, (view+1)//3))
    slow = ema(closes, view)
    breakout = math.log(closes[-1]/max(b['high'] for b in bars[-view:-1]))
    volume_ok = bars[-1]['quote_volume'] >= 1.5*st.median(b['quote_volume'] for b in bars[-21:-1])
    return dict(Momentum=momentum if momentum > 0 else None,
        TrendQuality=quality if momentum > 0 and quality > 0 else None,
        ATRNormalizedMomentum=momentum*closes[-1]/atr if momentum > 0 and atr > 0 else None,
        EMAConfirmedMomentum=momentum if momentum > 0 and fast > slow else None,
        Breakout=breakout if breakout > 0 else None,
        VolumeBreakout=breakout if breakout > 0 and volume_ok else None)


def outcome(rows, identity, signal, hold):
    entry_date = signal+2*DAY
    exit_date = entry_date+hold*DAY
    entry, exit_row = rows.get(entry_date), rows.get(exit_date)
    ep = entry['open'] if executable(entry) else None
    xp = exit_row['open'] if executable(exit_row) else None
    base = dict(id=identity, symbol=next(iter(rows.values()))['symbol'],
        entry_date=str(entry_date), exit_date=str(exit_date), entry_price=ep, exit_price=xp)
    def net(gross, cost):
        return (1+gross)*(1-cost)/(1+cost)-1
    if ep is None:
        return dict(**base, entry_missing=True, exit_missing=False, net_zero=0., net_loss=0.,
            known_net=None, hit=False, unknown_path=True, mfe=None, mae=None,
            net100_zero=0., net100_loss=0.)
    gross = xp/ep-1 if xp is not None else None
    path = [rows.get(entry_date+i*DAY) for i in range(hold)]
    known_path = [r for r in path if complete(r)]
    complete_path = len(known_path) == hold
    return dict(**base, entry_missing=False, exit_missing=xp is None,
        net_zero=net(gross if gross is not None else 0., .005),
        net_loss=net(gross if gross is not None else -1., .005),
        known_net=net(gross, .005) if gross is not None else None,
        hit=any(r['high'] >= 1.2*ep for r in known_path), unknown_path=not complete_path,
        mfe=max(r['high'] for r in known_path)/ep-1 if complete_path else None,
        mae=min(r['low'] for r in known_path)/ep-1 if complete_path else None,
        net100_zero=net(gross if gross is not None else 0., .01),
        net100_loss=net(gross if gross is not None else -1., .01))


def aggregate(records, outcomes):
    groups = collections.defaultdict(list)
    index = {(r['signal'],r['view'],r['holding'],r['method']):r for r in records}
    for r in records:
        half = '2020-2022' if r['year'] <= 2022 else '2023-2025'
        periods = ['all', str(r['year']), half]
        if r['anchor'] <= 2:
            periods.extend(['common-year-start', 'common-year-start-'+half])
        for p in periods:
            groups[r['view'],r['holding'],r['method'],p].append(r)
    result = []
    def average(xs):
        return st.mean(xs) if xs else None
    for (v,h,m,p), rs in sorted(groups.items()):
        ps = [outcomes[k] for r in rs for k in r['outcome_ids']]
        diffs = {s:[r[s]-index[r['signal'],v,h,'Momentum'][s] for r in rs] for s in SCENARIOS}
        known = [x['known_net'] for x in ps if x['known_net'] is not None]
        ds = diffs['net_zero']
        result.append(dict(view=v, holding=h, method=m, period=p, cohorts=len(rs),
            slots=sum(r['denominator'] for r in rs), selected=len(ps),
            means={s:st.mean(r[s] for r in rs) for s in SCENARIOS},
            paired_deltas={s:st.mean(diffs[s]) for s in SCENARIOS},
            paired_wins=sum(x>0 for x in ds), paired_losses=sum(x<0 for x in ds),
            median_paired_delta=st.median(ds),
            without_best_paired_date=st.mean(sorted(ds)[:-1]) if len(ds)>1 else None,
            mean_excess_zero=st.mean(r['excess_zero'] for r in rs), mean_excess_loss=st.mean(r['excess_loss'] for r in rs),
            known=len(known), positive_known=sum(x>0 for x in known), losing_known=sum(x<0 for x in known),
            realized_20pct_hits=sum(x>=.2 for x in known), observed_20pct_hits=sum(x['hit'] for x in ps),
            unknown_paths=sum(x['unknown_path'] for x in ps), entry_missing=sum(x['entry_missing'] for x in ps),
            exit_missing=sum(x['exit_missing'] for x in ps), median_known_net=st.median(known) if known else None,
            mean_mfe_complete=average([x['mfe'] for x in ps if x['mfe'] is not None]),
            mean_mae_complete=average([x['mae'] for x in ps if x['mae'] is not None])))
    return result


def main():
    destination = HERE/'verification.json'
    if destination.exists():
        raise FileExistsError(destination)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    summary = json.loads((HERE/'summary.json').read_text())
    ledger = json.loads(gzip.decompress((HERE/'ledger.json.gz').read_bytes()))
    for path, expected in [('run.py',summary['runner_sha256']), ('protocol.md',summary['protocol_sha256']), ('ledger.json.gz',summary['ledger_sha256'])]:
        assert sha(HERE/path) == expected
    native_summary = json.loads((NATIVE/'summary.json').read_text())
    assert sha(NATIVE/'cohorts.json.gz') == summary['native_ledger_sha256'] == native_summary['ledger_sha256']
    for name, path in [('run.py',NATIVE/'run.py'), ('high-flier-runner.py',DATA.parents[1]/'high-flier-runner.py')]:
        assert sha(path) == native_summary['hashes'][name]
    manifest = json.loads((DATA/'file-hashes.json').read_text())
    assert sha(DATA/'file-hashes.json') == summary['provenance']['file_hashes_sha256']
    for item in manifest['artifacts']:
        path = DATA.parents[1]/item['path']
        assert path.stat().st_size == item['bytes'] and sha(path) == item['sha256']
    with gzip.open(DATA/'cohort-membership.csv.gz', 'rt') as f:
        membership = {(int(r['cohort_year']),r['symbol']) for r in csv.DictReader(f) if r['selected'] == 'true'}
    panel = collections.defaultdict(dict)
    with gzip.open(DATA/'daily-panel.csv.gz', 'rt') as f:
        for row in csv.DictReader(f):
            key = row['cohort_year']+':'+row['identity_segment_id']
            date = dt.date.fromisoformat(row['date'])
            for name in ('open','close','high','low','quote_volume','base_volume'):
                try:
                    row[name] = float(row[name])
                    if not math.isfinite(row[name]):
                        row[name] = 0.
                except ValueError:
                    row[name] = 0.
            try:
                row['trade_count'] = int(row['trade_count'])
            except ValueError:
                row['trade_count'] = 0
            assert date not in panel[key]
            panel[key][date] = row
    observed_scores = {(r['year'],r['anchor'],r['view']):r for r in ledger['scores']}
    assert len(observed_scores) == len(ledger['scores'])
    checks, skips = 0, []
    for year in range(2020,2026):
        identities = sorted(k for k in panel if k.startswith(str(year)+':'))
        for anchor in range(12):
            signal = dt.date(year,1,1)+anchor*28*DAY
            for view in VIEWS:
                keys = [k for k in identities if eligible(panel[k],signal,view,membership)]
                if not keys:
                    skips.append(dict(year=year,anchor=anchor,view=view,reason='no formation-eligible instruments'))
                    assert (year,anchor,view) not in observed_scores
                    continue
                row = observed_scores[year,anchor,view]
                eq(row['eligible'], keys, 'eligibility')
                eq(row['signal'], str(signal))
                expected = {m:{} for m in METHODS}
                for k in keys:
                    computed = scores(panel[k],signal,view)
                    for m in METHODS:
                        expected[m][k] = computed[m]
                    checks += len(METHODS)
                eq(row['methods'], expected, 'scores')
                selections = {m:sorted((k for k in keys if expected[m][k] is not None), key=lambda k:(-expected[m][k],k))[:10] for m in METHODS}
                selections['Universe'] = keys
                eq(row['selections'], selections, 'selection-order')
    eq(summary['skips'], skips)
    rebuilt = {}
    for key, saved in ledger['outcomes'].items():
        identity, signal, hold = json.loads(key)
        assert hold in HOLDS
        rebuilt[key] = outcome(panel[identity], identity, dt.date.fromisoformat(signal), hold)
        eq(saved, rebuilt[key], 'outcome/'+key)
    cohorts = ledger['cohorts']
    seen = set()
    expected_count = 0
    for r in ledger['scores']:
        expected_count += 7*(6 if r['anchor']<=2 else 5)
    assert len(cohorts) == expected_count
    for r in cohorts:
        identity = r['year'],r['anchor'],r['view'],r['holding'],r['method']
        assert identity not in seen
        seen.add(identity)
        formation = observed_scores[r['year'],r['anchor'],r['view']]
        assert r['holding'] in HOLDS and (r['holding'] != 365 or r['anchor']<=2)
        eq(r['signal'], formation['signal'])
        keys = formation['selections'][r['method']]
        ids = [json.dumps([k,r['signal'],r['holding']],separators=(',',':')) for k in keys]
        eq(r['outcome_ids'], ids)
        denominator = len(formation['eligible']) if r['method']=='Universe' else 10
        eq(r['denominator'],denominator)
        eq(r['eligible'],len(formation['eligible']))
        for scenario in SCENARIOS:
            eq(r[scenario],sum(rebuilt[k][scenario] for k in ids)/denominator,'cohort-mean')
        for mark in ('zero','loss'):
            universe = [rebuilt[json.dumps([k,r['signal'],r['holding']],separators=(',',':'))]['net_'+mark] for k in formation['eligible']]
            eq(r['excess_'+mark],r['net_'+mark]-st.mean(universe),'universe-excess')
    expected_summary = aggregate(cohorts,rebuilt)
    eq(summary['summary'],expected_summary,'summary')
    with gzip.open(NATIVE/'cohorts.json.gz','rt') as f:
        native = json.load(f)
    index = {(r['signal'],r['view'],r['holding'],r['method']):r for r in cohorts}
    for old in native:
        new = index[old['signal'],old['view'],old['holding'],old['method']]
        for field,value in old.items():
            if field == 'positions':
                reconstructed = [{name:rebuilt[k][name] for name in p} for k,p in zip(new['outcome_ids'],value)]
                eq(reconstructed,value,'native-position')
                assert len(new['outcome_ids']) == len(value)
            else:
                eq(new[field],value,'native-cohort')
    eq(summary['native_parity_cohorts'],len(native))
    eq(summary['unique_outcomes'],len(rebuilt))
    eq(summary['score_cohorts'],len(observed_scores))
    eq(summary['cohorts'],len(cohorts))
    result = dict(status='passed', started_at_utc=started,
        completed_at_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        verifier_sha256=sha(Path(__file__)), runner_sha256=sha(HERE/'run.py'),
        ledger_sha256=sha(HERE/'ledger.json.gz'), summary_sha256=sha(HERE/'summary.json'),
        panel_sha256=sha(DATA/'daily-panel.csv.gz'),
        source_artifact_hashes=len(manifest['artifacts']), raw_panel_rows=sum(map(len,panel.values())),
        score_values=checks, score_cohorts=len(observed_scores), outcomes=len(rebuilt),
        cohorts=len(cohorts), summary_rows=len(expected_summary), native_parity_cohorts=len(native),
        maximum_absolute_numeric_difference=MAX_ERROR,
        independence='Standard library only; raw CSV identity/eligibility, explicit Wilder ATR and SMA-seeded EMA, delayed fills, costs, complete-path labels, selection order, cohort and summary arithmetic. No experiment imports.',
        limitations=['Verifies implementation and arithmetic, not a statistically untouched holdout or production mapping.',
                      'Overlapping cohort outcomes and six annual venue universes are not independent trial observations.'])
    with destination.open('x') as f:
        json.dump(result,f,indent=2,allow_nan=False)
        f.write('\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
