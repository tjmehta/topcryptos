#!/usr/bin/env node
// Offline exact-module experiment. See protocol.md before interpreting results.
process.env.TZ = 'UTC'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { gzipSync } = require('node:zlib')
const ts = require('typescript')
const HERE = __dirname, ROOT = path.resolve(HERE, '../../..')
const HOUR = 3600000, DAY = 24 * HOUR
const VIEWS = { daily: [3,4,5,6,7,10,14,21,30,45,60,90], hourly: [3,6,9,12,18,24] }
const HOLDS = { daily: [1,7,14,30,60,90,365], hourly: [1,3,6,12,24] }
const METHODS = ['before-classic', 'classic', 'momentum', 'trend-quality']
const hash = x => crypto.createHash('sha256').update(x).digest('hex')
const iso = t => new Date(t).toISOString()
const mean = a => a.length ? a.reduce((s,x) => s+x,0)/a.length : null
const quantile = (a,p) => { if (!a.length) return null; const s=[...a].sort((x,y)=>x-y); return s[Math.floor((s.length-1)*p)] }
const net = (gross,bps=50) => (1+gross)*(1-bps/10000)/(1+bps/10000)-1
const sources = {}, sourceBytes = new Map()
let warnings = 0
require.extensions['.ts'] = (module, filename) => {
  assert(filename.startsWith(ROOT + path.sep))
  const source = fs.readFileSync(filename, 'utf8')
  sources[path.relative(ROOT,filename)] = hash(source)
  sourceBytes.set(filename, source)
  module._compile(ts.transpileModule(source, { fileName: filename,
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true} }).outputText, filename)
}
const old = require('./baseline/modules/processRankings.ts')
function idOrder(a,b) { return Number(a)-Number(b) || String(a).localeCompare(String(b)) }
function scoreable(c) { return !c.insufficientHistory && Number.isFinite(c.score) && c.score > -10001 }
function rowsInput(snaps, cutoff, dedup=false, start=-Infinity) {
  const seen = new Set()
  return snaps.map(s => ({data:s.data.filter(r => {
    const t=Date.parse(r.quote.USD.last_updated)
    if (!Number.isFinite(t) || t>cutoff || t<start) return false
    if (!dedup) return true
    const key=r.quote.USD.last_updated.split(':')[0]+':'+r.id
    if(seen.has(key)) return false
    seen.add(key); return true
  })}))
}
async function score(fn, input, start, disabled, options) {
  const warn=console.warn; console.warn=()=>warnings++
  try { return await fn(input.map(x=>({data:[...x.data]})), new Date(start), disabled, options) }
  finally { console.warn=warn }
}
function select(result, allowed) {
  return Object.values(result.cryptosById).filter(c=>c && scoreable(c) && (!allowed || allowed.has(c.id)))
    .sort((a,b)=>b.score-a.score || idOrder(a.id,b.id)).slice(0,10)
    .map(c=>({id:c.id,symbol:c.symbol,score:c.score}))
}
function load() {
  const dir=path.join(ROOT,'.cache/coinmarketcap'), snaps=[], manifest=[]
  for(const name of fs.readdirSync(dir).sort()) {
    if(!name.startsWith('cryptocurrency_listings:') || !name.endsWith('.json')) continue
    const bytes=fs.readFileSync(path.join(dir,name)), raw=JSON.parse(bytes)
    const counts=new Map()
    for(const r of raw.data) { const t=Date.parse(r.quote?.USD?.last_updated); if(Number.isFinite(t)) counts.set(t,(counts.get(t)||0)+1) }
    const modal=[...counts].sort((a,b)=>b[1]-a[1] || a[0]-b[0])[0]
    assert(modal)
    if(new Date(modal[0]).getUTCFullYear()!==2026) continue
    const data=raw.data.slice(0,500).filter(r=>r.quote.USD.market_cap>1e7)
    assert(new Set(data.map(r=>r.id)).size===data.length)
    const time=modal[0], nearby=data.map(r=>Date.parse(r.quote.USD.last_updated)).filter(t=>Number.isFinite(t)&&Math.abs(t-time)<=HOUR)
    const decision=Math.max(time,...nearby)
    snaps.push({name,time,decision,data,byId:new Map(data.map(r=>[String(r.id),r]))})
    manifest.push({name,sha256:hash(bytes),bytes:bytes.length,modal:iso(time),decision:iso(decision),rows:data.length})
  }
  const blocks={}
  for(const mode of ['daily','hourly']) {
    const unit=mode==='daily'?DAY:HOUR, slots=new Map()
    for(const s of snaps) {
      const slot=mode==='daily'?Math.floor(s.time/DAY):Math.round(s.time/HOUR)
      const target=slot*unit+(mode==='daily'?23*HOUR:0), distance=Math.abs(s.time-target)
      if(distance>HOUR/2) continue
      const previous=slots.get(slot)
      if(!previous || distance<previous.distance || (distance===previous.distance && (s.time<previous.s.time || (s.time===previous.s.time && s.name<previous.s.name)))) slots.set(slot,{slot,s,distance})
    }
    const bs=[]
    for(const v of [...slots.values()].sort((a,b)=>a.slot-b.slot)) {
      if(!bs.length || v.slot!==bs.at(-1).at(-1).slot+1) bs.push([])
      bs.at(-1).push({...v.s,slot:v.slot})
    }
    blocks[mode]=bs.filter(b=>b.length>=3)
  }
  return {blocks,manifest}
}
function fresh(row,snap,mode) {
  if(!row) return false
  const q=row.quote.USD,t=Date.parse(q.last_updated)
  return Number.isFinite(q.price)&&q.price>0&&Number.isFinite(t)&&Math.abs(t-snap.time)<=(mode==='daily'?HOUR:HOUR/4)
}
function grade(selection, block, entryIndex, holding, decision, mode) {
  const entry=block[entryIndex],exit=block[entryIndex+holding]
  const a=entry.byId.get(selection.id),b=exit.byId.get(selection.id)
  const entryOK=fresh(a,entry,mode)&&Date.parse(a.quote.USD.last_updated)>decision
  if(!entryOK) return {...selection,entryMissing:true,exitMissing:false,gross:null,net0:0,net50:0,net100:0,netLoss50:0,hit:false,unknownNoHit:true,pathComplete:false,timeTo20:null,mfe:null,mae:null}
  const entryTime=Date.parse(a.quote.USD.last_updated), price=a.quote.USD.price
  const exitOK=fresh(b,exit,mode)&&Date.parse(b.quote.USD.last_updated)>entryTime
  const gross=exitOK?b.quote.USD.price/price-1:null
  let complete=true,first=null,returns=[]
  for(let i=entryIndex;i<=entryIndex+holding;i++) {
    const s=block[i],r=s.byId.get(selection.id)
    if(!fresh(r,s,mode) || Date.parse(r.quote.USD.last_updated)<entryTime) { complete=false; continue }
    const ret=r.quote.USD.price/price-1
    returns.push(ret)
    if(first===null&&ret>=0.2-1e-12) first=(Date.parse(r.quote.USD.last_updated)-entryTime)/(mode==='daily'?DAY:HOUR)
  }
  const hit=first!==null
  return {...selection,entryMissing:false,exitMissing:!exitOK,gross,
    net0:net(gross??0,0),net50:net(gross??0,50),net100:net(gross??0,100),netLoss50:net(gross??-1,50),
    hit,unknownNoHit:!complete&&!hit,pathComplete:complete,timeTo20:first,
    mfe:complete?Math.max(...returns):null,mae:complete?Math.min(...returns):null}
}
function selftest() {
  const row=(id,price,hour)=>({id,quote:{USD:{price,last_updated:iso(hour*HOUR)}}})
  const snap=(hour,rows)=>({time:hour*HOUR,byId:new Map(rows.map(r=>[String(r.id),r]))})
  const b=[snap(0,[row('x',999,0)]),snap(1,[row('x',100,1)]),snap(2,[row('x',150,2)]),snap(3,[]),snap(4,[row('x',110,4)])]
  const a=grade({id:'x'},b,1,3,0,'hourly')
  assert(a.hit&&!a.unknownNoHit&&!a.pathComplete); assert(Math.abs(a.net50-net(.1))<1e-12); assert.equal(a.timeTo20,1)
  assert(a.net50<.1) // Never fill at observed future high.
  const missing=grade({id:'y'},b,1,3,0,'hourly');assert(missing.entryMissing&&missing.netLoss50===0)
  const missingExit=grade({id:'x'},b,1,2,0,'hourly');assert(missingExit.exitMissing&&missingExit.netLoss50===-1)
  assert(grade({id:'x'},b,1,3,HOUR,'hourly').entryMissing) // Entry must follow decision.
  assert.equal(net(-1),-1);assert.equal(rowsInput([{data:[row('x',1,5)]}],4*HOUR).length,1)
  assert.equal(rowsInput([{data:[row('x',1,5)]}],4*HOUR)[0].data.length,0)
}
function summarize(records) {
  const groups=new Map()
  for(const r of records) { const key=[r.comparison,r.mode,r.view,r.holding,r.method].join('/');if(!groups.has(key)) groups.set(key,[]);groups.get(key).push(r) }
  return [...groups].map(([key,rs])=>{
    const ps=rs.flatMap(r=>r.positions), known=ps.filter(p=>p.gross!==null).map(p=>net(p.gross)), hits=ps.filter(p=>p.hit),unknown=ps.filter(p=>p.unknownNoHit)
    const counts={};for(const p of ps) counts[p.id]=(counts[p.id]||0)+1
    return {key,...Object.fromEntries(['comparison','mode','view','holding','method'].map(k=>[k,rs[0][k]])),
      cohorts:rs.length,signalStart:rs[0].signal,signalEnd:rs.at(-1).signal,slots:rs.length*10,selected:ps.length,
      hits:hits.length,unknownNoHit:unknown.length,hitRateLower:hits.length/(rs.length*10),hitRateUpper:(hits.length+unknown.length)/(rs.length*10),
      precisionLower:ps.length?hits.length/ps.length:null,precisionUpper:ps.length?(hits.length+unknown.length)/ps.length:null,
      entryMissing:ps.filter(p=>p.entryMissing).length,exitMissing:ps.filter(p=>p.exitMissing).length,
      meanGross:mean(rs.map(r=>r.net0)),meanNet50:mean(rs.map(r=>r.net50)),meanNet100:mean(rs.map(r=>r.net100)),meanNetLoss50:mean(rs.map(r=>r.netLoss50)),
      medianKnownNet:quantile(known,.5),p10KnownNet:quantile(known,.1),lossRateKnown:known.length?known.filter(x=>x<0).length/known.length:null,
      medianTimeTo20:quantile(hits.map(p=>p.timeTo20),.5),meanMFE:mean(ps.filter(p=>p.mfe!==null).map(p=>p.mfe)),meanMAE:mean(ps.filter(p=>p.mae!==null).map(p=>p.mae)),
      meanReplacement:mean(rs.map(r=>r.replacement).filter(x=>x!==null)),topSelections:Object.entries(counts).sort((a,b)=>b[1]-a[1]||idOrder(a[0],b[0])).slice(0,10)}
  })
}
async function main() {
  if(process.argv.includes('--selftest')) {selftest();console.log('Selftests passed');return}
  for(const name of ['results.json.gz','summary.json']) assert(!fs.existsSync(path.join(HERE,name)),`Refusing overwrite ${name}`)
  const startedAt=iso(Date.now())
  selftest()
  const current=require(path.join(ROOT,'modules/processRankings.ts'))
  const {getRankingWindow}=require(path.join(ROOT,'modules/rankingWindow.ts'))
  const baseline=JSON.parse(fs.readFileSync(path.join(HERE,'baseline.json'),'utf8'))
  for(const [name,expected] of Object.entries(baseline.sha256)) assert.equal(hash(fs.readFileSync(path.join(HERE,'baseline/modules',name))),expected)
  const {blocks,manifest}=load(),records=[],feasibility=[],signalLedgers=[]
  for(const mode of ['daily','hourly']) {
    const unit=mode==='daily'?DAY:HOUR,step=mode==='daily'?7:1
    for(const view of VIEWS[mode]) {
      const support=Object.fromEntries(HOLDS[mode].map(h=>[h,0]))
      for(const [bi,block] of blocks[mode].entries()) {
        const previous=new Map()
        for(let index=view-1;index+2<block.length;index+=step) {
          const holds=HOLDS[mode].filter(h=>index+1+h<block.length)
          if(!holds.length) continue
          const decision=block[index].decision, fetched=block.slice(Math.max(0,index-(mode==='daily'?90:25)+1),index+1)
          const window=getRankingWindow(mode,view,new Date(decision))
          const start=window.startDate.getTime(),end=window.endDate.getTime()
          assert.equal(end,decision)
          const options={endDate:new Date(end),intervalMs:unit}
          const input=rowsInput(fetched,decision),beforeInput=rowsInput(fetched,decision,true)
          const native={}
          native['before-classic']=await score(old.processRankings,beforeInput,decision-(view-1)*unit,new Set())
          for(const algorithm of METHODS.slice(1)) native[algorithm]=await score(current.processRankings,input,start,new Set(),{...options,algorithm})
          const exactInput=rowsInput(block.slice(index-view+1,index+1),decision,false,start)
          const preliminary={}
          for(const algorithm of METHODS) preliminary[algorithm]=await score(algorithm==='before-classic'?old.processRankings:current.processRankings,exactInput,start,new Set(),algorithm==='before-classic'?undefined:{...options,algorithm})
          const allowed=new Set(Object.keys(preliminary.classic.cryptosById).filter(id=>METHODS.every(m=>preliminary[m].cryptosById[id]&&scoreable(preliminary[m].cryptosById[id]))))
          const allIds=new Set(exactInput.flatMap(s=>s.data.map(r=>String(r.id))))
          const disabled=new Set([...allIds].filter(id=>!allowed.has(id))),common={}
          for(const algorithm of METHODS) common[algorithm]=await score(algorithm==='before-classic'?old.processRankings:current.processRankings,exactInput,start,disabled,algorithm==='before-classic'?undefined:{...options,algorithm})
          assert([...allowed].every(id=>METHODS.every(m=>common[m].cryptosById[id]&&scoreable(common[m].cryptosById[id]))),'Common eligibility changed on rerun')
          for(const [comparison,results] of [['native',native],['common',common]]) for(const method of METHODS) {
            const selected=select(results[method],comparison==='common'?allowed:undefined)
            const ids=selected.map(p=>p.id),prior=previous.get(comparison+'/'+method)
            const shared=prior?ids.filter(id=>prior.has(id)).length:0
            const replacement=prior?(ids.length+prior.size-2*shared)/20:null
            previous.set(comparison+'/'+method,new Set(ids))
            signalLedgers.push({comparison,mode,view,method,signal:iso(decision),start:iso(start),commonEligible:allowed.size,selected,block:bi})
            for(const holding of holds) {
              const positions=selected.map(p=>grade(p,block,index+1,holding,decision,mode))
              const r={comparison,mode,view,holding,method,block:bi,signal:iso(decision),entrySnapshot:iso(block[index+1].time),exitSnapshot:iso(block[index+1+holding].time),replacement,positions}
              for(const key of ['net0','net50','net100','netLoss50']) r[key]=positions.reduce((s,p)=>s+p[key],0)/10
              records.push(r)
            }
          }
          for(const h of holds) support[h]++
        }
      }
      for(const h of HOLDS[mode]) feasibility.push({mode,view,holding:h,signalDates:support[h],status:support[h]?'exploratory':'insufficient contiguous formation and mature outcome history'})
      console.log(mode,view,'completed',JSON.stringify(support))
    }
  }
  for(const [filename,bytes] of sourceBytes) assert.equal(fs.readFileSync(filename,'utf8'),bytes,`Source changed during run: ${filename}`)
  const ledger={records,signals:signalLedgers},bytes=gzipSync(JSON.stringify(ledger)+'\n',{mtime:0})
  const summary={status:'exploratory exact-code replay; no winner/hold selector',startedAt,completedAt:iso(Date.now()),node:process.version,
    hashes:{runner:hash(fs.readFileSync(__filename)),protocol:hash(fs.readFileSync(path.join(HERE,'protocol.md'))),sources,ledger:hash(bytes)},baseline,manifest,
    dataBlocks:Object.fromEntries(Object.entries(blocks).map(([mode,bs])=>[mode,bs.map(b=>({start:iso(b[0].time),end:iso(b.at(-1).time),observations:b.length}))])),
    selftest:'passed',warnings,feasibility,recordCount:records.length,signalRecordCount:signalLedgers.length,summary:summarize(records)}
  fs.writeFileSync(path.join(HERE,'results.json.gz'),bytes,{flag:'wx'})
  fs.writeFileSync(path.join(HERE,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'})
  console.log('Saved',records.length,'cohort records and',signalLedgers.length,'signal records')
}
if(require.main===module) main().catch(e=>{console.error(e);process.exitCode=1})
module.exports={grade,net,selftest,summarize,load}
