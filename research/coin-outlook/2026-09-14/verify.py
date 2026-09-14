"""Independent fixed-state classification and Decimal return audit."""
import gzip, hashlib, json, math, statistics
from pathlib import Path
from decimal import Decimal
from collections import defaultdict
from datetime import datetime
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
SOURCE=ROOT/'research/cumulative/2026-09-13'
loadgz=lambda p:json.loads(gzip.decompress(p.read_bytes()))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
artifact=json.loads((ROOT/'modules/data/coin-outlook-evidence.json').read_text())
traces=loadgz(HERE/'classification-traces.json.gz')
records=loadgz(HERE/'state-ledger.json.gz')
original=loadgz(SOURCE/'cmc-results.json.gz')
study=artifact['study']
assert study['scorerHash']==sha(ROOT/'modules/processRankings.ts')
assert study['inputHash']==sha(SOURCE/'cmc-inputs.json.gz')
assert study['ledgerHash']==sha(SOURCE/'cmc-results.json.gz')
assert study['runnerHash']==sha(HERE/'run.cjs')
assert study['protocolHash']==sha(HERE/'protocol.md')

def classify(quotes):
    if len(quotes)<3 or any(not math.isfinite(q['price']) or q['price']<=0 or not math.isfinite(q['rank']) or q['rank']<=0 or not math.isfinite(q['time']) or (i and q['time']<=quotes[i-1]['time']) for i,q in enumerate(quotes)): return 'unavailable'
    first,last,prev=quotes[0],quotes[-1],quotes[-2]
    if last['price']<first['price'] and last['price']<prev['price']: return 'fading'
    total=math.log(last['price'])-math.log(first['price'])
    changes=[math.log(b['price'])-math.log(a['price']) for a,b in zip(quotes,quotes[1:])]
    if last['price']>first['price'] and changes[-1]>0 and len(quotes)>=6 and changes[-1]>2*statistics.median(abs(r) for r in changes[:-1]) and changes[-1]>=total/2: return 'extended'
    if last['price']>first['price'] and last['rank']<first['rank'] and last['price']>=prev['price']: return 'building'
    return 'mixed'

inputs=loadgz(SOURCE/'cmc-inputs.json.gz')
source_quotes={}
for mode,blocks in inputs['blocks'].items():
    for bi,block in enumerate(blocks):
        for snap in block:
            ordered=sorted(snap['data'],key=lambda r:(-r['quote']['USD']['market_cap'],str(r['id'])))
            for i,row in enumerate(ordered):
                q=row['quote']['USD']
                if not q['price'] or q['price']<=0 or not q['market_cap'] or q['market_cap']<=0: continue
                timestamp=int(datetime.fromisoformat(q['last_updated'].replace('Z','+00:00')).timestamp()*1000)
                rank=row.get('cmc_rank')
                rank=rank if isinstance(rank,int) and rank>0 else i+1
                k=(mode,bi,str(row['id']),timestamp,q['price'],rank)
                source_quotes[k]=min(source_quotes.get(k,float('inf')),snap['decision'])
signals={(s['mode'],s['view'],s['method'],s['signal']):s for s in original['signals']}
quote_checks=0
lookup={}
for trace in traces:
    signal=signals[trace['mode'],trace['view'],trace['method'],trace['signal']]
    start=int(datetime.fromisoformat(signal['start'].replace('Z','+00:00')).timestamp()*1000)
    end=int(datetime.fromisoformat(signal['end'].replace('Z','+00:00')).timestamp()*1000)
    for q in trace['quotes']:
        assert start<=q['time']<=end
        assert source_quotes[trace['mode'],signal['block'],trace['id'],q['time'],q['price'],q['rank']]<=end
        quote_checks+=1
    assert classify(trace['quotes'])==trace['state']
    key=(trace['mode'],trace['view'],trace['method'],trace['signal'],trace['id'])
    assert key not in lookup
    lookup[key]=trace['state']
assert len(records)==len(original['records'])
buckets=defaultdict(list)
for row,old in zip(records,original['records']):
    clean={**row,'positions':[{k:v for k,v in p.items() if k!='state'} for p in row['positions']]}
    assert clean==old
    for p in row['positions']: assert p['state']==lookup[row['mode'],row['view'],row['method'],row['signal'],p['id']]
    buckets[row['mode'],row['view'],row['method'],row['holding']].append(row)

def net(p,field):
    if p['entryMissing']: return Decimal(0)
    fee=Decimal('.01' if field.endswith('100') else '.005')
    gross=p['gross']
    if gross is None: gross=-1 if 'Loss' in field else 0
    return (1+Decimal(str(gross)))*(1-fee)/(1+fee)-1

fields=['net50','net100','netLoss50','netLoss100']
checks=0
def close(a,b):
    global checks
    if b is None: assert a is None
    else: assert abs(Decimal(str(a))-Decimal(str(b)))<Decimal('0.00000000006'),(a,b)
    checks+=1

def quantile(values,p):
    if not values:return None
    values=sorted(values); i=(len(values)-1)*p;lo=math.floor(i);hi=math.ceil(i)
    return values[lo]+(values[hi]-values[lo])*Decimal(str(i-lo))

def metrics(rows,state,exported):
    positions=[p for row in rows for p in row['positions'] if p['state']==state]
    known=[p for p in positions if not p['entryMissing'] and not p['exitMissing']]
    expected={'dates':len(rows),'activeDates':sum(any(p['state']==state for p in r['positions']) for r in rows),'coins':len(set(p['id'] for p in positions)),'selected':len(positions),'known':len(known),'knownLosses50':sum(net(p,'net50')<0 for p in known),'entryMissing':sum(p['entryMissing'] for p in positions),'exitMissing':sum(p['exitMissing'] for p in positions),'realizedGain20Known50':sum(net(p,'net50')>=Decimal('.2') for p in known),'sampledTouch20':sum(p['hit'] for p in positions),'unknownNoTouch20':sum(p['unknownNoHit'] for p in positions)}
    for k,v in expected.items(): assert exported[k]==v,(k,v,exported[k])
    for f in fields:
        value=sum(net(p,f) for p in positions)/Decimal(10*len(rows)) if rows else None
        close(exported['mean'+f[0].upper()+f[1:]],value)
    for fee in ['50','100']:
        values=[net(p,'net'+fee) for p in known]
        close(exported['medianKnownNet'+fee],quantile(values,.5))
        close(exported['p10KnownNet'+fee],quantile(values,.1))

cellkeys=set()
for cell in artifact['cells']:
    key=(cell['mode'],cell['view'],cell['method'],cell['holding']);state=cell['state']
    assert (*key,state) not in cellkeys
    cellkeys.add((*key,state))
    rows=sorted(buckets[key],key=lambda r:r['signal']);later=rows[len(rows)//2:]
    assert cell['recommendation'] is None
    assert cell['signalStart']==rows[0]['signal'] and cell['signalEnd']==rows[-1]['signal']
    assert cell['laterStart']==later[0]['signal']
    assert cell['exitStart']==min(r['exitSnapshot'] for r in rows)
    assert cell['exitEnd']==max(r['exitSnapshot'] for r in rows)
    metrics(rows,state,cell['all']);metrics(later,state,cell['later'])
    for f in fields:
        baseline=[sum(net(p,f) for p in r['positions'])/10 for r in later]
        subset=[sum((net(p,f) for p in r['positions'] if p['state']==state),Decimal(0))/10 for r in later]
        diff=[a-b for a,b in zip(subset,baseline)]
        output=cell['laterPaired'][f]
        close(output['meanDifference'],sum(diff)/len(diff))
        close(output['withoutBestDifference'],(sum(diff)-max(diff))/(len(diff)-1) if len(diff)>1 else None)
        close(output['baselineMean'],sum(baseline)/len(baseline))
        assert output['wins']==sum(x>Decimal('0.000000000001') for x in diff)
for key,rows in buckets.items():
    for state in study['statePriority']:
        assert ((*key,state) in cellkeys)==any(p['state']==state for r in rows for p in r['positions'])
report={'status':'passed','date':'2026-09-14','scope':'Independent Python classifications and Decimal aggregation from frozen selection/outcome ledger; no predictive validation.','classifications':len(traces),'sourceQuoteChecks':quote_checks,'cells':len(cellkeys),'decimalComparisons':checks,'sourceCohorts':len(records),'hashes':{'artifact':sha(ROOT/'modules/data/coin-outlook-evidence.json'),'traces':sha(HERE/'classification-traces.json.gz'),'stateLedger':sha(HERE/'state-ledger.json.gz'),'verifier':sha(HERE/'verify.py')}}
(HERE/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
