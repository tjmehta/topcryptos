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
NATIVE = ROOT / 'research/indicator-algorithms/2026-09-13'
DAY = dt.timedelta(days=1)
VIEWS = (3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90)
HOLDS = (30,)
METHODS = ('Momentum', 'Breakout', 'VolumeBreakout')
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


def scores(rows, signal, view):
    closes = [rows[signal-i*DAY]['close'] for i in reversed(range(view))]
    momentum = math.log(closes[-1]) - math.log(closes[0])
    reference_high = max(rows[signal-i*DAY]['high'] for i in range(1, view))
    breakout = math.log(closes[-1] / reference_high)
    volume_ok = rows[signal]['quote_volume'] >= 1.5 * st.median(
        rows[signal-i*DAY]['quote_volume'] for i in range(1, 21))
    return dict(Momentum=momentum if momentum > 0 else None,
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
    index = {(r['signal'],r['view'],r['method']):r for r in records}
    for r in records:
        for period in ['all', str(r['year']), '2020-2022' if r['year'] < 2023 else '2023-2025']:
            groups[r['view'],r['method'],period].append(r)
    result = []
    def average(xs):
        return st.mean(xs) if xs else None
    for (v,m,p), rs in sorted(groups.items()):
        ps = [outcomes[k] for r in rs for k in r['outcome_ids']]
        diffs = {s:[r[s]-index[r['signal'],v,'Momentum'][s] for r in rs] for s in SCENARIOS}
        known = [x['known_net'] for x in ps if x['known_net'] is not None]
        ds = diffs['net_zero']
        result.append(dict(view=v, holding=30, method=m, period=p, cohorts=len(rs),
            slots=sum(r['denominator'] for r in rs), selected=len(ps),
            means={s:st.mean(r[s] for r in rs) for s in SCENARIOS},
            paired_deltas={s:st.mean(diffs[s]) for s in SCENARIOS},
            paired_wins=sum(x>0 for x in ds), paired_losses=sum(x<0 for x in ds),
            median_paired_delta=st.median(ds),
            without_best_paired_date=st.mean(sorted(ds)[:-1]) if len(ds)>1 else None,
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
    assert sha(HERE/'ledger.json.gz') == summary['ledger_sha256']
    for path, expected in summary['hashes'].items():
        assert sha(ROOT/path) == expected
    with gzip.open(HERE/'ledger.json.gz','rt') as f:
        ledger = json.load(f)
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
    observed = {(r['signal'],r['view']):r for r in ledger['formations']}
    assert len(observed) == len(ledger['formations'])
    checks, formation_count, skips = 0, 0, []
    for year in range(2020,2026):
        identities = sorted(k for k in panel if k.startswith(str(year)+':'))
        signal = dt.date(year,1,1)
        while signal.year == year:
            base_keys = [k for k in identities if eligible(panel[k],signal,60,membership)]
            for view in VIEWS:
                keys = base_keys if view <= 60 else [k for k in base_keys if all(
                    complete(panel[k].get(signal-i*DAY)) for i in range(60,view))]
                if not keys:
                    skips.append(dict(year=year,signal=str(signal),view=view,reason='no formation-eligible instruments'))
                    assert (str(signal),view) not in observed
                    continue
                row = observed[str(signal),view]
                eq(row['eligible'], keys, 'eligibility')
                eq(row['year'], year)
                expected = {m:{} for m in METHODS}
                for k in keys:
                    computed = scores(panel[k],signal,view)
                    for m in METHODS:
                        expected[m][k] = computed[m]
                    checks += len(METHODS)
                eq(row['scores'], expected, 'scores')
                selected = {m:sorted((k for k in keys if expected[m][k] is not None),
                            key=lambda k:(-expected[m][k],k))[:10] for m in METHODS}
                eq(row['selected'], selected, 'selection-order')
                formation_count += 1
            signal += DAY
        print('Verified raw daily formation year',year,flush=True)
    assert formation_count == len(observed)
    eq(ledger['skipped_formations'],skips,'skipped-formations')
    outcomes = ledger['outcomes']
    for key, saved in outcomes.items():
        identity, signal, hold = json.loads(key)
        assert hold == 30
        eq(saved,outcome(panel[identity],identity,dt.date.fromisoformat(signal),hold),'outcome/'+key)
    print('Verified all raw daily outcomes',len(outcomes),flush=True)
    cohorts = ledger['cohorts']
    seen, referenced = set(), set()
    assert len(cohorts) == len(observed)*len(METHODS)
    for r in cohorts:
        identity = r['signal'],r['view'],r['method']
        assert identity not in seen
        seen.add(identity)
        formation = observed[r['signal'],r['view']]
        assert r['year'] == formation['year'] and r['holding'] == 30 and r['denominator'] == 10
        keys = formation['selected'][r['method']]
        ids = [json.dumps([k,r['signal'],30],separators=(',',':')) for k in keys]
        eq(r['outcome_ids'],ids)
        referenced.update(ids)
        for scenario in SCENARIOS:
            eq(r[scenario],sum(outcomes[k][scenario] for k in ids)/10,'cohort-mean')
    assert referenced == set(outcomes)
    expected_summary = aggregate(cohorts,outcomes)
    eq(summary['summary'],expected_summary,'summary')
    print('Verified daily cohorts and paired summaries',len(cohorts),flush=True)
    native_summary = json.loads((NATIVE/'summary.json').read_text())
    assert sha(NATIVE/'ledger.json.gz') == native_summary['ledger_sha256']
    with gzip.open(NATIVE/'ledger.json.gz','rt') as f:
        native = json.load(f)
    for old in native['scores']:
        new = observed[old['signal'],old['view']]
        eq(new['eligible'],old['eligible'],'overlap-eligible')
        for method in METHODS:
            eq(new['scores'][method],old['methods'][method],'overlap-scores')
            eq(new['selected'][method],old['selections'][method],'overlap-selection')
    index = {(r['signal'],r['view'],r['method']):r for r in cohorts}
    cohort_parity = position_parity = 0
    for old in native['cohorts']:
        if old['holding'] != 30 or old['method'] not in METHODS:
            continue
        new = index[old['signal'],old['view'],old['method']]
        for field,value in new.items():
            eq(value,old[field],'overlap-cohort')
        for key in new['outcome_ids']:
            eq(outcomes[key],native['outcomes'][key],'overlap-outcome')
            position_parity += 1
        cohort_parity += 1
    eq(summary['source_formation_parity'],len(native['scores']))
    eq(summary['source_cohort_parity'],cohort_parity)
    eq(summary['source_position_parity'],position_parity)
    for name,count in [('unique_outcomes',len(outcomes)),('formations',len(observed)),
                       ('cohorts',len(cohorts)),('skipped_formations',len(skips))]:
        eq(summary[name],count)
    result = dict(status='passed',started_at_utc=started,
        completed_at_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        verifier_sha256=sha(Path(__file__)),runner_sha256=sha(HERE/'run.py'),
        ledger_sha256=sha(HERE/'ledger.json.gz'),summary_sha256=sha(HERE/'summary.json'),
        panel_sha256=sha(DATA/'daily-panel.csv.gz'),source_artifact_hashes=len(manifest['artifacts']),
        raw_panel_rows=sum(map(len,panel.values())),score_values=checks,
        formations=len(observed),skipped_formations=len(skips),outcomes=len(outcomes),
        cohorts=len(cohorts),summary_rows=len(expected_summary),
        overlap_formations=len(native['scores']),overlap_cohorts=cohort_parity,
        overlap_position_records=position_parity,maximum_absolute_numeric_difference=MAX_ERROR,
        independence='Standard-library raw CSV reconstruction; no experiment or scorer imports. Checks every daily eligibility, score, ordering, fill, mark, path label, cohort mean, paired summary and sampled-date parity.',
        limitations=['Verifies implementation, not an untouched holdout or deployable superiority.',
                     'Daily overlapping observations and annual venue universes are not independent trials.'])
    with destination.open('x') as f:
        json.dump(result,f,indent=2,allow_nan=False)
        f.write('\n')
    print(json.dumps(result))


if __name__=='__main__':
    main()
