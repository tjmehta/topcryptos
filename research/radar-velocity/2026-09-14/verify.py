"""Independent source reconstruction. Does not import replay implementation."""
import gzip,hashlib,json,math,statistics
from collections import defaultdict
from datetime import datetime,timezone
from decimal import Decimal,getcontext
from pathlib import Path
getcontext().prec=40
D=Decimal
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
source=ROOT/'research/cumulative/2026-09-13/cmc-inputs.json.gz'
raw=json.loads(gzip.decompress(source.read_bytes()))
ledger=json.loads(gzip.decompress((HERE/'ledger.json.gz').read_bytes()))
summary=json.loads((HERE/'summary.json').read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest()==summary['sourceSha256']
assert hashlib.sha256((HERE/'run.py').read_bytes()).hexdigest()==summary['runnerSha256']
assert hashlib.sha256((HERE/'protocol.md').read_bytes()).hexdigest()==summary['protocolSha256']
checks=defaultdict(int)
def eq(a,b):
 checks['numericComparisons']+=1
 assert (a is None and b is None) or (a is not None and b is not None and math.isclose(float(a),float(b),rel_tol=1e-10,abs_tol=1e-12)),(a,b)
def utc(x):return datetime.fromtimestamp(x/1000,timezone.utc).isoformat()
def valid(s):
 result={}
 for c in s['data']:
  q=c['quote']['USD'];r=c.get('cmc_rank');p=q.get('price')
  if not isinstance(c.get('id'),int) or not isinstance(r,int) or r<=0 or not isinstance(p,(int,float)) or not math.isfinite(p) or p<=0:continue
  age=s['decision']-datetime.fromisoformat(q['last_updated'].replace('Z','+00:00')).timestamp()*1000
  if 0<=age<=3600000:result[c['id']]=c
 return result
blocks={m:[[valid(s) for s in b] for b in bs] for m,bs in raw['blocks'].items()}
selected_cache={}
bycell=defaultdict(list)
for basket in ledger:
 m,v,h,b,bi,t=(basket[k] for k in ['mode','view','hold','boundary','block','signalIndex'])
 series=blocks[m][bi];original=raw['blocks'][m][bi]
 assert 0<=t-v+1 and t+1+h<len(series)
 for field,idx in [('signalDate',t),('entryDate',t+1),('exitDate',t+h+1)]:assert basket[field]==utc(original[idx]['time'])
 key=(m,v,b,bi,t)
 if key not in selected_cache:
  candidates=[]
  for ci,c in series[t].items():
   hist=[s.get(ci) for s in series[t-v+1:t+1]]
   if not all(hist) or not b/2<c['cmc_rank']<=b:continue
   rank_positive=hist[0]['cmc_rank']>c['cmc_rank']
   price_positive=c['quote']['USD']['price']>hist[0]['quote']['USD']['price']
   crossed=hist[-2]['cmc_rank']>b
   speed=math.log(hist[0]['cmc_rank']/c['cmc_rank'])/(v-1)
   momentum=math.log(c['quote']['USD']['price']/hist[0]['quote']['USD']['price'])/(v-1)
   candidates.append((ci,crossed,rank_positive,price_positive,speed,momentum))
  confirmed=[c for c in candidates if all(c[1:4])]
  selected_cache[key]={
   'rank_velocity':[c[0] for c in sorted(confirmed,key=lambda c:(-c[4],c[0]))[:10]],
   'cross_price':[c[0] for c in sorted(confirmed,key=lambda c:(-c[5],c[0]))[:10]],
   'cross_only':sorted(c[0] for c in candidates if c[1])[:10],
   'band_momentum':[c[0] for c in sorted([c for c in candidates if c[3]],key=lambda c:(-c[5],c[0]))[:10]]}
 assert [p['coinId'] for p in basket['positions']]==selected_cache[key][basket['strategy']]
 checks['basketSelections']+=1
 sums={f'{mark}{fee}':D(0) for mark in ['loss','flat'] for fee in [50,100]}
 for p in basket['positions']:
  ci=p['coinId'];entry=series[t+1].get(ci);end=series[t+h+1].get(ci)
  ep=D(str(entry['quote']['USD']['price'])) if entry else None
  xp=D(str(end['quote']['USD']['price'])) if end else None
  eq(p['entryPrice'],ep);eq(p['exitPrice'],xp)
  assert p['entryMissing']==(entry is None)
  assert p['exitMissing']==(entry is not None and end is None)
  start=series[t-v+1][ci];sig=series[t][ci];prev=series[t-1][ci]
  assert (p['startRank'],p['previousRank'],p['signalRank'])==(start['cmc_rank'],prev['cmc_rank'],sig['cmc_rank'])
  eq(p['rankSpeed'],math.log(start['cmc_rank']/sig['cmc_rank'])/(v-1))
  eq(p['priceMomentum'],math.log(sig['quote']['USD']['price']/start['quote']['USD']['price'])/(v-1))
  supplies=[start.get('circulating_supply'),sig.get('circulating_supply')]
  assert p['supplyJump']==(all(isinstance(z,(int,float)) and z>0 for z in supplies) and abs(supplies[1]/supplies[0]-1)>.05)
  for fee in [50,100]:
   factor=(D(10000)-fee)/(D(10000)+fee)
   for mark in ['loss','flat']:
    net=D(0) if ep is None else xp/ep*factor-1 if xp is not None else D(-1) if mark=='loss' else factor-1
    eq(p['net'][f'{mark}{fee}'],net);sums[f'{mark}{fee}']+=net
  path=[s.get(ci) for s in series[t+1:t+h+2]]
  assert p['pathMissing']==sum(c is None for c in path)
  eq(p['observedWorstGross'],min(D(str(c['quote']['USD']['price']))/ep-1 for c in path if c is not None) if ep is not None else None)
  for field,predicate in [('rankTouch',lambda c:c['cmc_rank']<=basket['milestone']),('recross',lambda c:c['cmc_rank']>b)]:
   hits=[c is not None and predicate(c) for c in path]
   expected=True if any(hits) else None if any(c is None for c in path) else False
   assert p[field] is expected
  assert p['rankEnd'] is (None if end is None else end['cmc_rank']<=basket['milestone'])
  for gain in [20,100,400]:
   hits=[] if ep is None else [c is not None and D(str(c['quote']['USD']['price']))>=ep*(1+D(gain)/100) for c in path]
   expected=None if ep is None else True if any(hits) else None if any(c is None for c in path) else False
   assert p['priceTouches'][str(gain)] is expected
  checks['positions']+=1
 for k,total in sums.items():eq(basket['net'][k],total/10)
 bycell[(m,v,h,b,basket['strategy'])].append(basket)

for cell in summary['cells']:
 key=tuple(cell[k] for k in ['mode','view','hold','boundary'])
 for strategy,phases in cell['strategies'].items():
  baskets=bycell[(*key,strategy)]
  times=sorted(x['signalDate'] for x in baskets)
  split=times[len(times)//2] if times else None
  first_entry=min((x['entryDate'] for x in baskets if x['signalDate']>=split),default=None)
  last={}
  for x in baskets:
   assert x['phase']==('later' if x['signalDate']>=split else 'early' if x['exitDate']<first_entry else 'purged')
   non=x['block'] not in last or x['signalIndex']-last[x['block']]>=x['hold']+1
   assert x['nonoverlapping']==non
   if non:last[x['block']]=x['signalIndex']
  for phase,metrics in phases.items():
   xs=[x for x in baskets if phase=='all' or (x['nonoverlapping'] if phase=='nonoverlapping' else x['phase']==phase)]
   ps=[p for x in xs for p in x['positions']]
   assert metrics['baskets']==len(xs) and metrics['positions']==len(ps)
   assert metrics['coins']==len({p['coinId'] for p in ps})
   assert metrics['activeDates']==sum(bool(x['positions']) for x in xs)
   assert metrics['entryMissing']==sum(p['entryMissing'] for p in ps)
   assert metrics['exitMissing']==sum(p['exitMissing'] for p in ps)
   assert metrics['supplyJumpPositions']==sum(p['supplyJump'] for p in ps)
   eq(metrics['meanSlots'],len(ps)/len(xs) if xs else None)
   eq(metrics['investedPositionMeanLoss50'],statistics.mean(p['net']['loss50'] for p in ps if not p['entryMissing']) if any(not p['entryMissing'] for p in ps) else None)
   for field in ['rankTouch','rankEnd']:
    for value in [True,False,None]:assert metrics[field][str(value)]==sum(p[field] is value for p in ps)
   for gain in [20,100,400]:
    for value in [True,False,None]:assert metrics['priceTouches'][str(gain)][str(value)]==sum(p['priceTouches'][str(gain)] is value for p in ps)
   for k in ['loss50','loss100','flat50','flat100']:eq(metrics['meanNet'][k],sum(D(str(x['net'][k])) for x in xs)/len(xs) if xs else None)
   eq(metrics['medianNetLoss50'],statistics.median(x['net']['loss50'] for x in xs) if xs else None)
   eq(metrics['removeBestDateMean'],(sum(x['net']['loss50'] for x in xs)-max(x['net']['loss50'] for x in xs))/(len(xs)-1) if len(xs)>1 else None)
   checks['phaseMetrics']+=1
 for baseline,metrics in cell['paired'].items():
  a=bycell[(*key,'rank_velocity')];baskets=bycell[(*key,baseline)]
  diffs=[x['net']['loss50']-y['net']['loss50'] for x,y in zip(a,baskets)]
  eq(metrics['meanNetDifference'],statistics.mean(diffs) if diffs else None)
  assert metrics['datesAhead']==sum(d>1e-12 for d in diffs)
  assert metrics['datesBehind']==sum(d< -1e-12 for d in diffs)
  assert metrics['sameSelections']==sum({p['coinId'] for p in x['positions']}=={p['coinId'] for p in y['positions']} for x,y in zip(a,baskets))
  later=[x['net']['loss50']-y['net']['loss50'] for x,y in zip(a,baskets) if x['phase']=='later']
  eq(metrics['laterMeanDifference'],statistics.mean(later) if later else None)

# Interpretation audit: distinguish a NEW milestone from one already reached at signal.
audit=[]
for cell in summary['cells']:
 key=tuple(cell[k] for k in ['mode','view','hold','boundary'])
 xs=bycell[(*key,'rank_velocity')];ps=[p for x in xs for p in x['positions']]
 pending=[p for p in ps if p['signalRank']>cell['milestone']]
 audit.append({**dict(zip(['mode','view','hold','boundary'],key)),'milestone':cell['milestone'],'positions':len(ps),'alreadyAtMilestone':len(ps)-len(pending),'pending':len(pending),'newMilestoneTouch':{str(value):sum(p['rankTouch'] is value for p in pending) for value in [True,False,None]},'newMilestoneEnd':{str(value):sum(p['rankEnd'] is value for p in pending) for value in [True,False,None]},'anyRecross':{str(value):sum(p['recross'] is value for p in ps) for value in [True,False,None]},'meanObservedWorstGross':statistics.mean(p['observedWorstGross'] for p in ps if p['observedWorstGross'] is not None) if any(p['observedWorstGross'] is not None for p in ps) else None,'maximumSelected':max((len(x['positions']) for x in xs),default=0)})
result={'verifiedAt':datetime.now(timezone.utc).isoformat(),'passed':True,'checks':dict(checks),'sourceSha256':summary['sourceSha256'],'ledgerSha256':hashlib.sha256((HERE/'ledger.json.gz').read_bytes()).hexdigest(),'verifierSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'note':'Independent implementation reconstructs selection, all ledger prices/returns/path touches and phase summary means. Same frozen data; verification does not establish predictive validity.'}
(HERE/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
(HERE/'milestone-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps(result,indent=2))
print(json.dumps([x for x in audit if x['mode']=='daily' and x['view']==7 and x['hold']==7 and x['boundary'] in [200,300]],indent=2))
