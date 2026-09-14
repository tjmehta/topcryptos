"""Descriptive rank-boundary event replay; see the pre-run protocol."""
import gzip
import hashlib
import json
import math
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / 'research/cumulative/2026-09-13/cmc-inputs.json.gz'
raw = json.loads(gzip.decompress(SOURCE.read_bytes()))


def stamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000


def clean(snapshot):
    rows = {}
    for coin in snapshot['data']:
        quote = coin['quote']['USD']
        rank, price = coin.get('cmc_rank'), quote.get('price')
        if not isinstance(rank, int) or rank <= 0 or not isinstance(price, (int, float)) or not math.isfinite(price) or price <= 0:
            continue
        if not 0 <= snapshot['decision'] - stamp(quote['last_updated']) <= 3_600_000:
            continue
        assert coin['id'] not in rows
        rows[coin['id']] = {'rank': rank, 'price': price, 'symbol': coin['symbol']}
    return rows


events = []
disconnect = defaultdict(lambda: {'improvedRank': 0, 'priceNotUp': 0, 'coins': set(), 'dates': set()})
blocks = raw['blocks']['daily']
for block_number, block in enumerate(blocks):
    series = [clean(s) for s in block]
    dates = [datetime.fromtimestamp(s['time'] / 1000, timezone.utc).isoformat() for s in block]
    for view in [3, 7, 14]:
        for t in range(view - 1, len(series)):
            for coin_id, coin in series[t].items():
                history = [s.get(coin_id) for s in series[t - view + 1:t + 1]]
                if any(c is None for c in history) or history[0]['rank'] <= coin['rank']:
                    continue
                d = disconnect[view]
                d['improvedRank'] += 1
                d['coins'].add(coin_id)
                d['dates'].add(dates[t])
                if coin['price'] <= history[0]['price']:
                    d['priceNotUp'] += 1
                    continue
                for horizon in [7, 14]:
                    if t + 1 + horizon >= len(series):
                        continue
                    future = [s.get(coin_id) for s in series[t + 1:t + horizon + 1]]
                    end = future[-1]
                    entry, exit_ = series[t + 1].get(coin_id), series[t + 1 + horizon].get(coin_id)
                    gross = None if entry is None or exit_ is None else exit_['price'] / entry['price']
                    fee_factor = 0.995 / 1.005
                    net_loss = 0 if entry is None else -1 if exit_ is None else gross * fee_factor - 1
                    net_flat = 0 if entry is None else fee_factor - 1 if exit_ is None else gross * fee_factor - 1
                    for boundary in [40, 50, 60, 80, 100, 120]:
                        kinds = []
                        if boundary < coin['rank'] <= boundary + math.ceil(boundary * .1):
                            kinds.append('approach')
                        if history[-2]['rank'] > boundary >= coin['rank']:
                            kinds.append('cross')
                        for kind in kinds:
                            inside = any(c is not None and c['rank'] <= boundary for c in future)
                            outside = any(c is not None and c['rank'] > boundary for c in future)
                            complete = all(c is not None for c in future)
                            events.append({
                                'block': block_number, 'view': view, 'horizon': horizon, 'boundary': boundary, 'kind': kind,
                                'coinId': coin_id, 'symbol': coin['symbol'], 'signalDate': dates[t],
                                'signalRank': coin['rank'], 'previousRank': history[-2]['rank'],
                                'entryDate': dates[t + 1], 'exitDate': dates[t + 1 + horizon],
                                'touchInside': True if inside else False if complete else None,
                                'touchOutside': True if outside else False if complete else None,
                                'endInside': None if end is None else end['rank'] <= boundary,
                                'signalPriceReturn': None if end is None else end['price'] / coin['price'] - 1,
                                'entryMissing': entry is None, 'exitMissing': entry is not None and exit_ is None,
                                'gross': gross, 'netLoss': net_loss, 'netFlat': net_flat,
                            })


def counts(rows, field):
    return {label: sum(r[field] is value for r in rows) for label, value in [('yes', True), ('no', False), ('unknown', None)]}


grouped = defaultdict(list)
for e in events:
    grouped[(e['view'], e['horizon'], e['boundary'], e['kind'])].append(e)
cells = []
for (view, horizon, boundary, kind), rows in sorted(grouped.items()):
    observed = [r['signalPriceReturn'] for r in rows if r['signalPriceReturn'] is not None]
    cells.append({
        'view': view, 'horizon': horizon, 'boundary': boundary, 'kind': kind,
        'events': len(rows), 'coins': len({r['coinId'] for r in rows}), 'dates': len({r['signalDate'] for r in rows}),
        'touchInside': counts(rows, 'touchInside'), 'touchOutside': counts(rows, 'touchOutside'),
        'endInside': counts(rows, 'endInside'), 'priceUp': sum(p > 0 for p in observed), 'priceKnown': len(observed),
        'entryMissing': sum(r['entryMissing'] for r in rows), 'exitMissing': sum(r['exitMissing'] for r in rows),
        'meanNetLoss': statistics.mean(r['netLoss'] for r in rows),
        'medianNetLoss': statistics.median(r['netLoss'] for r in rows),
        'meanNetFlat': statistics.mean(r['netFlat'] for r in rows),
    })
summary = {
    'generatedAt': datetime.now(timezone.utc).isoformat(), 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'runnerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'protocolSha256': hashlib.sha256((HERE / 'protocol.md').read_bytes()).hexdigest(),
    'coverage': [{'snapshots': len(b), 'from': b[0]['name'], 'through': b[-1]['name']} for b in blocks],
    'eventCount': len(events), 'cells': cells,
    'rankPriceDisconnect': {view: {**d, 'coins': len(d['coins']), 'dates': len(d['dates'])} for view, d in disconnect.items()},
}
for path in [HERE / 'summary.json', HERE / 'events.json.gz']:
    if path.exists():
        raise RuntimeError(f'Refusing to overwrite {path}')
(HERE / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
(HERE / 'events.json.gz').write_bytes(gzip.compress(json.dumps(events).encode(), mtime=0))
print(json.dumps({'disconnect': summary['rankPriceDisconnect'], 'cells': [c for c in cells if c['view'] == 7 and c['horizon'] == 7]}, indent=2))
