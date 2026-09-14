"""Independent ledger arithmetic/immutability verification, stdlib only."""
import gzip
import hashlib
import json
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

def verify():
    summary = json.loads((HERE / 'summary.json').read_text())
    compressed = (HERE / 'results.json.gz').read_bytes()
    assert hashlib.sha256(compressed).hexdigest() == summary['hashes']['ledger']
    for source, digest in summary['hashes']['sources'].items():
        assert hashlib.sha256((ROOT / source).read_bytes()).hexdigest() == digest, source
    for field, filename in [('runner', 'run.cjs'), ('protocol', 'protocol.md')]:
        assert hashlib.sha256((HERE / filename).read_bytes()).hexdigest() == summary['hashes'][field]
    ledger = json.loads(gzip.decompress(compressed))
    assert len(ledger['records']) == summary['recordCount']
    # Rebuild endpoint lookup directly from raw cache bytes, independently of JS.
    by_time = {}
    for entry in sorted(summary['manifest'], key=lambda x: x['name'], reverse=True):
        raw_bytes = (ROOT / '.cache/coinmarketcap' / entry['name']).read_bytes()
        assert hashlib.sha256(raw_bytes).hexdigest() == entry['sha256']
        rows = json.loads(raw_bytes)['data'][:500]
        by_time[entry['modal']] = {str(r['id']): r for r in rows if r['quote']['USD']['market_cap'] > 1e7}
    def price_at(identifier, snapshot, mode):
        row = by_time[snapshot].get(identifier)
        if row is None:
            return None
        q = row['quote']['USD']
        price, stamp = q['price'], datetime.fromisoformat(q['last_updated'])
        tolerance = 3600 if mode == 'daily' else 900
        if not math.isfinite(price) or price <= 0 or abs((stamp - datetime.fromisoformat(snapshot)).total_seconds()) > tolerance:
            return None
        return price, stamp
    raw_known = 0
    selected = {}
    groups = defaultdict(list)
    positions = 0
    for record in ledger['records']:
        signal = datetime.fromisoformat(record['signal'])
        assert datetime.fromisoformat(record['entrySnapshot']) > signal
        assert datetime.fromisoformat(record['exitSnapshot']) > datetime.fromisoformat(record['entrySnapshot'])
        identity = tuple(record[k] for k in ['comparison', 'mode', 'view', 'method', 'signal'])
        ids = tuple(p['id'] for p in record['positions'])
        assert len(ids) == len(set(ids)) <= 10
        if identity in selected:
            assert selected[identity] == ids
        selected[identity] = ids
        for p in record['positions']:
            positions += 1
            entry = price_at(p['id'], record['entrySnapshot'], record['mode'])
            exit = price_at(p['id'], record['exitSnapshot'], record['mode'])
            entry_ok = entry is not None and entry[1] > signal
            exit_ok = entry_ok and exit is not None and exit[1] > entry[1]
            assert p['entryMissing'] == (not entry_ok)
            assert p['exitMissing'] == (entry_ok and not exit_ok)
            if exit_ok:
                assert math.isclose(p['gross'], exit[0] / entry[0] - 1, abs_tol=1e-12)
                raw_known += 1
            assert not (p['hit'] and p['unknownNoHit'])
            assert (p['timeTo20'] is not None) == p['hit']
            if p['entryMissing']:
                assert p['gross'] is None
                assert all(p[k] == 0 for k in ['net0', 'net50', 'net100', 'netLoss50'])
            else:
                for bps in [0, 50, 100]:
                    gross = p['gross'] if p['gross'] is not None else 0
                    expected = (1 + gross) * (10000 - bps) / (10000 + bps) - 1
                    assert math.isclose(p[f'net{bps}'], expected, abs_tol=1e-12)
                if p['exitMissing']:
                    assert p['gross'] is None and p['netLoss50'] == -1
                else:
                    assert p['netLoss50'] == p['net50']
        for k in ['net0', 'net50', 'net100', 'netLoss50']:
            assert math.isclose(record[k], sum(p[k] for p in record['positions']) / 10, abs_tol=1e-12)
        groups['/'.join(str(record[k]) for k in ['comparison', 'mode', 'view', 'holding', 'method'])].append(record)
    for row in summary['summary']:
        rs = groups[row['key']]
        ps = [p for r in rs for p in r['positions']]
        assert row['cohorts'] == len(rs)
        assert row['slots'] == len(rs) * 10
        assert row['selected'] == len(ps)
        assert row['hits'] == sum(p['hit'] for p in ps)
        assert row['unknownNoHit'] == sum(p['unknownNoHit'] for p in ps)
        assert row['hits'] + row['unknownNoHit'] <= row['selected'] <= row['slots']
        for field, key in [('meanGross', 'net0'), ('meanNet50', 'net50'), ('meanNet100', 'net100'), ('meanNetLoss50', 'netLoss50')]:
            assert math.isclose(row[field], sum(r[key] for r in rs) / len(rs), abs_tol=1e-12)
    print(json.dumps({'verified_records': len(ledger['records']), 'verified_positions': positions,
                      'immutable_selection_groups': len(selected), 'summary_groups': len(groups), 'raw_known_return_checks': raw_known,
                      'source_and_ledger_hashes': 'matched'}))

if __name__ == '__main__':
    verify()
