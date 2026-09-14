"""Daily validation of the frozen breakout candidates; see protocol.md."""
import collections
import datetime as dt
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import statistics as st
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / 'research/indicator-algorithms/2026-09-13'
spec = importlib.util.spec_from_file_location('frozen_indicators', SOURCE/'run.py')
ia = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ia)
hh, hf = ia.hh, ia.hf
METHODS = ('Momentum','Breakout','VolumeBreakout')
SCENARIOS = ia.SCENARIOS
DAY = dt.timedelta(days=1)


def save_gzip(path, payload):
    with path.open('xb') as raw:
        with gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as compressed:
            with io.TextIOWrapper(compressed,encoding='utf-8') as f:
                json.dump(payload,f,separators=(',',':'),allow_nan=False)


def summarize(cohorts,outcomes):
    groups = collections.defaultdict(list)
    lookup = {(r['signal'],r['view'],r['method']):r for r in cohorts}
    for r in cohorts:
        for period in ['all',str(r['year']),'2020-2022' if r['year']<2023 else '2023-2025']:
            groups[r['view'],r['method'],period].append(r)
    result = []
    for (view,method,period),rs in sorted(groups.items()):
        ps = [outcomes[key] for r in rs for key in r['outcome_ids']]
        deltas = {s:[r[s]-lookup[r['signal'],view,'Momentum'][s] for r in rs] for s in SCENARIOS}
        known = [p['known_net'] for p in ps if p['known_net'] is not None]
        ds = deltas['net_zero']
        result.append(dict(view=view,method=method,period=period,holding=30,cohorts=len(rs),slots=len(rs)*10,
            selected=len(ps),means={s:st.mean(r[s] for r in rs) for s in SCENARIOS},
            paired_deltas={s:st.mean(deltas[s]) for s in SCENARIOS},paired_wins=sum(d>0 for d in ds),
            paired_losses=sum(d<0 for d in ds),median_paired_delta=st.median(ds),
            without_best_paired_date=(sum(ds)-max(ds))/(len(ds)-1) if len(ds)>1 else None,
            known=len(known),positive_known=sum(v>0 for v in known),losing_known=sum(v<0 for v in known),
            realized_20pct_hits=sum(v>=.2 for v in known),observed_20pct_hits=sum(p['hit'] for p in ps),
            unknown_paths=sum(p['unknown_path'] for p in ps),entry_missing=sum(p['entry_missing'] for p in ps),
            exit_missing=sum(p['exit_missing'] for p in ps),median_known_net=st.median(known) if known else None,
            mean_mfe_complete=hh.average([p['mfe'] for p in ps if p['mfe'] is not None]),
            mean_mae_complete=hh.average([p['mae'] for p in ps if p['mae'] is not None])))
    return result


def main():
    ia.selftest()
    if '--selftest' in sys.argv:
        print('Frozen indicator and delayed execution selftests passed')
        return
    if any((HERE/name).exists() for name in ('ledger.json.gz','summary.json')):
        raise FileExistsError('Daily outputs exist')
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    original_summary = json.loads((SOURCE/'summary.json').read_text())
    assert hashlib.sha256((SOURCE/'run.py').read_bytes()).hexdigest()==original_summary['runner_sha256']
    original_raw = (SOURCE/'ledger.json.gz').read_bytes()
    assert hashlib.sha256(original_raw).hexdigest()==original_summary['ledger_sha256']
    original = json.loads(gzip.decompress(original_raw))
    old_formations = {(r['signal'],r['view']):r for r in original['scores']}
    old_cohorts = {(r['signal'],r['view'],r['method']):r for r in original['cohorts'] if r['holding']==30 and r['method'] in METHODS}
    _,_,members,raw,provenance = hf.load_frozen_dataset(hh.SOURCE.parent/'high-flier-data/final')
    panel = hf.read_panel_csv(raw,hf.read_membership_csv(members))
    positions,by_date = hf.panel_indexes(panel)
    years = collections.defaultdict(list)
    for key,bars in panel.items():
        years[bars[0].cohort_year].append(key)
    outcomes = {}

    def outcome(identity,signal):
        key = json.dumps([identity,signal.isoformat(),30],separators=(',',':'))
        if key not in outcomes:
            p = hh.grade(by_date[identity],signal,30)
            entry_day,exit_day = signal+2*DAY,signal+32*DAY
            entry,exit_bar = by_date[identity].get(entry_day),by_date[identity].get(exit_day)
            ep = entry.open if entry is not None and hf.bar_open_is_executable(entry) else None
            xp = exit_bar.open if exit_bar is not None and hf.bar_open_is_executable(exit_bar) else None
            gross = xp/ep-1 if ep is not None and xp is not None else None
            stress = {f'net100_{mark}':0. if ep is None else hf.net_return_from_gross(gross if gross is not None else fallback,100)
                      for mark,fallback in [('zero',0.),('loss',-1.)]}
            outcomes[key] = dict(id=identity,symbol=panel[identity][0].symbol,entry_date=entry_day.isoformat(),
                exit_date=exit_day.isoformat(),entry_price=ep,exit_price=xp,**p,**stress)
        return key

    formations,cohorts,skipped = [],[],[]
    formation_parity = cohort_parity = outcome_parity = 0
    for year in range(2020,2026):
        signal = dt.date(year,1,1)
        while signal.year==year:
            candidates = []
            for key in sorted(years[year]):
                idx = positions[key].get(signal)
                if idx is not None and hf.is_eligible(panel[key],idx):
                    candidates.append((key,idx))
            for view in hh.VIEWS:
                eligible,values = [],{m:{} for m in METHODS}
                for key,idx in candidates:
                    if not hf.consecutive_through(panel[key],idx,view):
                        continue
                    eligible.append(key)
                    xs = ia.score(panel[key],idx,view)
                    for m in METHODS:
                        values[m][key] = xs[m]
                if not eligible:
                    skipped.append(dict(year=year,signal=signal.isoformat(),view=view,reason='no formation-eligible instruments'))
                    continue
                selected = {m:sorted((key for key,value in vs.items() if value is not None),key=lambda key:(-vs[key],key))[:10] for m,vs in values.items()}
                r = dict(year=year,signal=signal.isoformat(),view=view,eligible=eligible,selected=selected,scores=values)
                if (r['signal'],view) in old_formations:
                    old = old_formations[r['signal'],view]
                    assert old['eligible']==eligible
                    for m in METHODS:
                        assert values[m]==old['methods'][m] and selected[m]==old['selections'][m]
                    formation_parity += 1
                formations.append(r)
                for method,keys in selected.items():
                    ids = [outcome(key,signal) for key in keys]
                    means = {s:sum(outcomes[key][s] for key in ids)/10 for s in SCENARIOS}
                    c = dict(year=year,signal=r['signal'],view=view,holding=30,method=method,denominator=10,
                        outcome_ids=ids,**means)
                    if (r['signal'],view,method) in old_cohorts:
                        old = old_cohorts[r['signal'],view,method]
                        for field in c:
                            assert c[field]==old[field],(field,c[field],old[field])
                        for key in ids:
                            assert outcomes[key]==original['outcomes'][key]
                            outcome_parity += 1
                        cohort_parity += 1
                    cohorts.append(c)
            signal += DAY
        print('Completed daily year',year,flush=True)
    assert formation_parity==len(old_formations)
    assert cohort_parity==len(old_cohorts)
    payload = dict(formations=formations,outcomes=outcomes,cohorts=cohorts,skipped_formations=skipped)
    summaries = summarize(cohorts,outcomes)
    save_gzip(HERE/'ledger.json.gz',payload)
    hashes = {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),HERE/'protocol.md',SOURCE/'run.py',SOURCE/'summary.json',SOURCE/'ledger.json.gz',hh.SOURCE,ia.SOURCE/'run.py']}
    summary = dict(started_at_utc=started,completed_at_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        ledger_sha256=hashlib.sha256((HERE/'ledger.json.gz').read_bytes()).hexdigest(),hashes=hashes,
        provenance=provenance,methods=METHODS,views=hh.VIEWS,holding=30,formations=len(formations),
        unique_outcomes=len(outcomes),cohorts=len(cohorts),skipped_formations=len(skipped),
        source_formation_parity=formation_parity,source_cohort_parity=cohort_parity,
        source_position_parity=outcome_parity,summary=summaries)
    with (HERE/'summary.json').open('x') as f:
        json.dump(summary,f,indent=2,allow_nan=False)
        f.write('\n')
    print(json.dumps({k:v for k,v in summary.items() if k not in ('hashes','provenance','summary')}))


if __name__=='__main__':
    main()
