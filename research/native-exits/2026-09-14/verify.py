"""Independent arithmetic/matching audit; does not import the JS exporter/helpers."""
from pathlib import Path
import gzip
import hashlib
import json
from decimal import Decimal, localcontext

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SOURCE = ROOT / 'research/cumulative/2026-09-13'
artifact_path = ROOT / 'modules/data/native-exit-evidence.json'
artifact = json.loads(artifact_path.read_text())
summary = json.loads((SOURCE / 'cmc-summary.json').read_text())
ledger = json.loads(gzip.decompress((SOURCE / 'cmc-results.json.gz').read_bytes()))['records']
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
assert artifact['study']['scorerHash'] == sha(ROOT / 'modules/processRankings.ts')
assert artifact['study']['ledgerHash'] == sha(SOURCE / 'cmc-results.json.gz') == summary['hashes']['ledger']
assert artifact['study']['inputsHash'] == sha(SOURCE / 'cmc-inputs.json.gz')
assert artifact['study']['sourceArtifactHash'] == sha(SOURCE / 'cmc-sources.json')
assert artifact['study']['exporterHash'] == sha(HERE / 'export.cjs')
assert artifact['study']['protocolHash'] == sha(HERE / 'protocol.md')
assert artifact['study']['recommendation'] is None
index = {}
for row in ledger:
    key = (row['mode'], row['view'], row['method'], row['holding'], row['signal'], row['entrySnapshot'])
    assert key not in index
    index[key] = row

checks = 0
rows_verified = 0

def decimal_return(position, cost, loss):
    if position['entryMissing']:
        return Decimal(0)
    gross = position['gross']
    if gross is None:
        assert position['exitMissing']
        gross = -1 if loss else 0
    rate = Decimal(cost)
    return (Decimal(1) + Decimal(str(gross))) * (Decimal(1) - rate) / (Decimal(1) + rate) - Decimal(1)

fields = {'meanNet50': ('.005', False), 'meanNet100': ('.01', False), 'meanNetLoss50': ('.005', True), 'meanNetLoss100': ('.01', True)}
with localcontext() as ctx:
    ctx.prec = 40
    for config in artifact['configurations']:
        mode, view = config['mode'], config['view']
        groups = {(method, hold): {(k[4], k[5]): row for k, row in index.items() if k[:4] == (mode, view, method, hold)} for method in summary['methods'] for hold in summary['holds'][mode]}
        counts = {hold: min(len(groups[method, hold]) for method in summary['methods']) for hold in summary['holds'][mode]}
        admitted = [hold for hold in summary['holds'][mode] if counts[hold] >= 6]
        sets = [set(groups[method, hold]) for hold in admitted for method in summary['methods']]
        common = set.intersection(*sets) if sets else set()
        assert not common or len(common) >= 6
        assert config['matchedSignals'] == len(common)
        assert config['slots'] == len(common) * 10
        assert list(zip(config['signalDates'], config['entryDates'])) == sorted(common)
        assert len(config['windows']) == len(summary['holds'][mode])
        for window in config['windows']:
            hold = window['holding']
            expected_status = 'comparable' if hold in admitted and len(common) >= 6 else 'sparse' if counts[hold] else 'unavailable'
            assert window['status'] == expected_status
            assert window['availableSignals'] == counts[hold]
            exits = sorted(row['exitSnapshot'] for method in summary['methods'] for key, row in groups[method, hold].items() if key in common) if expected_status == 'comparable' else []
            assert window['exitStart'] == (exits[0] if exits else None)
            assert window['exitEnd'] == (exits[-1] if exits else None)
        for method in summary['methods']:
            assert [r['holding'] for r in config['methods'][method]] == admitted
            for exported in config['methods'][method]:
                hold = exported['holding']
                rows = [groups[method, hold][key] for key in sorted(common)]
                positions = [p for row in rows for p in row['positions']]
                known = [p for p in positions if not p['entryMissing'] and not p['exitMissing']]
                assert exported['selected'] == len(positions)
                assert exported['known'] == len(known)
                assert exported['knownLosers50'] == sum(decimal_return(p, '.005', False) < 0 for p in known)
                assert exported['entryMissing'] == sum(p['entryMissing'] for p in positions)
                assert exported['exitMissing'] == sum(p['exitMissing'] for p in positions)
                assert exported['known'] + exported['entryMissing'] + exported['exitMissing'] == exported['selected']
                for name, (cost, loss) in fields.items():
                    result = sum(decimal_return(p, cost, loss) for p in positions) / Decimal(10 * len(rows))
                    assert abs(result - Decimal(str(exported[name]))) < Decimal('0.000000000051'), (mode, view, method, hold, name)
                    checks += 1
                for key in common:
                    assert [p['id'] for p in groups[method, hold][key]['positions']] == [p['id'] for p in groups[method, admitted[0]][key]['positions']]
                rows_verified += 1

report = {'status': 'passed', 'verifiedAt': '2026-09-14', 'scope': 'Independent Python decimal arithmetic and exact date/selection matching from frozen CMC ledger; not new market validation.', 'configurations': len(artifact['configurations']), 'methodHoldingRows': rows_verified, 'decimalReturnComparisons': checks, 'sourceCohorts': len(ledger), 'artifactBytes': artifact_path.stat().st_size, 'sha256': {'artifact': sha(artifact_path), 'exporter': sha(HERE / 'export.cjs'), 'verifier': sha(HERE / 'verify.py'), 'protocol': sha(HERE / 'protocol.md'), 'ledger': sha(SOURCE / 'cmc-results.json.gz'), 'scorer': sha(ROOT / 'modules/processRankings.ts')}}
(HERE / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
