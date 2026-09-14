#!/usr/bin/env node
// Exact application replay; frozen protocol and independent verification are separate.
process.env.TZ='UTC'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const assert=require('node:assert/strict'),{gzipSync}=require('node:zlib'),ts=require('typescript')
const HERE=__dirname,ROOT=path.resolve(HERE,'../../..')
const HELPER=path.join(ROOT,'research/interval-algorithms/2026-09-13/run.cjs')
const helper=require(HELPER)
const HOUR=3600000,DAY=24*HOUR
const VIEWS={daily:[3,4,5,6,7,10,14,21,30,45,60,90],hourly:[3,6,9,12,18,24]}
const HOLDS={daily:[1,7,14,30,60,90,365],hourly:[1,3,6,12,24]}
const METHODS=['classic','momentum','trend-quality','cumulative','hybrid']
const MARKS=['net0','net50','net100','netLoss50','netLoss100']
const DEFAULTS={daily:{view:10,holding:7},hourly:{view:6,holding:3}}
const hash=x=>crypto.createHash('sha256').update(x).digest('hex')
const iso=t=>new Date(t).toISOString()
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null
const median=xs=>{if(!xs.length)return null;const ys=[...xs].sort((a,b)=>a-b);const i=Math.floor(ys.length/2);return ys.length%2?ys[i]:(ys[i-1]+ys[i])/2}
const sourceBytes=new Map()
function track(filename){const bytes=fs.readFileSync(filename,'utf8');sourceBytes.set(filename,bytes);return bytes}
for(const file of [__filename,HELPER,path.join(HERE,'cmc-protocol.md')])track(file)
require.extensions['.ts']=(module,filename)=>{
 assert(filename.startsWith(ROOT+path.sep));const source=track(filename)
 module._compile(ts.transpileModule(source,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,filename)
}
const current=require(path.join(ROOT,'modules/processRankings.ts'))
const {getRankingWindow}=require(path.join(ROOT,'modules/rankingWindow.ts'))
function scoreable(c){return c&&!c.insufficientHistory&&Number.isFinite(c.score)&&c.score>-10001}
function rowsInput(snaps,cutoff){return snaps.map(s=>({data:s.data.filter(r=>{const t=Date.parse(r.quote.USD.last_updated);return Number.isFinite(t)&&t<=cutoff})}))}
function loss100(p){return p.entryMissing?0:helper.net(p.gross??-1,100)}
function metrics(rs){
 const ps=rs.flatMap(r=>r.positions),known=ps.filter(p=>p.gross!==null)
 return {cohorts:rs.length,signalDates:rs.map(r=>r.signal),slots:rs.length*10,selected:ps.length,
  means:Object.fromEntries(MARKS.map(m=>[m,mean(rs.map(r=>r[m]))])),hits:ps.filter(p=>p.hit).length,
  unknownNoHit:ps.filter(p=>p.unknownNoHit).length,known:known.length,
  knownLosers:known.filter(p=>helper.net(p.gross,50)<0).length,
  realized20:known.filter(p=>helper.net(p.gross,50)>=.2).length,
  entryMissing:ps.filter(p=>p.entryMissing).length,exitMissing:ps.filter(p=>p.exitMissing).length}
}
function difference(xs){
 return {n:xs.length,mean:mean(xs),median:median(xs),wins:xs.filter(x=>x>0).length,losses:xs.filter(x=>x<0).length,ties:xs.filter(x=>x===0).length,
  withoutBest:xs.length>1?(xs.reduce((a,b)=>a+b,0)-Math.max(...xs))/(xs.length-1):null,
  minimum:xs.length?Math.min(...xs):null,maximum:xs.length?Math.max(...xs):null}
}
function analyze(records){
 const grouped=new Map()
 for(const r of records){const key=[r.mode,r.view,r.holding].join('/');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r)}
 const paired=[],halves=[]
 for(const [key,rs] of grouped){
  const signals=[...new Set(rs.map(r=>r.signal))].sort(),cut=Math.floor(signals.length/2)
  const subsets={all:signals,earlier:signals.slice(0,cut),later:signals.slice(cut)}
  const lookup=new Map(rs.map(r=>[[r.signal,r.method].join('/'),r]))
  for(const [period,dates] of Object.entries(subsets)){
   for(const method of METHODS)halves.push({mode:rs[0].mode,view:rs[0].view,holding:rs[0].holding,method,period,...metrics(dates.map(s=>lookup.get(s+'/'+method)))})
   for(const candidate of ['trend-quality','cumulative','hybrid'])for(const baseline of ['classic','momentum']){
    const a=dates.map(s=>lookup.get(s+'/'+candidate)),b=dates.map(s=>lookup.get(s+'/'+baseline))
    paired.push({mode:rs[0].mode,view:rs[0].view,holding:rs[0].holding,candidate,baseline,period,
     signals:dates,differences:Object.fromEntries(MARKS.map(m=>[m,difference(a.map((r,i)=>r[m]-b[i][m]))])),
     candidateMetrics:metrics(a),baselineMetrics:metrics(b)})
   }
  }
 }
 const gates=[]
 for(const [mode,def] of Object.entries(DEFAULTS))for(const candidate of ['cumulative','hybrid']){
  const cell=paired.filter(r=>r.mode===mode&&r.view===def.view&&r.holding===def.holding&&r.candidate===candidate)
  const all=cell.find(r=>r.period==='all'&&r.baseline==='classic')
  const enough=(all?.signals.length??0)>=6
  const comparisons=['classic','momentum'].map(baseline=>{
   const later=cell.find(r=>r.period==='later'&&r.baseline===baseline),primary=later?.differences.netLoss50,stress=later?.differences.netLoss100
   return {baseline,laterSignals:later?.signals??[],primary:primary??null,stress:stress??null,
    passed:enough&&primary.mean>0&&stress.mean>0&&primary.withoutBest>0&&stress.withoutBest>0&&primary.wins>primary.n/2}
  })
  const supported=VIEWS[mode].filter(view=>{
   const row=paired.find(r=>r.mode===mode&&r.view===view&&r.holding===def.holding&&r.candidate===candidate&&r.baseline==='classic'&&r.period==='all')
   return(row?.signals.length??0)>=6
  })
  const viewRows=supported.map(view=>{
   const bs=['classic','momentum'].map(baseline=>{
    const row=paired.find(r=>r.mode===mode&&r.view===view&&r.holding===def.holding&&r.candidate===candidate&&r.baseline===baseline&&r.period==='later')
    return {baseline,mean50:row.differences.netLoss50.mean,mean100:row.differences.netLoss100.mean}
   })
   return {view,baselines:bs,nonnegativeBoth:bs.every(r=>r.mean50>=0)}
  })
  const nonnegative=viewRows.filter(r=>r.nonnegativeBoth).length
  const medianStress=Object.fromEntries(['classic','momentum'].map(baseline=>[baseline,median(viewRows.map(r=>r.baselines.find(b=>b.baseline===baseline).mean100))]))
  const breadth=supported.length>0&&nonnegative>supported.length/2&&Object.values(medianStress).every(v=>v!==null&&v>=0)
  gates.push({mode,candidate,view:def.view,holding:def.holding,totalSignals:all?.signals.length??0,minimumSignals:6,sufficientSupport:enough,
   comparisons,breadth:{supportedViews:supported,viewRows,nonnegativeBothViews:nonnegative,medianStress,passed:breadth},
   passed:enough&&comparisons.every(c=>c.passed)&&breadth})
 }
 return {halves,paired,gates}
}
function selftest(){
 helper.selftest()
 assert.equal(loss100({entryMissing:true,gross:null}),0)
 assert.equal(loss100({entryMissing:false,gross:null}),-1)
 assert(Math.abs(loss100({entryMissing:false,gross:.1})-(1.1*.99/1.01-1))<1e-14)
 assert.deepEqual(difference([1,2,-1]),{n:3,mean:2/3,median:1,wins:2,losses:1,ties:0,withoutBest:0,minimum:-1,maximum:2})
 assert.equal(median([4,1,2,3]),2.5)
 assert.equal(difference([]).mean,null)
}
async function main(){
 selftest()
 if(process.argv.includes('--selftest')){console.log('CMC cumulative runner selftests passed');return}
 const outputs=['cmc-inputs.json.gz','cmc-results.json.gz','cmc-summary.json','cmc-sources.json']
 for(const filename of outputs)assert(!fs.existsSync(path.join(HERE,filename)),`Refusing overwrite ${filename}`)
 const startedAt=iso(Date.now()),{blocks,manifest}=helper.load()
 const normalized=Object.fromEntries(Object.entries(blocks).map(([mode,bs])=>[mode,bs.map(b=>b.map(({byId,...s})=>s))]))
 const inputBytes=gzipSync(JSON.stringify({capturedAt:startedAt,manifest,blocks:normalized})+'\n',{mtime:0})
 fs.writeFileSync(path.join(HERE,'cmc-inputs.json.gz'),inputBytes,{flag:'wx'})
 const records=[],signals=[],feasibility=[];let warnings=0,eligibilityChecks=0,slotChecks=0
 for(const mode of ['daily','hourly']){
  const unit=mode==='daily'?DAY:HOUR,step=mode==='daily'?7:1
  for(const view of VIEWS[mode]){
   const support=Object.fromEntries(HOLDS[mode].map(h=>[h,0]))
   for(const [bi,block] of blocks[mode].entries()){
    const previous=new Map()
    for(let index=view-1;index+2<block.length;index+=step){
     const holds=HOLDS[mode].filter(h=>index+1+h<block.length)
     if(!holds.length)continue
     const decision=block[index].decision,fetched=block.slice(Math.max(0,index-(mode==='daily'?90:25)+1),index+1)
     const window=getRankingWindow(mode,view,new Date(decision)),start=window.startDate.getTime(),end=window.endDate.getTime()
     assert.equal(end,decision)
     const input=rowsInput(fetched,decision),results={}
     for(const algorithm of METHODS){
      const warn=console.warn;console.warn=()=>warnings++
      try{results[algorithm]=await current.processRankings(input.map(x=>({data:[...x.data]})),new Date(start),new Set(),{algorithm,endDate:new Date(end),intervalMs:unit})}
      finally{console.warn=warn}
     }
     const common=Object.values(results.classic.cryptosById).filter(scoreable).map(c=>c.id).sort()
     for(const method of METHODS){
      const eligible=Object.values(results[method].cryptosById).filter(scoreable).map(c=>c.id).sort()
      assert.deepEqual(eligible,common,'Method eligibility differs from current Classic');eligibilityChecks++
      const selected=results[method].cryptosSortedByScore.filter(scoreable).slice(0,10).map(c=>({id:c.id,symbol:c.symbol,score:c.score}))
      const ids=selected.map(p=>p.id),prior=previous.get(method),shared=prior?ids.filter(id=>prior.has(id)).length:0
      const replacement=prior?(ids.length+prior.size-2*shared)/20:null
      previous.set(method,new Set(ids))
      signals.push({mode,view,method,block:bi,signal:iso(decision),start:iso(start),end:iso(end),eligibleIds:eligible,
       allScores:Object.fromEntries(Object.values(results[method].cryptosById).filter(scoreable).map(c=>[c.id,c.score])),selected})
      for(const holding of holds){
       const positions=selected.map(p=>{const v=helper.grade(p,block,index+1,holding,decision,mode);return {...v,netLoss100:loss100(v)}})
       const record={comparison:'native',mode,view,holding,method,block:bi,signal:iso(decision),entrySnapshot:iso(block[index+1].time),exitSnapshot:iso(block[index+1+holding].time),replacement,positions}
       for(const mark of MARKS)record[mark]=positions.reduce((sum,p)=>sum+p[mark],0)/10
       assert(positions.length<=10&&new Set(positions.map(p=>p.id)).size===positions.length)
       for(const mark of MARKS){assert(Number.isFinite(record[mark]));slotChecks++}
       records.push(record)
      }
     }
     for(const h of holds)support[h]++
    }
   }
   for(const h of HOLDS[mode])feasibility.push({mode,view,holding:h,signalDates:support[h],status:support[h]?'retrospective diagnostic':'insufficient contiguous formation and mature outcomes'})
   console.log(mode,view,'completed',JSON.stringify(support))
  }
 }
 const analysis=analyze(records)
 for(const [filename,source]of sourceBytes)assert.equal(fs.readFileSync(filename,'utf8'),source,`Source changed during execution: ${filename}`)
 const sources=Object.fromEntries([...sourceBytes].map(([filename,source])=>[path.relative(ROOT,filename),{sha256:hash(source),source}]))
 const sourceArtifact=JSON.stringify({capturedAt:startedAt,sources},null,2)+'\n'
 fs.writeFileSync(path.join(HERE,'cmc-sources.json'),sourceArtifact,{flag:'wx'})
 const bytes=gzipSync(JSON.stringify({records,signals})+'\n',{mtime:0})
 fs.writeFileSync(path.join(HERE,'cmc-results.json.gz'),bytes,{flag:'wx'})
 const summary={status:'exact-CMC retrospective cumulative/hybrid default diagnostic',startedAt,completedAt:iso(Date.now()),node:process.version,
  hashes:{runner:hash(sourceBytes.get(__filename)),protocol:hash(sourceBytes.get(path.join(HERE,'cmc-protocol.md'))),helper:hash(sourceBytes.get(HELPER)),
   sources:Object.fromEntries(Object.entries(sources).map(([name,v])=>[name,v.sha256])),inputs:hash(inputBytes),sourceArtifact:hash(sourceArtifact),ledger:hash(bytes)},
  manifest,dataBlocks:Object.fromEntries(Object.entries(blocks).map(([mode,bs])=>[mode,bs.map(b=>({start:iso(b[0].time),end:iso(b.at(-1).time),observations:b.length}))])),
  methods:METHODS,views:VIEWS,holds:HOLDS,defaults:DEFAULTS,feasibility,recordCount:records.length,signalRecordCount:signals.length,
  selftests:'passed',eligibilityChecks,slotChecks,warnings,summary:helper.summarize(records),...analysis}
 fs.writeFileSync(path.join(HERE,'cmc-summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'})
 console.log(JSON.stringify({records:records.length,signals:signals.length,eligibilityChecks,slotChecks,gates:analysis.gates.map(g=>({mode:g.mode,candidate:g.candidate,passed:g.passed}))}))
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1})
module.exports={analyze,difference,metrics}
