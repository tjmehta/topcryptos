#!/usr/bin/env node
// Independent arithmetic and provenance checks. No strategy/helper imports.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const {gunzipSync}=require('node:zlib')
const HERE=__dirname,ROOT=path.resolve(HERE,'../../..'),HOUR=3600000,DAY=24*HOUR
const MARKS=['net0','net50','net100','netLoss50','netLoss100']
const VENUE_MARKS=['net_zero','net_loss','net100_zero','net100_loss']
const METHODS=['classic','momentum','trend-quality','cumulative','hybrid']
const hash=x=>crypto.createHash('sha256').update(x).digest('hex')
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const gzip=p=>JSON.parse(gunzipSync(fs.readFileSync(p)).toString())
const sha=p=>hash(fs.readFileSync(p))
const iso=t=>new Date(t).toISOString()
const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null
const median=xs=>{if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y),n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2}
function near(a,b,label='',tolerance=2e-10){assert(Number.isFinite(a)&&Number.isFinite(b),label);assert(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b)),`${label}: ${a} != ${b}`)}
function tree(a,b,label=''){
 if(typeof a==='number'){near(a,b,label);return}
 if(a===null||typeof a!=='object'){assert.equal(a,b,label);return}
 if(Array.isArray(a)){assert(Array.isArray(b),label);assert.equal(a.length,b.length,label);a.forEach((v,i)=>tree(v,b[i],`${label}/${i}`));return}
 assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),label)
 for(const k of Object.keys(a))tree(a[k],b[k],`${label}/${k}`)
}
function clean(value,magnitude){return Math.abs(value)<=32*Number.EPSILON*magnitude?0:value}
function signedRanks(values){
 const result={}
 for(const sign of [-1,1]){
  const group=Object.entries(values).filter(([,v])=>Number.isFinite(v)&&v*sign>0).sort((a,b)=>Math.abs(a[1])-Math.abs(b[1]))
  for(let i=0;i<group.length;){let j=i+1;while(j<group.length&&Math.abs(group[j][1])===Math.abs(group[i][1]))j++
   const value=sign*(i+(j-i)/2)/group.length
   for(let k=i;k<j;k++)result[group[k][0]]=value
   i=j
  }
 }
 for(const id of Object.keys(values))if(!(id in result))result[id]=0
 return result
}
function cumulative(quotes,span){
 const origin=Math.log(quotes[0].price)
 const ys=quotes.map(q=>Math.log(q.price)-origin)
 const trapezoids=quotes.slice(1).map((q,i)=>(ys[i]+ys[i+1])/2*(q.time-quotes[i].time))
 return clean(trapezoids.reduce((a,b)=>a+b,0),trapezoids.reduce((a,b)=>a+Math.abs(b),0))/span
}
function normalized(snaps,start,end){
 const measurements=new Map()
 for(const snap of snaps){
  const rows=snap.data.filter(r=>Number.isFinite(Date.parse(r.quote.USD.last_updated))&&Date.parse(r.quote.USD.last_updated)<=end)
   .sort((a,b)=>b.quote.USD.market_cap-a.quote.USD.market_cap||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0))
  rows.forEach((r,index)=>{
   const q=r.quote.USD,time=Date.parse(q.last_updated)
   if(time<start||time>end||!Number.isFinite(q.price)||q.price<=0||!Number.isFinite(q.market_cap)||q.market_cap<=0)return
   const id=String(r.id),key=`${id}:${time}`,rank=Number.isInteger(r.cmc_rank)&&r.cmc_rank>0?r.cmc_rank:index+1
   const next={id,time,price:q.price,cap:q.market_cap,rank},prior=measurements.get(key)
   if(!measurements.has(key))measurements.set(key,next)
   else if(prior&&(prior.price!==next.price||prior.cap!==next.cap||prior.rank!==next.rank))measurements.set(key,null)
  })
 }
 const groups={}
 for(const q of [...measurements.values()].filter(Boolean).sort((a,b)=>a.time-b.time||(a.id<b.id?-1:a.id>b.id?1:0)))(groups[q.id]??=[]).push(q)
 return groups
}
function reconstruct(snaps,start,end,unit){
 const raw=normalized(snaps,start,end),span=end-start,eligible=[],values={momentum:{},cumulative:{},'trend-quality':{},velocity:{},priceAccel:{},rankAccel:{}}
 for(const [id,quotes]of Object.entries(raw)){
  if(quotes.length<3)continue
  const first=quotes[0],last=quotes.at(-1),duration=last.time/1000/60-first.time/1000/60,fullMinutes=span/60000
  const coverage=Math.min(1,duration/fullMinutes),expected=Math.floor(fullMinutes*60000/unit)+1
  if(coverage<.5||quotes.length<Math.ceil(expected*.5)||end-last.time>unit||quotes.some((q,i)=>i>0&&q.time-quotes[i-1].time>2*unit))continue
  const momentum=(last.price-first.price)/first.price*100
  if(!Number.isFinite(momentum))continue
  eligible.push(id);values.momentum[id]=momentum;values.cumulative[id]=cumulative(quotes,span)
  values.velocity[id]=momentum/duration*coverage
  const deltas=quotes.slice(1).map((q,i)=>{
   const a=quotes[i],duration=q.time/1000/60-a.time/1000/60
   return {pv:((q.price-a.price)/a.price*100)/duration,rv:(q.rank-a.rank)/duration,time:Math.trunc(a.time+duration*60000/2)}
  })
  const accels=deltas.slice(1).map((d,i)=>{
   const a=deltas[i],duration=d.time/1000/60-a.time/1000/60
   return {p:clean(d.pv-a.pv,Math.abs(d.pv)+Math.abs(a.pv))/duration,r:clean(a.rv-d.rv,Math.abs(a.rv)+Math.abs(d.rv))/duration}
  })
  values.priceAccel[id]=clean(accels.reduce((s,r)=>s+r.p,0),accels.reduce((s,r)=>s+Math.abs(r.p),0))
  values.rankAccel[id]=clean(accels.reduce((s,r)=>s+r.r,0),accels.reduce((s,r)=>s+Math.abs(r.r),0))
  const xs=quotes.map(q=>(q.time-first.time)/DAY),ys=quotes.map(q=>Math.log(q.price)-Math.log(first.price)),mx=avg(xs),my=avg(ys)
  let xx=0,xy=0,yy=0;for(let i=0;i<xs.length;i++){xx+=(xs[i]-mx)**2;xy+=(xs[i]-mx)*(ys[i]-my);yy+=(ys[i]-my)**2}
  values['trend-quality'][id]=xx>0&&yy>0?xy/xx*Math.min(1,xy*xy/(xx*yy)):0
 }
 const ranks=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,signedRanks(v)])),scores={}
 for(const method of METHODS)scores[method]=Object.fromEntries(eligible.map(id=>[id,1000*(method==='classic'?(700*ranks.velocity[id]+200*ranks.priceAccel[id]+100*ranks.rankAccel[id])/1000:method==='hybrid'?(ranks.momentum[id]+ranks.cumulative[id])/2:ranks[method][id])]))
 return {eligible:eligible.sort(),scores,raw,values}
}
function difference(xs){return {n:xs.length,mean:avg(xs),median:median(xs),wins:xs.filter(x=>x>0).length,losses:xs.filter(x=>x<0).length,ties:xs.filter(x=>x===0).length,
 withoutBest:xs.length>1?(xs.reduce((a,b)=>a+b,0)-Math.max(...xs))/(xs.length-1):null,minimum:xs.length?Math.min(...xs):null,maximum:xs.length?Math.max(...xs):null}}
function metrics(rs){const ps=rs.flatMap(r=>r.positions),known=ps.filter(p=>p.gross!==null);return {cohorts:rs.length,signalDates:rs.map(r=>r.signal),slots:rs.length*10,selected:ps.length,
 means:Object.fromEntries(MARKS.map(m=>[m,avg(rs.map(r=>r[m]))])),hits:ps.filter(p=>p.hit).length,unknownNoHit:ps.filter(p=>p.unknownNoHit).length,known:known.length,
 knownLosers:known.filter(p=>(1+p.gross)*.995/1.005-1<0).length,realized20:known.filter(p=>(1+p.gross)*.995/1.005-1>=.2).length,
 entryMissing:ps.filter(p=>p.entryMissing).length,exitMissing:ps.filter(p=>p.exitMissing).length}}
function verifyRaw(inputs){
 const rawByName=new Map()
 for(const m of inputs.manifest){
  const bytes=fs.readFileSync(path.join(ROOT,'.cache/coinmarketcap',m.name));assert.equal(hash(bytes),m.sha256);assert.equal(bytes.length,m.bytes)
  const data=JSON.parse(bytes).data,counts=new Map()
  for(const r of data){const t=Date.parse(r.quote?.USD?.last_updated);if(Number.isFinite(t))counts.set(t,(counts.get(t)||0)+1)}
  const modal=[...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0]
  const rows=data.slice(0,500).filter(r=>r.quote.USD.market_cap>1e7)
  const nearby=rows.map(r=>Date.parse(r.quote.USD.last_updated)).filter(t=>Number.isFinite(t)&&Math.abs(t-modal)<=HOUR)
  tree({modal:iso(modal),decision:iso(Math.max(modal,...nearby)),rows:rows.length},{modal:m.modal,decision:m.decision,rows:m.rows})
  rawByName.set(m.name,{name:m.name,time:modal,decision:Date.parse(m.decision),data:rows})
 }
 for(const mode of ['daily','hourly']){
  const unit=mode==='daily'?DAY:HOUR,slots=new Map()
  for(const snap of rawByName.values()){
   const slot=mode==='daily'?Math.floor(snap.time/DAY):Math.round(snap.time/HOUR),distance=Math.abs(snap.time-(slot*unit+(mode==='daily'?23*HOUR:0)))
   if(distance>HOUR/2)continue
   const previous=slots.get(slot)
   if(!previous||distance<previous.distance||distance===previous.distance&&(snap.time<previous.snap.time||snap.time===previous.snap.time&&snap.name<previous.snap.name))slots.set(slot,{snap,distance})
  }
  const blocks=[]
  for(const [slot,{snap}]of [...slots].sort((a,b)=>a[0]-b[0])){
   if(!blocks.length||slot!==blocks.at(-1).at(-1).slot+1)blocks.push([])
   blocks.at(-1).push({...snap,slot})
  }
  tree(blocks.filter(b=>b.length>=3),inputs.blocks[mode],`raw-blocks/${mode}`)
 }
 return inputs.manifest.length
}
function verifyCmc(){
 const summary=read(path.join(HERE,'cmc-summary.json')),inputs=gzip(path.join(HERE,'cmc-inputs.json.gz')),data=gzip(path.join(HERE,'cmc-results.json.gz'))
 for(const [field,name]of [['inputs','cmc-inputs.json.gz'],['ledger','cmc-results.json.gz'],['sourceArtifact','cmc-sources.json']])assert.equal(sha(path.join(HERE,name)),summary.hashes[field])
 const sources=read(path.join(HERE,'cmc-sources.json')).sources
 for(const [name,expected]of Object.entries(summary.hashes.sources)){assert.equal(sha(path.join(ROOT,name)),expected);assert.equal(hash(sources[name].source),expected);assert.equal(sources[name].sha256,expected)}
 const rawFiles=verifyRaw(inputs),formations=new Map(),signalLookup=new Map();let scoreChecks=0,positions=0,knownPrices=0,pricePathChecks=0
 for(const s of data.signals){
  const k=[s.mode,s.view,s.block,s.signal].join('/'),block=inputs.blocks[s.mode][s.block],index=block.findIndex(b=>b.decision===Date.parse(s.signal)),unit=s.mode==='daily'?DAY:HOUR
  assert(index>=0);const end=Date.parse(s.signal),start=Math.floor(end/unit)*unit-(s.view-1)*unit
  assert.equal(iso(start),s.start);assert.equal(s.end,s.signal)
  if(!formations.has(k))formations.set(k,reconstruct(block.slice(Math.max(0,index-(s.mode==='daily'?90:25)+1),index+1),start,end,unit))
  const f=formations.get(k)
  tree(f.eligible,s.eligibleIds,`${k}/${s.method}/eligible`)
  tree(f.scores[s.method],s.allScores,`${k}/${s.method}/scores`);scoreChecks+=f.eligible.length
  const selected=Object.entries(f.scores[s.method]).sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:a[0]>b[0]?1:0)).slice(0,10)
  tree(selected.map(([id])=>id),s.selected.map(p=>p.id),`${k}/${s.method}/selection`)
  for(const p of s.selected)near(p.score,s.allScores[p.id])
  signalLookup.set(`${k}/${s.method}`,s)
 }
 const fresh=(snapshot,id,mode)=>{
  const row=snapshot.data.find(r=>String(r.id)===id);if(!row)return null
  const q=row.quote.USD,t=Date.parse(q.last_updated)
  return Number.isFinite(q.price)&&q.price>0&&Number.isFinite(t)&&Math.abs(t-snapshot.time)<=(mode==='daily'?HOUR:HOUR/4)?{price:q.price,time:t}:null
 }
 for(const r of data.records){
  const k=[r.mode,r.view,r.block,r.signal,r.method].join('/'),s=signalLookup.get(k),block=inputs.blocks[r.mode][r.block],decision=Date.parse(r.signal),ix=block.findIndex(b=>b.decision===decision)+1,unit=r.mode==='daily'?DAY:HOUR
  tree(s.selected.map(p=>p.id),r.positions.map(p=>p.id),`${k}/immutable selections`)
  assert.equal(r.entrySnapshot,iso(block[ix].time));assert.equal(r.exitSnapshot,iso(block[ix+r.holding].time));assert(block[ix].time>decision)
  for(const p of r.positions){
   positions++;const entry=fresh(block[ix],p.id,r.mode),exit=fresh(block[ix+r.holding],p.id,r.mode)
   const entered=entry!==null&&entry.time>decision,sold=entered&&exit!==null&&exit.time>entry.time
   assert.equal(p.entryMissing,!entered);assert.equal(p.exitMissing,entered&&!sold)
   const gross=sold?exit.price/entry.price-1:null;if(gross===null)assert.equal(p.gross,null);else{near(gross,p.gross);knownPrices++}
   const net=(bps,loss)=>!entered?0:(1+(gross??(loss?-1:0)))*(1-bps/10000)/(1+bps/10000)-1
   for(const m of MARKS){const bps=m==='net0'?0:m.includes('100')?100:50;near(net(bps,m.includes('Loss')),p[m],`${k}/${p.id}/${m}`)}
   let complete=entered,first=null;const gains=[]
   if(entered)for(let j=ix;j<=ix+r.holding;j++){
    const q=fresh(block[j],p.id,r.mode);pricePathChecks++
    if(!q||q.time<entry.time){complete=false;continue}
    const ret=q.price/entry.price-1;gains.push(ret)
    if(first===null&&ret>=.2-1e-12)first=(q.time-entry.time)/unit
   }
   const expected={hit:first!==null,unknownNoHit:!complete&&first===null,pathComplete:complete,timeTo20:first,mfe:complete?Math.max(...gains):null,mae:complete?Math.min(...gains):null}
   tree(expected,Object.fromEntries(Object.keys(expected).map(k=>[k,p[k]])),`${k}/${p.id}/labels`)
  }
  for(const m of MARKS)near(r.positions.reduce((sum,p)=>sum+p[m],0)/10,r[m])
 }
 const groups=new Map();for(const r of data.records){const k=[r.mode,r.view,r.holding].join('/');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
 const pairedLookup=new Map();let pairedChecks=0,halfChecks=0
 for(const p of summary.paired){
  const group=groups.get([p.mode,p.view,p.holding].join('/')),dates=[...new Set(group.map(r=>r.signal))].sort(),cut=Math.floor(dates.length/2),selected=p.period==='all'?dates:p.period==='earlier'?dates.slice(0,cut):dates.slice(cut)
  tree(selected,p.signals)
  const a=selected.map(s=>group.find(r=>r.signal===s&&r.method===p.candidate)),b=selected.map(s=>group.find(r=>r.signal===s&&r.method===p.baseline))
  tree(metrics(a),p.candidateMetrics);tree(metrics(b),p.baselineMetrics)
  for(const m of MARKS)tree(difference(a.map((r,i)=>r[m]-b[i][m])),p.differences[m])
  pairedLookup.set([p.mode,p.view,p.holding,p.candidate,p.baseline,p.period].join('/'),p);pairedChecks++
 }
 for(const h of summary.halves){
  const group=groups.get([h.mode,h.view,h.holding].join('/')),dates=[...new Set(group.map(r=>r.signal))].sort(),cut=Math.floor(dates.length/2),selected=h.period==='all'?dates:h.period==='earlier'?dates.slice(0,cut):dates.slice(cut)
  tree({...Object.fromEntries(['mode','view','holding','method','period'].map(k=>[k,h[k]])),...metrics(selected.map(s=>group.find(r=>r.signal===s&&r.method===h.method)))},h);halfChecks++
 }
 const gates=[]
 for(const g of summary.gates){
  const get=(view,baseline,period)=>pairedLookup.get([g.mode,view,g.holding,g.candidate,baseline,period].join('/'))
  const all=get(g.view,'classic','all'),n=all?.signals.length??0,enough=n>=6
  const comparisons=['classic','momentum'].map(baseline=>{
   const p=get(g.view,baseline,'later'),a=p?.differences.netLoss50,b=p?.differences.netLoss100
   return {baseline,laterSignals:p?.signals??[],primary:a??null,stress:b??null,passed:enough&&a.mean>0&&b.mean>0&&a.withoutBest>0&&b.withoutBest>0&&a.wins>a.n/2}
  })
  const supported=summary.views[g.mode].filter(v=>(get(v,'classic','all')?.signals.length??0)>=6)
  const viewRows=supported.map(view=>{const baselines=['classic','momentum'].map(baseline=>({baseline,mean50:get(view,baseline,'later').differences.netLoss50.mean,mean100:get(view,baseline,'later').differences.netLoss100.mean}));return {view,baselines,nonnegativeBoth:baselines.every(b=>b.mean50>=0)}})
  const nonnegativeBothViews=viewRows.filter(v=>v.nonnegativeBoth).length,medianStress=Object.fromEntries(['classic','momentum'].map(b=>[b,median(viewRows.map(v=>v.baselines.find(x=>x.baseline===b).mean100))]))
  const breadthPass=supported.length>0&&nonnegativeBothViews>supported.length/2&&Object.values(medianStress).every(x=>x!==null&&x>=0)
  const expected={mode:g.mode,candidate:g.candidate,view:g.view,holding:g.holding,totalSignals:n,minimumSignals:6,sufficientSupport:enough,comparisons,breadth:{supportedViews:supported,viewRows,nonnegativeBothViews,medianStress,passed:breadthPass},passed:enough&&comparisons.every(x=>x.passed)&&breadthPass}
  tree(expected,g);gates.push({mode:g.mode,candidate:g.candidate,passed:g.passed})
 }
 assert.equal(data.records.length,summary.recordCount);assert.equal(data.signals.length,summary.signalRecordCount)
 return {raw_files:rawFiles,unique_formations:formations.size,all_method_scores:scoreChecks,signals:data.signals.length,records:data.records.length,positions,known_raw_price_returns:knownPrices,path_snapshot_checks:pricePathChecks,paired_metric_cells:pairedChecks,half_metric_cells:halfChecks,gates}
}
function venueReplay(schedule,scenario,returns,got){
 let wealth=1,peak=1,drawdown=0;const annual={},checkpoints=[],rets=[]
 for(const d of schedule){if(d.status==='missing-formation')continue
  const r=returns(d,scenario);if(!d.filled)assert.equal(r,0)
  const date=d.filled?d.hard_exit_date:d.knowledge_date;wealth*=1+r;peak=Math.max(peak,wealth);drawdown=Math.min(drawdown,wealth/peak-1);annual[date.slice(0,4)]=(annual[date.slice(0,4)]??1)*(1+r)
  checkpoints.push({signal:d.signal,checkpoint_date:date,net_return:r,wealth,drawdown:wealth/peak-1});rets.push(r)
 }
 const best=rets.length?rets.indexOf(Math.max(...rets)):null
 const expected={terminal_wealth:wealth,exit_checkpoint_drawdown:drawdown,annual_exit_returns:Object.fromEntries(Object.entries(annual).map(([y,f])=>[y,f-1])),best_batch_signal:best===null?null:checkpoints[best].signal,best_batch_return:best===null?null:rets[best],without_best_batch_wealth:rets.reduce((w,r,i)=>i===best?w:w*(1+r),1),checkpoints}
 tree(expected,got,'venue replay')
}
function verifyVenue(){
 const summary=read(path.join(HERE,'venue-summary.json'));assert.equal(sha(path.join(HERE,'venue-ledger.json.gz')),summary.ledger_sha256);assert.equal(sha(path.join(HERE,'venue-capital.json.gz')),summary.capital_sha256)
 for(const [name,expected]of Object.entries(summary.hashes))assert.equal(sha(path.join(ROOT,name)),expected,name)
 const data=gzip(path.join(HERE,'venue-ledger.json.gz')),capital=gzip(path.join(HERE,'venue-capital.json.gz'))
 const panelPath=path.join(ROOT,'research/algorithm-comparison/high-flier-data/final/daily-panel.csv.gz');assert.equal(sha(panelPath),'91dfcdc1afac7a35087a1f9a56b1c75bbede3c504f81a85b4192ef6fe6f7340c')
 const lines=gunzipSync(fs.readFileSync(panelPath)).toString().trim().split('\n'),header=lines.shift().trim().split(','),ix=Object.fromEntries(header.map((h,i)=>[h,i])),prices=new Map()
 for(const line of lines){assert(!line.includes('"'),'Unexpected quoted panel field');const vs=line.trim().split(',');assert.equal(vs.length,header.length);prices.set(`${vs[ix.cohort_year]}:${vs[ix.identity_segment_id]}/${vs[ix.date]}`,{price:Number(vs[ix.close]),time:Date.parse(vs[ix.date]),open:Number(vs[ix.open]),high:Number(vs[ix.high]),low:Number(vs[ix.low]),status:vs[ix.bar_status]})}
 let rawCumulative=0,selectedChecks=0,cohortMarkChecks=0,capitalScenarios=0
 for(let i=0;i<data.formations.length;i++){
  const f=data.formations[i],pr=signedRanks(f.endpoint),cr=signedRanks(f.cumulative)
  for(const id of f.eligible)near((pr[id]+cr[id])/2,f.hybrid[id],'venue hybrid')
  for(const method of ['Cumulative','Hybrid']){
   const values=method==='Cumulative'?f.cumulative:f.hybrid
   const selected=Object.entries(values).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:a[0]>b[0]?1:0)).slice(0,10).map(([id])=>id)
   tree(selected,f.selected[method]);selectedChecks++
  }
  if(i%97===0||i===data.formations.length-1)for(const id of f.eligible){
   const end=Date.parse(f.signal),qs=Array.from({length:f.view},(_,j)=>prices.get(`${id}/${iso(end-(f.view-1-j)*DAY).slice(0,10)}`));assert(qs.every(q=>q&&q.status==='complete'))
   near(Math.log(qs.at(-1).price)-Math.log(qs[0].price),f.endpoint[id],'venue raw endpoint',2e-12)
   near(cumulative(qs,(f.view-1)*DAY),f.cumulative[id],'venue raw cumulative',2e-12);rawCumulative++
  }
 }
 const cohorts=new Map(data.cohorts.map(c=>[[c.signal,c.view,c.method].join('/'),c])),matched=new Map(data.matched_cohorts.map(c=>[[c.signal,c.view,c.method].join('/'),c]))
 for(const c of [...data.cohorts,...data.matched_cohorts])for(const s of VENUE_MARKS){near(c.outcome_ids.reduce((sum,key)=>sum+data.outcomes[key][s],0)/10,c[s]);cohortMarkChecks++}
 for(const p of capital.paths){
  const lookup=(d,s)=>cohorts.get([d.signal,p.view,p.method].join('/'))[s]
  for(const s of VENUE_MARKS){venueReplay(p.schedule,s,lookup,p.scenarios[s]);capitalScenarios++}
  if(p.matched_scenarios){const returns=(d,s)=>matched.get([d.signal,p.view,p.method].join('/'))[s];for(const s of VENUE_MARKS){venueReplay(p.schedule,s,returns,p.matched_scenarios[s]);capitalScenarios++}}
 }
 return {formations:data.formations.length,independent_raw_cumulative_checks:rawCumulative,all_new_selection_checks:selectedChecks,cohort_mark_checks:cohortMarkChecks,capital_paths:capital.paths.length,capital_scenarios:capitalScenarios}
}
function main(){
 const only=process.argv.includes('--cmc-only'),output=path.join(HERE,only?'cmc-verification.json':'verification-report.json');assert(!fs.existsSync(output),'Refusing overwrite')
 const started=iso(Date.now());const cmc=verifyCmc();console.log('CMC verification passed',JSON.stringify(cmc))
 const venue=only?null:verifyVenue();if(venue)console.log('Venue verification passed',JSON.stringify(venue))
 const names=['verification.cjs','cmc-summary.json','cmc-inputs.json.gz','cmc-results.json.gz','cmc-sources.json',...(!only?['venue-summary.json','venue-ledger.json.gz','venue-capital.json.gz']:[])]
 const result={status:'passed',started_utc:started,completed_utc:iso(Date.now()),hashes:Object.fromEntries(names.map(n=>[n,sha(path.join(HERE,n))])),cmc,venue,scope:'Independent stdlib implementation; no application/scoring/backtest code imported. Raw CMC block reconstruction, all native scoring/eligibility/selection, full trade labels/costs and adoption metrics; venue raw deterministic score sample, all new selection ordering and capital arithmetic. No new default claim beyond frozen CMC gates.'}
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'})
}
main()
