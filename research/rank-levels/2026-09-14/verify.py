"""Reconstruct event membership in SQL and outcome arithmetic with Decimal."""
import gzip
import hashlib
import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[2] / 'research/cumulative/2026-09-13/cmc-inputs.json.gz'
blocks = json.loads(gzip.decompress(SOURCE.read_bytes()))['blocks']['daily']
assert len(blocks) == 1
block = blocks[0]
events = json.loads(gzip.decompress((HERE / 'events.json.gz').read_bytes()))
summary = json.loads((HERE / 'summary.json').read_text())
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == summary['sourceSha256']
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE q(t INT, id INT, rank INT, price REAL, PRIMARY KEY(t,id))')
source = {}
dates = {}
for t, snapshot in enumerate(block):
    dates[datetime.fromtimestamp(snapshot['time'] / 1000, timezone.utc).isoformat()] = t
    for c in snapshot['data']:
        q = c['quote']['USD']
        updated = datetime.fromisoformat(q['last_updated'].replace('Z', '+00:00')).timestamp() * 1000
        if isinstance(c.get('cmc_rank'), int) and c['cmc_rank'] > 0 and q['price'] > 0 and 0 <= snapshot['decision'] - updated <= 3600000:
            db.execute('INSERT INTO q VALUES(?,?,?,?)', (t,c['id'],c['cmc_rank'],q['price']))
            source[t,c['id']] = (c['cmc_rank'], Decimal(str(q['price'])))
query = '''
WITH views(v) AS (VALUES(3),(7),(14)), horizons(h) AS (VALUES(7),(14)),
boundaries(b) AS (VALUES(40),(50),(60),(80),(100),(120)), kinds(k) AS (VALUES('approach'),('cross'))
SELECT v,h,b,k,c.t,c.id FROM q c CROSS JOIN views CROSS JOIN horizons CROSS JOIN boundaries CROSS JOIN kinds
JOIN q first ON first.id=c.id AND first.t=c.t-v+1
JOIN q previous ON previous.id=c.id AND previous.t=c.t-1
WHERE c.t+1+h < ? AND first.rank>c.rank AND c.price>first.price
AND (SELECT count(*) FROM q history WHERE history.id=c.id AND history.t BETWEEN c.t-v+1 AND c.t)=v
AND ((k='approach' AND c.rank>b AND c.rank<=b+(b+9)/10)
OR (k='cross' AND previous.rank>b AND c.rank<=b))
'''
expected = set(db.execute(query,(len(block),)))
actual = {(e['view'],e['horizon'],e['boundary'],e['kind'],dates[e['signalDate']],e['coinId']) for e in events}
assert len(actual) == len(events) and actual == expected
groups = defaultdict(list)
for e in events:
    t, cid, h, b = dates[e['signalDate']],e['coinId'],e['horizon'],e['boundary']
    path = [source.get((t+i,cid)) for i in range(1,h+1)]
    for field, condition in [('touchInside',lambda r:r<=b),('touchOutside',lambda r:r>b)]:
        answer = True if any(p and condition(p[0]) for p in path) else None if None in path else False
        assert e[field] is answer
    assert e['endInside'] is (None if path[-1] is None else path[-1][0]<=b)
    if path[-1] is not None:
        assert abs(float(path[-1][1]/source[t,cid][1]-1)-e['signalPriceReturn'])<1e-12
    entry, exit_ = source.get((t+1,cid)),source.get((t+1+h,cid))
    assert dates[e['entryDate']] == t+1 and dates[e['exitDate']] == t+1+h
    assert e['entryMissing'] == (entry is None)
    assert e['exitMissing'] == (entry is not None and exit_ is None)
    net = Decimal(0) if entry is None else Decimal(-1) if exit_ is None else exit_[1]/entry[1]*Decimal('0.995')/Decimal('1.005')-1
    flat = Decimal(0) if entry is None else Decimal('0.995')/Decimal('1.005')-1 if exit_ is None else net
    assert abs(float(net)-e['netLoss'])<1e-12 and abs(float(flat)-e['netFlat'])<1e-12
    groups[e['view'],h,b,e['kind']].append((e,net,flat))
for c in summary['cells']:
    rows = groups[c['view'],c['horizon'],c['boundary'],c['kind']]
    assert c['events'] == len(rows)
    assert c['coins'] == len({r[0]['coinId'] for r in rows})
    assert c['dates'] == len({r[0]['signalDate'] for r in rows})
    for field in ['touchInside','touchOutside','endInside']:
        assert c[field] == {k:sum(r[0][field] is v for r in rows) for k,v in [('yes',True),('no',False),('unknown',None)]}
    for field,index in [('meanNetLoss',1),('meanNetFlat',2)]:
        assert abs(float(sum(r[index] for r in rows)/len(rows))-c[field])<1e-12
for view,d in summary['rankPriceDisconnect'].items():
    rows = db.execute('''SELECT count(*), sum(c.price<=first.price),count(DISTINCT c.id),count(DISTINCT c.t)
    FROM q c JOIN q first ON first.id=c.id AND first.t=c.t-?+1 WHERE first.rank>c.rank
    AND (SELECT count(*) FROM q h WHERE h.id=c.id AND h.t BETWEEN first.t AND c.t)=?''',(int(view),int(view))).fetchone()
    assert rows == (d['improvedRank'],d['priceNotUp'],d['coins'],d['dates'])
report = {'verifiedAt':datetime.now(timezone.utc).isoformat(),'events':len(events),'cells':len(groups),'eventMembership':'SQL set equality; no omissions or duplicates','outcomes':'rank paths and Decimal fee returns reconstructed from source','disconnect':'SQL counts agree','status':'passed'}
out = HERE/'verification.json'
assert not out.exists()
out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
