"""Predeclared exploratory top-three ordering comparison, with source checks."""
import gzip
import hashlib
import json
import math
import statistics
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
raw = json.loads(gzip.decompress((HERE / 'inputs.json.gz').read_bytes()))
ledger = json.loads(gzip.decompress((HERE / 'ledger.json.gz').read_bytes()))
series = raw['blocks']['daily'][0]
by_time = [{r['id']: r for r in s['data']} for s in series]
keys = ['loss50', 'loss100', 'flat50', 'flat100']
rows = []
numeric_checks = 0
membership_checks = 0

def source_choices(t, boundary):
    candidates = []
    for cid, row in by_time[t].items():
        hist = [s.get(cid) for s in by_time[t - 6:t + 1]]
        if any(r is None for r in hist):
            continue
        for offset, r in enumerate(hist):
            q = r['quote']['USD']
            stamp = datetime.fromisoformat(q['last_updated'].replace('Z', '+00:00')).timestamp() * 1000
            if not (0 <= series[t - 6 + offset]['decision'] - stamp <= 3600000):
                break
        else:
            r0, previous, current = (hist[i]['cmc_rank'] for i in [0, -2, -1])
            p0, p1 = hist[0]['quote']['USD']['price'], hist[-1]['quote']['USD']['price']
            if boundary / 2 < current <= boundary < previous and r0 > current and p1 > p0 > 0:
                candidates.append((cid, math.log(r0 / current) / 6, math.log(p1 / p0) / 6))
    return {
        'candidateCount': len(candidates),
        'rank_velocity': [r[0] for r in sorted(candidates, key=lambda r: (-r[1], r[0]))[:3]],
        'cross_price': [r[0] for r in sorted(candidates, key=lambda r: (-r[2], r[0]))[:3]],
    }

index = {(x['boundary'], x['hold'], x['signalIndex'], x['strategy']): x for x in ledger}
for basket in ledger:
    if basket['strategy'] != 'rank_velocity':
        continue
    b, h, t = basket['boundary'], basket['hold'], basket['signalIndex']
    other = index[b, h, t, 'cross_price']
    expected = source_choices(t, b)
    sides = {}
    for name, saved in [('rank_velocity', basket), ('cross_price', other)]:
        positions = saved['positions'][:3]
        assert [p['coinId'] for p in positions] == expected[name]
        membership_checks += 1
        nets = {key: sum(p['net'][key] for p in positions) / 3 for key in keys}
        for key in keys:
            fee = int(key[4:])
            factor = (Decimal(10000) - fee) / (Decimal(10000) + fee)
            total = Decimal(0)
            for cid in expected[name]:
                entry, end = by_time[t + 1].get(cid), by_time[t + 1 + h].get(cid)
                if entry is None:
                    value = Decimal(0)
                elif end is None:
                    value = Decimal(-1) if key.startswith('loss') else factor - 1
                else:
                    value = Decimal(str(end['quote']['USD']['price'])) / Decimal(str(entry['quote']['USD']['price'])) * factor - 1
                total += value
            assert math.isclose(nets[key], float(total / 3), rel_tol=1e-10, abs_tol=1e-12)
            numeric_checks += 1
        sides[name] = {'coinIds': expected[name], 'net': nets}
    rows.append({
        'boundary': b, 'hold': h, 'signalDate': basket['signalDate'], 'phase': basket['phase'],
        'candidateCount': expected['candidateCount'], 'contested': expected['candidateCount'] > 3,
        'differentSelections': set(expected['rank_velocity']) != set(expected['cross_price']),
        'sides': sides,
    })

def describe(xs):
    diffs = [x['sides']['rank_velocity']['net']['loss50'] - x['sides']['cross_price']['net']['loss50'] for x in xs]
    return {
        'dates': len(xs), 'differentSelections': sum(x['differentSelections'] for x in xs),
        'coins': len({i for x in xs for side in x['sides'].values() for i in side['coinIds']}),
        'rankAheadDates': sum(x > 1e-12 for x in diffs), 'rankBehindDates': sum(x < -1e-12 for x in diffs),
        'means': {side: {key: statistics.mean(x['sides'][side]['net'][key] for x in xs) if xs else None for key in keys} for side in ['rank_velocity', 'cross_price']},
        'meanPairedDifference': {key: statistics.mean(x['sides']['rank_velocity']['net'][key] - x['sides']['cross_price']['net'][key] for x in xs) if xs else None for key in keys},
        'removeBestPairedDateMean': (sum(diffs) - max(diffs)) / (len(diffs) - 1) if len(diffs) > 1 else None,
    }

cells = []
for b in [300, 200]:
    for h in [7, 14, 30]:
        xs = [x for x in rows if x['boundary'] == b and x['hold'] == h]
        cells.append({'boundary': b, 'hold': h, 'all': describe(xs), 'contested': describe([x for x in xs if x['contested']]), 'laterContested': describe([x for x in xs if x['contested'] and x['phase'] == 'later'])})

output = HERE / 'top3.json'
assert not output.exists(), 'refuse overwrite'
result = {
    'createdAt': datetime.now(timezone.utc).isoformat(), 'scope': 'Exploratory three-slot rank versus price ordering; reconstructed earlier-era sample',
    'hashes': {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in ['inputs.json.gz', 'ledger.json.gz', 'protocol.md', 'run_top3.py']},
    'verification': {'passed': True, 'sourceMembershipChecks': membership_checks, 'independentDecimalBasketChecks': numeric_checks},
    'cells': cells, 'rows': rows,
}
output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'verification': result['verification'], 'cells': cells}, indent=2))
