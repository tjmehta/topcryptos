'use strict'
process.env.TZ='UTC'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict'),ts=require('typescript')
const ROOT=path.resolve(__dirname,'../../..'),HERE=__dirname,SOURCE=path.join(ROOT,'research/cumulative/2026-09-13')
const read=p=>fs.readFileSync(p), hash=p=>crypto.createHash('sha256').update(read(p)).digest('hex'), load=p=>JSON.parse(zlib.gunzipSync(read(path.join(SOURCE,p))))
const summary=JSON.parse(read(path.join(SOURCE,'cmc-summary.json'))),inputs=load('cmc-inputs.json.gz'),ledger=load('cmc-results.json.gz')
assert.equal(hash(path.join(SOURCE,'cmc-inputs.json.gz')),summary.hashes.inputs)
assert.equal(hash(path.join(SOURCE,'cmc-results.json.gz')),summary.hashes.ledger)
assert.equal(hash(path.join(ROOT,'modules/processRankings.ts')),summary.hashes.sources['modules/processRankings.ts'])
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(read(filename).toString(),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename)
const {processRankings}=require(path.join(ROOT,'modules/processRankings.ts'))
const states=['fading','extended','building','mixed','unavailable'], fields=['net50','net100','netLoss50','netLoss100']
const median=xs=>{const a=[...xs].sort((a,b)=>a-b),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function classify(q){
 if(q.length<3||q.some((v,i)=>!Number.isFinite(v.price)||v.price<=0||!Number.isFinite(v.rank)||v.rank<=0||!Number.isFinite(v.time)||(i>0&&v.time<=q[i-1].time)))return'unavailable'
 const first=q[0],last=q.at(-1),prev=q.at(-2),logs=q.slice(1).map((v,i)=>Math.log(v.price)-Math.log(q[i].price)),final=logs.at(-1),total=Math.log(last.price)-Math.log(first.price)
 if(last.price<first.price&&last.price<prev.price)return'fading'
 if(last.price>first.price&&final>0&&q.length>=6&&final>2*median(logs.slice(0,-1).map(Math.abs))&&final>=total/2)return'extended'
 if(last.price>first.price&&last.rank<first.rank&&last.price>=prev.price)return'building'
 return'mixed'
}
const quantile=(xs,p)=>{if(!xs.length)return null;const a=[...xs].sort((a,b)=>a-b),i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo)}
const key=s=>[s.mode,s.view,s.method,s.signal].join('/'),mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null,round=n=>n===null?null:Math.round(n*1e10)/1e10
const net=(p,field)=>{if(p.entryMissing)return 0;const cost=field.endsWith('100')?.01:.005,gross=p.gross??(field.includes('Loss')?-1:0);return(1+gross)*(1-cost)/(1+cost)-1}
function metrics(rs,state){const positions=rs.flatMap(r=>r.positions.filter(p=>p.state===state)),known=positions.filter(p=>!p.entryMissing&&!p.exitMissing);return{dates:rs.length,activeDates:rs.filter(r=>r.positions.some(p=>p.state===state)).length,coins:new Set(positions.map(p=>p.id)).size,selected:positions.length,known:known.length,knownLosses50:known.filter(p=>net(p,'net50')<0).length,entryMissing:positions.filter(p=>p.entryMissing).length,exitMissing:positions.filter(p=>p.exitMissing).length,medianKnownNet50:round(quantile(known.map(p=>net(p,'net50')),.5)),medianKnownNet100:round(quantile(known.map(p=>net(p,'net100')),.5)),p10KnownNet50:round(quantile(known.map(p=>net(p,'net50')),.1)),p10KnownNet100:round(quantile(known.map(p=>net(p,'net100')),.1)),realizedGain20Known50:known.filter(p=>net(p,'net50')>=.2).length,sampledTouch20:positions.filter(p=>p.hit).length,unknownNoTouch20:positions.filter(p=>p.unknownNoHit).length,...Object.fromEntries(fields.map(f=>['mean'+f[0].toUpperCase()+f.slice(1),round(mean(rs.map(r=>r.positions.filter(p=>p.state===state).reduce((s,p)=>s+net(p,f),0)/10)))]))}}
async function main(){
 const lookup=new Map(),traces=[],groups=new Map()
 for(const signal of ledger.signals){const k=[signal.mode,signal.view,signal.signal].join('/');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(signal)}
 let replayed=0,scoreChecks=0,warningCount=0
 for(const signals of groups.values()){
  const s=signals[0],block=inputs.blocks[s.mode][s.block],end=Date.parse(s.end),index=block.findIndex(b=>b.decision===end);assert(index>=0)
  const snapshots=block.slice(Math.max(0,index-(s.mode==='daily'?90:25)+1),index+1).map(b=>({data:b.data.filter(r=>Date.parse(r.quote.USD.last_updated)<=end)}))
  const oldWarn=console.warn;console.warn=()=>warningCount++
  let result;try{result=await processRankings(snapshots,new Date(s.start),new Set(),{algorithm:'classic',endDate:new Date(s.end),intervalMs:s.mode==='daily'?86400000:3600000})}finally{console.warn=oldWarn}
  for(const sig of signals){const selected=[];for(const selectedCoin of sig.selected){const c=result.cryptosById[selectedCoin.id];assert(c&&!c.insufficientHistory)
   if(sig.method==='classic'){assert(Math.abs(c.score-selectedCoin.score)<1e-9);scoreChecks++}
   const quotes=c.quotes.map(q=>({time:q.date.getTime(),price:q.price,rank:q.rankByMarketCap}));assert(quotes.every(q=>q.time>=Date.parse(s.start)&&q.time<=end))
   const state=classify(quotes);selected.push({id:selectedCoin.id,state});traces.push({mode:s.mode,view:s.view,method:sig.method,signal:s.signal,id:selectedCoin.id,state,quotes})
  }lookup.set(key(sig),new Map(selected.map(p=>[p.id,p.state])))}
  replayed++;if(replayed%100===0)console.log('Replayed '+replayed+' signal windows')
 }
 const records=ledger.records.map(r=>({...r,positions:r.positions.map(p=>({...p,state:lookup.get(key(r)).get(p.id)}))}))
 const cells=[],buckets=new Map()
 for(const r of records){for(const f of fields)assert(Math.abs(r.positions.reduce((s,p)=>s+net(p,f),0)/10-r[f])<1e-12);const k=[r.mode,r.view,r.method,r.holding].join('/');if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(r)}
 for(const rs of buckets.values()){
  rs.sort((a,b)=>a.signal.localeCompare(b.signal));const later=rs.slice(Math.floor(rs.length/2)),r=rs[0]
  for(const state of states){
   const all=metrics(rs,state);if(!all.selected)continue
   const laterMetrics=metrics(later,state),paired=Object.fromEntries(fields.map(f=>{const diffs=later.map(r=>r.positions.filter(p=>p.state===state).reduce((s,p)=>s+net(p,f),0)/10-r[f]);return[f,{meanDifference:round(mean(diffs)),withoutBestDifference:round(diffs.length>1?(diffs.reduce((s,x)=>s+x,0)-Math.max(...diffs))/(diffs.length-1):null),wins:diffs.filter(x=>x>0).length,baselineMean:round(mean(later.map(r=>r[f])))}]}))
   cells.push({mode:r.mode,view:r.view,method:r.method,state,holding:r.holding,signalStart:rs[0].signal,signalEnd:rs.at(-1).signal,exitStart:rs.map(r=>r.exitSnapshot).sort()[0],exitEnd:rs.map(r=>r.exitSnapshot).sort().at(-1),laterStart:later[0]?.signal??null,all,later:laterMetrics,laterPaired:paired,recommendation:null})
  }
 }
 const artifact={schemaVersion:1,study:{date:'2026-09-14',source:'native-cmc-top-ten',validation:'descriptive-retrospective-only',recommendation:null,statePriority:states,costsEachSide:[.005,.01],holdingGrid:summary.holds,views:summary.views,methods:summary.methods,dataBlocks:summary.dataBlocks,scorerHash:hash(path.join(ROOT,'modules/processRankings.ts')),inputHash:hash(path.join(SOURCE,'cmc-inputs.json.gz')),ledgerHash:hash(path.join(SOURCE,'cmc-results.json.gz')),protocolHash:hash(path.join(HERE,'protocol.md')),runnerHash:hash(__filename)},cells}
 fs.writeFileSync(path.join(ROOT,'modules/data/coin-outlook-evidence.json'),JSON.stringify(artifact)+'\n')
 fs.writeFileSync(path.join(HERE,'classification-traces.json.gz'),zlib.gzipSync(JSON.stringify(traces)))
 fs.writeFileSync(path.join(HERE,'state-ledger.json.gz'),zlib.gzipSync(JSON.stringify(records)))
 fs.writeFileSync(path.join(HERE,'run-summary.json'),JSON.stringify({replayed,scoreChecks,warningCount,sourceCohorts:records.length,classifications:traces.length,stateCounts:Object.fromEntries(states.map(s=>[s,traces.filter(t=>t.state===s).length])),cells:cells.length,artifactBytes:fs.statSync(path.join(ROOT,'modules/data/coin-outlook-evidence.json')).size},null,2)+'\n')
 console.log(fs.readFileSync(path.join(HERE,'run-summary.json'),'utf8'))
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
module.exports={classify}
