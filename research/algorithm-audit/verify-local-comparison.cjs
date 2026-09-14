// READ-ONLY verification; never imports/executes the comparison runner.
// Run: node research/algorithm-audit/verify-local-comparison.cjs
process.env.TZ = 'UTC'
const fs = require('node:fs')
const path = require('node:path')
const { gunzipSync } = require('node:zlib')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const dir = path.join(root, 'research/algorithm-comparison')
const read = file => fs.readFileSync(file)
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const result = JSON.parse(gunzipSync(read(path.join(dir, 'local-cache-2020-2026-results.json.gz'))))
const summary = JSON.parse(read(path.join(dir, 'local-cache-2020-2026-summary.json')))
const inv = JSON.parse(read(path.join(dir, 'local-cache-2020-2026-inventory.json')))
const methods = ['Classic', 'Return', 'TrendQuality', 'VolAdjusted']
const DAY = 86400000
const avg = values => values.reduce((s, v) => s + v, 0) / values.length
const near = (a, b, label) => assert(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)), `${label}: ${a} != ${b}`)
const byName = new Map(inv.manifest.map(m => [path.basename(m.path), m]))
const loaded = new Map()
function snapshot(name) {
  if (!loaded.has(name)) {
    const m = byName.get(name), data = JSON.parse(read(path.join(root, m.path))).data
    loaded.set(name, { data, time: Date.parse(m.modalQuoteTime), byId: new Map(data.map(r => [String(r.id), r])) })
  }
  return loaded.get(name)
}
function valid(row, snap) {
  const q = row?.quote?.USD
  return !!q && Number.isFinite(q.price) && q.price > 0 && Number.isFinite(Date.parse(q.last_updated)) && Math.abs(Date.parse(q.last_updated) - snap.time) <= 3600000
}
function fullHistory(id, window) {
  let prev = -Infinity
  return window.every(s => {
    const r = s.byId.get(id), t = Date.parse(r?.quote?.USD?.last_updated)
    const ok = valid(r, s) && Number.isFinite(r.quote.USD.market_cap) && r.quote.USD.market_cap > 0 && t > prev
    prev = t
    return ok
  })
}
function formulas(rows) {
  const p = rows.map(r => r.quote.USD.price), logs = p.map(Math.log)
  const t0 = Date.parse(rows[0].quote.USD.last_updated)
  const xs = rows.map(r => (Date.parse(r.quote.USD.last_updated) - t0) / DAY)
  const mx = avg(xs), my = avg(logs)
  let xx = 0, yy = 0, xy = 0
  for (let i = 0; i < xs.length; i++) { xx += (xs[i] - mx) ** 2; yy += (logs[i] - my) ** 2; xy += (xs[i] - mx) * (logs[i] - my) }
  const differences = logs.slice(1).map((v, i) => v - logs[i]), md = avg(differences)
  const sd = Math.sqrt(differences.reduce((s, v) => s + (v - md) ** 2, 0) / (differences.length - 1))
  return { Return: p.at(-1) / p[0] - 1, TrendQuality: xy / xx * (yy > 0 ? Math.min(1, xy ** 2 / (xx * yy)) : 0), VolAdjusted: sd > 0 ? Math.log(p.at(-1) / p[0]) / (sd * Math.sqrt(p.length - 1)) : 0 }
}
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(read(file).toString(), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file)
const { processRankings, NAN_SCORE } = require(path.join(root, 'modules/processRankings.ts'))
async function main() {
  const runnerProvenance = { current: hash(read(path.join(dir, 'run-local-cache.cjs'))), saved: result.runnerSha256 }
  runnerProvenance.matches = runnerProvenance.current === runnerProvenance.saved
  if (!runnerProvenance.matches) console.warn('FAIL runner hash mismatch; continuing independent numerical checks', runnerProvenance)
  assert.equal(hash(read(path.join(dir, 'local-cache-predeclared-protocol.md'))), result.protocolSha256)
  for (const [file, digest] of Object.entries(result.sourceHashes)) assert.equal(hash(read(path.join(root, file))), digest)
  for (const m of inv.manifest) assert.equal(hash(read(path.join(root, m.path))), m.sha256, m.path)
  assert.equal(hash(inv.manifest.map(m => `${m.path}\t${m.sha256}`).join('\n')), result.inputFingerprint)
  assert.equal(result.inputFingerprint, inv.inputFingerprint)
  assert.equal(summary.decisionCount, result.decisions.length)
  assert.equal(summary.decisionsSha256, hash(JSON.stringify(result.decisions)))
  assert.deepEqual(summary.summaries, result.summaries)
  const groups = new Map(), latest = new Map(), phases = new Map()
  let constituents = 0, forwardNull = 0, futureDecisionQuotes = 0, futureTopQuotes = 0
  const futureDecisions = new Set(), badPageUses = [], earliestLatest = []
  for (const d of result.decisions) {
    const key = `${d.era}|${d.lookback}/${d.forward}|${d.phase}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(d)
    const window = d.sourceFiles.map(snapshot), start = window.at(-1), end = snapshot(d.forwardSourceFile)
    assert.equal(window.length, d.lookback + 1)
    assert.equal(start.time, Date.parse(d.decision)); assert.equal(end.time, Date.parse(d.forwardEndpoint))
    near((end.time - start.time) / DAY, d.elapsedGridDays, 'grid')
    assert.equal(new Set(d.holdings.map(h => h.id)).size, d.holdings.length)
    assert.equal(d.holdings.length, d.eligibility.sharedFullHistory)
    // Dataset has no additional native-gate exclusions from full history; verify rather than assume.
    const full = [...start.byId.keys()].filter(id => fullHistory(id, window)).sort()
    assert.deepEqual(d.holdings.map(h => h.id).sort(), full)
    const tops = new Set(methods.flatMap(m => d.portfolios[m].ids))
    for (const h of d.holdings) {
      constituents++
      const a = start.byId.get(h.id), b = end.byId.get(h.id)
      const expected = valid(a, start) && valid(b, end) ? b.quote.USD.price / a.quote.USD.price - 1 : null
      if (expected === null) { forwardNull++; assert.equal(h.return, null) } else {
        near(h.return, expected, 'constituent return')
        near(h.elapsedDays, (Date.parse(b.quote.USD.last_updated) - Date.parse(a.quote.USD.last_updated)) / DAY, 'quote horizon')
      }
      const alt = formulas(window.map(s => s.byId.get(h.id)))
      for (const m of methods.slice(1)) near(h.scores[m], alt[m], m)
      if (Date.parse(a.quote.USD.last_updated) > start.time) { futureDecisionQuotes++; futureDecisions.add(`${key}:${d.decision}`); if (tops.has(h.id)) futureTopQuotes++ }
    }
    const holdings = new Map(d.holdings.map(h => [h.id, h]))
    for (const m of [...methods, 'Universe']) {
      const b = d.portfolios[m], hs = m === 'Universe' ? d.holdings : b.ids.map(id => holdings.get(id))
      assert(hs.every(Boolean)); assert.equal(hs.length, b.n)
      const known = hs.filter(h => h.return !== null), sum = known.reduce((v, h) => v + h.return, 0)
      assert.equal(b.known, known.length); assert.equal(b.missing, hs.length - known.length)
      near(b.missingZeroReturn, sum / hs.length, 'missing zero')
      near(b.missingTotalLossReturn, (sum - b.missing) / hs.length, 'missing loss')
      if (b.missing) assert.equal(b.completeReturn, null); else near(b.completeReturn, sum / hs.length, 'complete')
      if (known.length) near(b.observedOnlyMean, sum / known.length, 'conditional')
      if (m !== 'Universe') {
        const order = d.holdings.slice().sort((a, b) => b.scores[m] - a.scores[m] || (m === 'Classic' ? Number(b.id) - Number(a.id) : Number(a.id) - Number(b.id)))
        assert.deepEqual(b.ids, order.slice(0, 10).map(h => h.id), `top sort ${key} ${m}`)
      }
    }
    const group = `${d.era}|${d.lookback}/${d.forward}`
    if (latest.has(group)) assert(Date.parse(latest.get(group).forwardEndpoint) <= start.time)
    latest.set(group, d)
    if (!phases.has(group)) phases.set(group, { exploratory: [], holdout: [] })
    phases.get(group)[d.phase].push(d)
    const block = inv.dailyBlocks.find(b => b.start.slice(0, 10) + '_' + b.end.slice(0, 10) === d.era)
    if (d.phase === 'holdout') assert(start.time >= Date.parse(block.holdoutStart))
    else assert(end.time < Date.parse(block.holdoutStart))
    if (d.sourceFiles.concat(d.forwardSourceFile).some(f => byName.get(f).cmcRankRange.min > 500)) badPageUses.push({ decision: d.decision, pair: `${d.lookback}/${d.forward}`, missing: d.portfolios.Universe.missing, total: d.portfolios.Universe.n })
  }
  for (const [group, ps] of phases) if (ps.exploratory.length && ps.holdout.length) {
    const last = Math.max(...ps.exploratory.map(d => Date.parse(d.forwardEndpoint)))
    const first = Math.min(...ps.holdout.map(d => Date.parse(d.decision)))
    assert(last < first)
    earliestLatest.push({ group, exploratoryLastOutcome: new Date(last).toISOString(), firstHoldoutDecision: new Date(first).toISOString() })
  }
  for (const s of result.summaries) {
    const ds = groups.get(s.group)
    assert.equal(s.decisions, ds.length)
    for (const m of [...methods, 'Universe']) {
      const gross = avg(ds.map(d => d.portfolios[m].missingZeroReturn)), v = s.portfolios[m]
      near(v.meanMissingZero, gross, 'summary gross')
      near(v.meanMissingTotalLoss, avg(ds.map(d => d.portfolios[m].missingTotalLossReturn)), 'summary loss')
      assert.equal(v.missingEndpoints, ds.reduce((n, d) => n + d.portfolios[m].missing, 0))
      near(v.meanExcessUniverseMissingZero, avg(ds.map(d => d.portfolios[m].missingZeroReturn - d.portfolios.Universe.missingZeroReturn)), 'universe excess')
      const btc = ds.filter(d => d.btc.return !== null)
      near(v.meanExcessBTCMissingZero, avg(btc.map(d => d.portfolios[m].missingZeroReturn - d.btc.return)), 'btc excess')
      if (m !== 'Universe') for (const bps of [10, 50, 100]) near(v.costScenarioPerSideBps[bps], gross - 2 * bps / 10000, 'cost convention')
    }
  }
  // Actual scorer parity for first and last decision in each era/pair/phase group.
  const sample = [...new Set([...groups.values()].flatMap(ds => [ds[0], ds.at(-1)]))]
  const oldWarn = console.warn
  console.warn = () => {}
  try {
    for (const d of sample) {
      const window = d.sourceFiles.map(snapshot), ids = new Set(d.holdings.map(h => h.id))
      const disabled = new Set(window.flatMap(s => s.data.map(r => String(r.id))).filter(id => !ids.has(id)))
      const raw = window.map(s => ({ data: [...s.data] }))
      const r = await processRankings(raw, new Date(window[0].time), disabled)
      for (const h of d.holdings) { assert.notEqual(r.cryptosById[h.id].score, NAN_SCORE); near(r.cryptosById[h.id].score, h.scores.Classic, 'production parity') }
      assert.deepEqual(r.cryptosSortedByScore.filter(c => ids.has(c.id)).slice(0, 10).map(c => c.id), d.portfolios.Classic.ids)
    }
  } finally { console.warn = oldWarn }
  const rawPath = path.join(dir, 'local-cache-2020-2026-results.json')
  let obsoleteUncompressed = null
  if (fs.existsSync(rawPath)) {
    const raw = JSON.parse(read(rawPath))
    obsoleteUncompressed = { runnerMatchesGzip: raw.runnerSha256 === result.runnerSha256, decisionsMatchGzip: hash(JSON.stringify(raw.decisions)) === hash(JSON.stringify(result.decisions)), rawDecisions: raw.decisions.length }
  }
  console.log(JSON.stringify({ runnerProvenance, checks: 'PASS: source/cache/protocol hashes, all formulas/sorts/universes/outcomes/scenario arithmetic, grid nonoverlap, phase separation, sampled real-scorer parity', decisions: result.decisions.length, constituents, scorerParityDecisions: sample.length, forwardNull,
    futureDecisionQuotes, affectedDecisionRecords: futureDecisions.size, futureTopQuotes, badPageUses, phaseBoundaries: earliestLatest, obsoleteUncompressed }, null, 2))
}
main().catch(err => { console.error(err); process.exitCode = 1 })
