"""Render a dated readable report from preserved exact-module artifacts."""
import gzip
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
s = json.loads((HERE / 'summary.json').read_text())
r = json.loads(gzip.decompress((HERE / 'results.json.gz').read_bytes()))
old = json.loads(gzip.decompress((HERE / 'superseded-numeric-ties/results.json.gz').read_bytes()))
methods = ['before-classic', 'classic', 'momentum', 'trend-quality']
labels = ['Before Classic', 'Corrected Classic', 'Momentum', 'Trend quality']
rows = {(x['comparison'], x['mode'], x['view'], x['holding'], x['method']): x for x in s['summary']}
feasible = {(x['mode'], x['view'], x['holding']): x['signalDates'] for x in s['feasibility']}
key = lambda x: tuple(x[k] for k in ['comparison', 'mode', 'view', 'method', 'signal'])
a = {key(x): [p['id'] for p in x['selected']] for x in old['signals']}
b = {key(x): [p['id'] for p in x['selected']] for x in r['signals']}
assert a.keys() == b.keys()
order_changed = sum(a[k] != b[k] for k in a)
membership_changed = sum(set(a[k]) != set(b[k]) for k in a)
lines = [
'# Interval algorithms: implementation replay, 2026-09-13', '',
'**The changes are backtested, but no universal ranking winner or reliable automatic sell timeline was established.** This study executes the frozen old scorer and the actual new Classic, Momentum and TrendQuality implementations against cached CMC snapshots. The alternative modes recalculate using the viewed window; they do not select whichever method happened to win a historical cell.', '',
f"Run: **{s['startedAt']} to {s['completedAt']} UTC**. There are **{s['recordCount']:,} cohort records**, {s['signalRecordCount']:,} signal/method/comparison records and {len(s['summary']):,} aggregate groups. These are repeated configurations and overlapping coin-date outcomes, not independent market observations.", '',
'## What was actually changed and compared', '',
'- Native replay compares the old caller/window/deduplication and Classic scorer with the new caller/window and each current scorer. It measures the combined implementation change.',
'- Common-input replay gives all four scorers the same exact window and the intersection of scoreable signal-time IDs, then reruns their percentile pools. It helps separate formula changes from old hourly window and eligibility bugs.',
'- New Classic repairs timestamp ordering/filtering, duplicate handling, market-cap-rank direction and numeric noise while keeping the 70/20/10 blend. Momentum ranks signed endpoint return. TrendQuality ranks signed OLS log-price slope multiplied by R². Actual elapsed quote times enter the implementation.',
'- All methods rank signed scores and take up to ten names. These are not the positive-only Binance candidates that left negative-signal slots in cash in earlier research. The selected window counts UTC buckets, including the current partial bucket.',
'- Entry is the following saved snapshot; exits are scheduled saved snapshots after the chosen hold. A sampled future gain is an opportunity label; no simulated sale occurs at a future high. Every selected ID stays in the denominator.', '',
'## Daily discovery and realized endpoint returns', '',
'The table evaluates a seven-day hold after next-day entry. Each cell is **sampled +20% hits / ten capital slots per cohort; mean net endpoint return** with 50bps fees per side and missing exits marked at zero gross return. A hit can finish negative. Missing-price marks are conventions, and different view rows use different dates; do not choose a winning view from this table.', '',
'| Viewed buckets | Signal dates | ' + ' | '.join(labels) + ' |',
'|---|---:|' + '---:|' * 4]
for view in [3,4,5,6,7,10,14,21,30,45,60,90]:
    xs = [rows.get(('native', 'daily', view, 7, m)) for m in methods]
    if xs[0] is None:
        lines.append(f'| {view} | 0 | Unsupported | Unsupported | Unsupported | Unsupported |')
    else:
        lines.append(f"| {view} | {xs[0]['cohorts']} | " + ' | '.join(f"{x['hits']}/{x['slots']}; {x['meanNet50']:+.2%}" for x in xs) + ' |')
lines += ['', 'For the default ten-bucket view, the common-input seven-day comparison is:', '',
'| Method | Hits / slots | Mean net | Mean net, missing exits total loss | Known-return median |', '|---|---:|---:|---:|---:|']
for m, label in zip(methods, labels):
    x = rows[('common', 'daily', 10, 7, m)]
    lines.append(f"| {label} | {x['hits']}/{x['slots']} | {x['meanNet50']:+.2%} | {x['meanNetLoss50']:+.2%} | {x['medianKnownNet']:+.2%} |")
lines += ['', '**The default-view example illustrates the objective tradeoff:** Momentum can find more sampled +20% movers while realizing a worse fixed-hold average. Correctness fixes likewise do not imply that every historical cell improves. Retain discovery, return capture and downside as separate objectives.', '',
'## Holding horizons are still separate from viewed history', '',
'Default ten-bucket native results below illustrate the measured forward curve. Each cell is mean net endpoint return with the same 50bps-per-side/zero-gross missing-exit convention. Longer holds have fewer mature signal dates, so rows are not matched-cohort evidence for choosing a sale date.', '',
'| Hold after entry | Signal dates | ' + ' | '.join(labels) + ' |', '|---|---:|' + '---:|' * 4]
for hold in [1,7,14,30,60,90,365]:
    xs = [rows.get(('native', 'daily', 10, hold, m)) for m in methods]
    lines.append(f"| {hold} days | {feasible[('daily',10,hold)]} | " + ' | '.join(f"{x['meanNet50']:+.2%}" if x else 'Unsupported' for x in xs) + ' |')
lines += ['', '## Available daily signal dates by viewed interval and hold', '',
'Zero means the required complete formation and mature exit are unavailable. No outcome is filled in from another block or from Binance data. The 2026 daily block contains 69 observations, 2026-07-04 through 2026-09-10.', '',
'| Viewed buckets | Hold 1d | 7d | 14d | 30d | 60d | 90d | 365d |', '|---|---:|---:|---:|---:|---:|---:|---:|']
for view in [3,4,5,6,7,10,14,21,30,45,60,90]:
    lines.append(f'| {view} | ' + ' | '.join(str(feasible[('daily',view,h)]) for h in [1,7,14,30,60,90,365]) + ' |')
lines += ['', '## Hourly support and results', '',
'Five separate modern hourly blocks contain 12, 23, 6, 29 and 6 observations, spanning isolated dates from August 8 through September 11. Each historical caller receives at most 25 snapshots. Signals and outcomes cannot cross gaps. These samples cannot validate an hourly strategy selector or map daily findings to faster triggers.', '',
'| Viewed hourly buckets | Hold 1h | 3h | 6h | 12h | 24h |', '|---|---:|---:|---:|---:|---:|']
for view in [3,6,9,12,18,24]:
    lines.append(f'| {view} | ' + ' | '.join(str(feasible[('hourly',view,h)]) for h in [1,3,6,12,24]) + ' |')
lines += ['', 'Native one-hour endpoint results, mean net after 50bps per side:', '',
'| Viewed hourly buckets | ' + ' | '.join(labels) + ' |', '|---|' + '---:|' * 4]
for view in [3,6,9,12,18,24]:
    xs = [rows[('native','hourly',view,1,m)] for m in methods]
    lines.append(f'| {view} | ' + ' | '.join(f"{x['meanNet50']:+.2%}" for x in xs) + ' |')
lines += ['', 'Gross and 100bps-per-side sensitivity results, missing counts, observed threshold timing, known-position loss rates, p10 outcomes, complete-path excursions, membership turnover and concentration remain available for every computed cell in `summary.json`. Hourly costs are material compared with the observed short-hold changes.', '',
'## Verification and limitations', '',
'- The independent stdlib Python verifier reconstructs selected entry/exit observations from raw hashed cache files, checking missing flags and all known returns, then recomputes fees, immutable selection groups, denominators and aggregate returns. This verifies calculation consistency; it cannot verify historical publication availability or fills.',
'- Synthetic runner tests cover delayed entry, missing entry as cash, missing exit as total loss, known hits on incomplete paths, exact fees and never selling at a hindsight high. Source bytes must remain unchanged while the run executes.',
'- The known-hit upper bound adds only incomplete paths with no known hit. It does not double count an incomplete path that already reached +20%. Snapshot prices miss intraday peaks and do not establish intraday ordering.',
'- Round-trip cohort returns are not a self-financing portfolio: horizons overlap, funds are not constrained across simultaneous signals, and no annualized or compounded returns are reported. Slippage, spread, capacity and outages remain unmodeled.',
'- Tests at 90 daily buckets, most long holds and many long hourly combinations are unsupported. An unavailable cell is not a passing backtest. The actual CMC data cannot validate 90-day or one-year forecasts.',
'- Historical CMC snapshots are selectively retained; inputs are not a complete historical investable universe. Falling outside the stored top 500 or cap filter can produce missing endpoints. Both zero-return and total-loss missing-exit marks are retained.',
'- Per-interval automatic method selection and trigger-based exits have not been implemented or validated here. A future selector needs mature-only training outcomes, purged forward windows, later-date evaluation, market dependence handling and prospective evidence. The earlier longer Binance research remains relevant context, but cannot validate Classic market-cap-rank terms or exact current product rankings.', '',
'## Amendment history and provenance', '',
f"The first run imposed numeric ID ties in its research sorting. Review identified that this differed from the actual product. Its original code, protocol and outcomes are preserved in `superseded-numeric-ties/`. The final run consumes each scorer's native ordered output. Compared with the first run, **{order_changed}/{len(a)} signal selections changed order; {membership_changed}/{len(a)} changed constituent membership**. No earlier artifact was silently overwritten.", '',
'Archived scripts preserve the original recorded bytes and hashes; to reproduce an archived run, restore its runner/protocol to this dated directory in a separate checkout, retain the baseline directory, and use production sources matching its saved hashes. The current runner refuses to overwrite result files.', '',
f"Final ledger SHA-256: `{s['hashes']['ledger']}`.", '',
'Artifacts: [protocol](protocol.md), [runner](run.cjs), [summary](summary.json), [compressed ledger](results.json.gz), [independent verifier](verify.py), [frozen baseline](baseline.json). Run `node run.cjs --selftest` for deterministic checks and `python3 verify.py` from this directory for saved-artifact verification. Full execution must use a fresh copy without result artifacts and sources matching the recorded hashes.']
(HERE / 'README.md').write_text('\n'.join(lines) + '\n')
print(json.dumps({'order_changed':order_changed,'membership_changed':membership_changed,'groups':len(a)}))
