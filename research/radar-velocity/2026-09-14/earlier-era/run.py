"""Frozen-protocol descriptive radar replay. No fitted parameters."""
import gzip, hashlib, json, math, statistics
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
SOURCE=HERE/'inputs.json.gz'
raw=json.loads(gzip.decompress(SOURCE.read_bytes()))
STRATEGIES=['rank_velocity','cross_price','cross_only','band_momentum']
BOUNDS={300:200,200:150}
GRID={'daily':([7],[7,14,30])}
quality=Counter()
def date(ms): return datetime.fromtimestamp(ms/1000,timezone.utc).isoformat()
def clean(s):
 out={}
 for c in s['data']:
  quality['rawRows']+=1
  q=c['quote']['USD']; r=c.get('cmc_rank'); p=q.get('price')
  try: age=s['decision']-datetime.fromisoformat(q['last_updated'].replace('Z','+00:00')).timestamp()*1000
  except (KeyError,ValueError): age=-1
  if not isinstance(c['id'],int) or not isinstance(r,int) or r<=0 or not isinstance(p,(int,float)) or not math.isfinite(p) or p<=0:
   quality['invalidRows']+=1;continue
  if not 0<=age<=3600000: quality['staleOrFutureRows']+=1;continue
  assert c['id'] not in out
  out[c['id']]={'rank':r,'price':p,'supply':c.get('circulating_supply'),'symbol':c['symbol']}
 return out
prepared={m:[[clean(s) for s in b] for b in bs] for m,bs in raw['blocks'].items()}
coverage=[]
for m,bs in raw['blocks'].items():
 for bi,b in enumerate(bs):
  catalogs=[{c['id'] for c in s['data']} for s in b]
  coverage.append({'mode':m,'block':bi,'snapshots':len(b),'start':date(b[0]['time']),'end':date(b[-1]['time']), 'arrivals':sum(len(y-x) for x,y in zip(catalogs,catalogs[1:])), 'departures':sum(len(x-y) for x,y in zip(catalogs,catalogs[1:]))})

def truth(path,predicate):
 return True if any(c is not None and predicate(c) for c in path) else None if any(c is None for c in path) else False

def position(series,ci,t,h,b,features):
 entry=series[t+1].get(ci); end=series[t+1+h].get(ci)
 path=[s.get(ci) for s in series[t+1:t+2+h]]
 gross=end['price']/entry['price'] if entry and end else None
 nets={}
 for fee in [50,100]:
  f=(1-fee/10000)/(1+fee/10000)
  for mark in ['loss','flat']:
   nets[f'{mark}{fee}']=0 if entry is None else (gross*f-1 if end else -1 if mark=='loss' else f-1)
 return {'coinId':ci,**features,'entryPrice':entry['price'] if entry else None,'exitPrice':end['price'] if end else None,'entryMissing':entry is None,'exitMissing':bool(entry and not end),'gross':gross,'net':nets,'rankTouch':truth(path,lambda c:c['rank']<=BOUNDS[b]),'rankEnd':None if end is None else end['rank']<=BOUNDS[b],'recross':truth(path,lambda c:c['rank']>b),'priceTouches':{str(k):None if entry is None else truth(path,lambda c:c['price']>=entry['price']*(1+k/100)) for k in [20,100,400]},'observedWorstGross':min(c['price']/entry['price']-1 for c in path if c) if entry else None,'pathMissing':sum(c is None for c in path)}

def describe(baskets):
 positions=[p for x in baskets for p in x['positions']]
 returns=[x['net']['loss50'] for x in baskets]
 out={'baskets':len(baskets),'positions':len(positions),'coins':len({p['coinId'] for p in positions}),'activeDates':sum(bool(x['positions']) for x in baskets),'meanSlots':len(positions)/len(baskets) if baskets else None,'entryMissing':sum(p['entryMissing'] for p in positions),'exitMissing':sum(p['exitMissing'] for p in positions),'supplyJumpPositions':sum(p['supplyJump'] for p in positions),'meanNet':{k:statistics.mean(x['net'][k] for x in baskets) if baskets else None for k in ['loss50','loss100','flat50','flat100']},'medianNetLoss50':statistics.median(returns) if returns else None,'removeBestDateMean':(sum(returns)-max(returns))/(len(returns)-1) if len(returns)>1 else None,'investedPositionMeanLoss50':statistics.mean(p['net']['loss50'] for p in positions if not p['entryMissing']) if any(not p['entryMissing'] for p in positions) else None,'rankTouch':{str(v):sum(p['rankTouch'] is v for p in positions) for v in [True,False,None]},'rankEnd':{str(v):sum(p['rankEnd'] is v for p in positions) for v in [True,False,None]},'priceTouches':{str(k):{str(v):sum(p['priceTouches'][str(k)] is v for p in positions) for v in [True,False,None]} for k in [20,100,400]}}
 return out

ledger=[];cells=[];disconnect=[]
for mode,(views,holds) in GRID.items():
 for view in views:
  signals=[];disc=Counter()
  for bi,series in enumerate(prepared[mode]):
   block=raw['blocks'][mode][bi]
   for t in range(view-1,len(series)-1):
    feats={}
    for ci,c in series[t].items():
     hist=[s.get(ci) for s in series[t-view+1:t+1]]
     if any(x is None for x in hist):continue
     speed=math.log(hist[0]['rank']/c['rank'])/(view-1)
     mom=math.log(c['price']/hist[0]['price'])/(view-1)
     if speed>0:
      disc['rankImproved']+=1
      if mom<=0:disc['priceNotUp']+=1
     supplies=[x['supply'] for x in [hist[0],c]]
     jump=all(isinstance(x,(int,float)) and x>0 for x in supplies) and abs(supplies[1]/supplies[0]-1)>.05
     feats[ci]={'symbol':c['symbol'],'startRank':hist[0]['rank'],'previousRank':hist[-2]['rank'],'signalRank':c['rank'],'rankSpeed':speed,'priceMomentum':mom,'supplyJump':jump}
    for bound in BOUNDS:
     band=[i for i,f in feats.items() if bound/2<f['signalRank']<=bound]
     cross=[i for i in band if feats[i]['previousRank']>bound]
     confirmed=[i for i in cross if feats[i]['rankSpeed']>0 and feats[i]['priceMomentum']>0]
     choices={'rank_velocity':sorted(confirmed,key=lambda i:(-feats[i]['rankSpeed'],i))[:10], 'cross_price':sorted(confirmed,key=lambda i:(-feats[i]['priceMomentum'],i))[:10], 'cross_only':sorted(cross)[:10], 'band_momentum':sorted([i for i in band if feats[i]['priceMomentum']>0],key=lambda i:(-feats[i]['priceMomentum'],i))[:10]}
     signals.append((bi,t,bound,feats,choices))
  disconnect.append({'mode':mode,'view':view,**disc})
  for h in holds:
   for bound in BOUNDS:
    mature=[s for s in signals if s[2]==bound and s[1]+1+h<len(prepared[mode][s[0]])]
    dates=sorted({raw['blocks'][mode][bi][t]['time'] for bi,t,*_ in mature})
    split=dates[len(dates)//2] if dates else None
    later_entries=[raw['blocks'][mode][bi][t+1]['time'] for bi,t,*_ in mature if raw['blocks'][mode][bi][t]['time']>=split]
    first_later_entry=min(later_entries) if later_entries else None
    samples={s:[] for s in STRATEGIES}
    last_nonoverlap={}
    for bi,t,b,feats,choices in mature:
     series=prepared[mode][bi];block=raw['blocks'][mode][bi]
     nonoverlap=bi not in last_nonoverlap or t>=last_nonoverlap[bi]+h+1
     if nonoverlap:last_nonoverlap[bi]=t
     phase='later' if block[t]['time']>=split else 'early' if block[t+1+h]['time']<first_later_entry else 'purged'
     for strategy in STRATEGIES:
      ps=[position(series,ci,t,h,b,feats[ci]) for ci in choices[strategy]]
      basket={'mode':mode,'view':view,'hold':h,'boundary':b,'milestone':BOUNDS[b],'strategy':strategy,'block':bi,'signalIndex':t,'signalDate':date(block[t]['time']),'entryDate':date(block[t+1]['time']),'exitDate':date(block[t+1+h]['time']),'phase':phase,'nonoverlapping':nonoverlap,'positions':ps,'net':{k:sum(p['net'][k] for p in ps)/10 for k in ['loss50','loss100','flat50','flat100']}}
      ledger.append(basket);samples[strategy].append(basket)
    row={'mode':mode,'view':view,'hold':h,'boundary':bound,'milestone':BOUNDS[bound],'signalDates':len(dates),'strategies':{s:{'all':describe(v),'early':describe([x for x in v if x['phase']=='early']),'later':describe([x for x in v if x['phase']=='later']),'nonoverlapping':describe([x for x in v if x['nonoverlapping']])} for s,v in samples.items()},'paired':{}}
    for baseline in STRATEGIES[1:]:
     a=samples['rank_velocity'];z=samples[baseline]
     diffs=[x['net']['loss50']-y['net']['loss50'] for x,y in zip(a,z)]
     row['paired'][baseline]={'meanNetDifference':statistics.mean(diffs) if diffs else None,'datesAhead':sum(x>1e-12 for x in diffs),'datesBehind':sum(x< -1e-12 for x in diffs),'sameSelections':sum({p['coinId'] for p in x['positions']}=={p['coinId'] for p in y['positions']} for x,y in zip(a,z)),'laterMeanDifference':statistics.mean(x['net']['loss50']-y['net']['loss50'] for x,y in zip(a,z) if x['phase']=='later') if any(x['phase']=='later' for x in a) else None}
    cells.append(row)
summary={'generatedAt':datetime.now(timezone.utc).isoformat(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'protocolSha256':hashlib.sha256((HERE/'protocol.md').read_bytes()).hexdigest(),'runnerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'quality':dict(quality),'coverage':coverage,'rankPriceDisconnect':disconnect,'cells':cells,'basketCount':len(ledger),'positionCount':sum(len(x['positions']) for x in ledger)}
for p in [HERE/'summary.json',HERE/'ledger.json.gz']:
 if p.exists():raise RuntimeError(f'Refusing overwrite: {p}')
(HERE/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(HERE/'ledger.json.gz').write_bytes(gzip.compress(json.dumps(ledger,separators=(',',':')).encode(),mtime=0))
print(json.dumps({'baskets':summary['basketCount'],'positions':summary['positionCount'],'quality':summary['quality'],'primary':[{'boundary':c['boundary'],'hold':c['hold'],'radar':c['strategies']['rank_velocity']['all'],'paired':c['paired'],'later':c['strategies']['rank_velocity']['later']} for c in cells if c['mode']=='daily' and c['view']==7 and c['boundary'] in [200,300] and c['hold'] in [7,14]]},indent=2))
