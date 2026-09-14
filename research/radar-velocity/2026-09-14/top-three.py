import gzip,hashlib,json,statistics
from datetime import datetime,timezone
from decimal import Decimal as D
from pathlib import Path
HERE=Path(__file__).resolve().parent
ledger=json.loads(gzip.decompress((HERE/'ledger.json.gz').read_bytes()))
rows=[]
for boundary in [300,200]:
 for hold in [7,14]:
  xs={s:[x for x in ledger if x['mode']=='daily' and x['view']==7 and x['boundary']==boundary and x['hold']==hold and x['strategy']==s] for s in ['rank_velocity','cross_price']}
  paired=[]
  for a,b in zip(xs['rank_velocity'],xs['cross_price']):
   assert a['signalDate']==b['signalDate']
   r={'signalDate':a['signalDate'],'phase':a['phase'],'sameSelections':{p['coinId'] for p in a['positions'][:3]}=={p['coinId'] for p in b['positions'][:3]}}
   for strategy,x in [('rank_velocity',a),('cross_price',b)]:
    ps=x['positions'][:3]
    nets={k:sum(p['net'][k] for p in ps)/3 for k in ['loss50','loss100','flat50','flat100']}
    # Independent Decimal recomputation directly from stored entry/exit prices.
    for fee in [50,100]:
     for mark in ['loss','flat']:
      total=D(0);factor=(D(10000)-fee)/(D(10000)+fee)
      for p in ps:
       entry=p['entryPrice'];end=p['exitPrice']
       total+=D(0) if entry is None else D(str(end))/D(str(entry))*factor-1 if end is not None else D(-1) if mark=='loss' else factor-1
      assert abs(float(total/3)-nets[f'{mark}{fee}'])<1e-12
    r[strategy]={'coins':[p['coinId'] for p in ps],'net':nets}
   r['difference']=r['rank_velocity']['net']['loss50']-r['cross_price']['net']['loss50']
   paired.append(r)
  phases={}
  for phase in ['all','early','later']:
   rs=[r for r in paired if phase=='all' or r['phase']==phase]
   diffs=[r['difference'] for r in rs]
   phases[phase]={'dates':len(rs),'differentSelections':sum(not r['sameSelections'] for r in rs),'pairedMeanDifference':statistics.mean(diffs) if rs else None,'removeBestDifference':(sum(diffs)-max(diffs))/(len(diffs)-1) if len(diffs)>1 else None,'strategies':{}}
   for s in ['rank_velocity','cross_price']:
    vals=[r[s]['net']['loss50'] for r in rs]
    phases[phase]['strategies'][s]={'meanNet':{k:statistics.mean(r[s]['net'][k] for r in rs) if rs else None for k in ['loss50','loss100','flat50','flat100']},'removeBestDateMean':(sum(vals)-max(vals))/(len(vals)-1) if len(vals)>1 else None}
  rows.append({'boundary':boundary,'hold':hold,'phases':phases,'paired':paired})
result={'generatedAt':datetime.now(timezone.utc).isoformat(),'protocolSha256':hashlib.sha256((HERE/'top-three-protocol.md').read_bytes()).hexdigest(),'verifiedLedgerSha256':hashlib.sha256((HERE/'ledger.json.gz').read_bytes()).hexdigest(),'runnerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'decimalReturnVerificationPassed':True,'cells':rows}
(HERE/'top-three.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps([{**{k:r[k] for k in ['boundary','hold']},'all':r['phases']['all'],'later':r['phases']['later']} for r in rows],indent=2))
