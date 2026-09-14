#!/usr/bin/env node
// Standalone, offline research runner. Production modules are transpiled in memory only.
process.env.TZ = 'UTC'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { gzipSync } = require('node:zlib')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const ROOT = path.resolve(__dirname, '../..')
const DAY = 86400000
const HOUR = DAY / 24
const METHODS = ['Classic', 'Return', 'TrendQuality', 'VolAdjusted']
const hash = x => crypto.createHash('sha256').update(x).digest('hex')
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
const iso = t => new Date(t).toISOString()
const range = xs => xs.length ? { min: Math.min(...xs), max: Math.max(...xs), mean: mean(xs) } : null
const countBy = xs => Object.fromEntries(xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map()))
const sourceHashes = {}
require.extensions['.ts'] = (module, filename) => {
  assert(filename.startsWith(path.join(ROOT, 'modules') + path.sep), `Unexpected TS import: ${filename}`)
  const text = fs.readFileSync(filename, 'utf8')
  sourceHashes[path.relative(ROOT, filename)] = hash(text)
  module._compile(ts.transpileModule(text, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename)
}
const { processRankings, NAN_SCORE } = require(path.join(ROOT, 'modules/processRankings.ts'))
let scorerWarnings = 0
async function classic(window, disabled = new Set()) {
  const warn = console.warn
  console.warn = () => { scorerWarnings++ }
  try {
    // processRankings sorts data in place. Separate arrays preserve the input inventory.
    return await processRankings(window.map(s => ({ data: [...s.data] })), new Date(window[0].time), disabled)
  } finally { console.warn = warn }
}
function alternatives(rows) {
  const p = rows.map(r => r.quote.USD.price)
  const y = p.map(Math.log)
  const t = rows.map(r => (Date.parse(r.quote.USD.last_updated) - Date.parse(rows[0].quote.USD.last_updated)) / DAY)
  const xm = mean(t), ym = mean(y)
  const xx = t.reduce((a, x) => a + (x - xm) ** 2, 0)
  const yy = y.reduce((a, v) => a + (v - ym) ** 2, 0)
  const xy = t.reduce((a, x, i) => a + (x - xm) * (y[i] - ym), 0)
  const slope = xy / xx
  const r2 = yy > 0 ? Math.min(1, xy * xy / (xx * yy)) : 0
  const changes = y.slice(1).map((v, i) => v - y[i])
  const mu = mean(changes)
  const sd = Math.sqrt(changes.reduce((a, x) => a + (x - mu) ** 2, 0) / (changes.length - 1))
  return { Return: p.at(-1) / p[0] - 1, TrendQuality: slope * r2,
    VolAdjusted: sd > 0 ? (y.at(-1) - y[0]) / (sd * Math.sqrt(changes.length)) : 0,
    logSlopePerDay: slope, r2, dailyLogSD: sd }
}
function fresh(row, snap) {
  if (!row) return false
  const q = row.quote.USD
  return Number.isFinite(q.price) && q.price > 0 && Number.isFinite(Date.parse(q.last_updated)) &&
    Math.abs(Date.parse(q.last_updated) - snap.time) <= HOUR
}
function validHistory(id, window) {
  const rows = window.map(s => s.byId.get(id))
  return rows.every((r, i) => fresh(r, window[i]) && Number.isFinite(r.quote.USD.market_cap) &&
    r.quote.USD.market_cap > 0 && (i === 0 || Date.parse(r.quote.USD.last_updated) > Date.parse(rows[i - 1].quote.USD.last_updated)))
}
function outcome(id, start, end) {
  const a = start.byId.get(id), b = end.byId.get(id)
  const missing = !a ? 'start-absent' : !fresh(a, start) ? 'start-invalid-or-stale' :
    !b ? 'forward-absent-from-top500' : !fresh(b, end) ? 'forward-invalid-or-stale' : null
  return { id, symbol: a?.symbol || b?.symbol || null, return: missing ? null : b.quote.USD.price / a.quote.USD.price - 1,
    missing, elapsedDays: missing ? null : (Date.parse(b.quote.USD.last_updated) - Date.parse(a.quote.USD.last_updated)) / DAY }
}
function basket(holdings) {
  const known = holdings.filter(h => h.return !== null)
  const sum = known.reduce((a, h) => a + h.return, 0)
  const missing = holdings.length - known.length
  return { n: holdings.length, known: known.length, missing, coverage: known.length / holdings.length,
    completeReturn: missing === 0 ? sum / holdings.length : null,
    observedOnlyMean: mean(known.map(h => h.return)),
    missingZeroReturn: sum / holdings.length,
    missingTotalLossReturn: (sum - missing) / holdings.length,
    missingIds: holdings.filter(h => h.return === null).map(h => h.id) }
}
function overlap(a, b) { return a.filter(id => new Set(b).has(id)).length }
function ranks(values) {
  const sorted = Object.entries(values).sort((a, b) => a[1] - b[1])
  const out = {}
  for (let i = 0; i < sorted.length;) {
    let j = i + 1
    while (j < sorted.length && sorted[j][1] === sorted[i][1]) j++
    for (let k = i; k < j; k++) out[sorted[k][0]] = (i + j - 1) / 2
    i = j
  }
  return out
}
function spearman(a, b) {
  const x = ranks(a), y = ranks(b), ids = Object.keys(x)
  const xm = mean(ids.map(id => x[id])), ym = mean(ids.map(id => y[id]))
  const covariance = ids.reduce((v, id) => v + (x[id] - xm) * (y[id] - ym), 0)
  const denom = Math.sqrt(ids.reduce((v, id) => v + (x[id] - xm) ** 2, 0) * ids.reduce((v, id) => v + (y[id] - ym) ** 2, 0))
  return denom > 0 ? covariance / denom : null
}
function inventory() {
  const dir = path.join(ROOT, '.cache/coinmarketcap')
  const tracked = new Set(execFileSync('git', ['ls-files', '-z', '.cache/coinmarketcap'], { cwd: ROOT, encoding: 'utf8' }).split('\0'))
  const snaps = [], manifest = [], failures = []
  for (const name of fs.readdirSync(dir).sort().filter(n => n.startsWith('cryptocurrency_listings:') && n.endsWith('.json'))) {
    const filename = path.join(dir, name), text = fs.readFileSync(filename, 'utf8')
    let raw, key
    try { raw = JSON.parse(text); key = JSON.parse(name.slice(name.indexOf(':') + 1, -5)) }
    catch (err) { failures.push({ name, error: err.message }); continue }
    const times = raw.data.map(r => r.quote?.USD?.last_updated)
    const counts = countBy(times)
    const modal = Object.entries(counts).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]
    const time = Date.parse(modal[0])
    assert(Number.isFinite(time), `Invalid modal timestamp ${name}`)
    const data = raw.data.map(r => ({ id: r.id, name: r.name, symbol: r.symbol, slug: r.slug,
      quote: { USD: { price: r.quote.USD.price, market_cap: r.quote.USD.market_cap,
        volume_24h: r.quote.USD.volume_24h, last_updated: r.quote.USD.last_updated } } }))
    const snap = { name, time, data, byId: new Map(data.map(r => [String(r.id), r])) }
    const rec = { path: path.relative(ROOT, filename), tracked: tracked.has(path.relative(ROOT, filename)),
      sha256: hash(text), dataSha256: hash(JSON.stringify(raw.data)), bytes: Buffer.byteLength(text),
      cacheKey: key, statusTimestamp: raw.status?.timestamp, modalQuoteTime: modal[0], modalQuoteCount: modal[1],
      n: data.length, duplicateIds: data.length - snap.byId.size,
      cmcRankRange: range(raw.data.map(r => r.cmc_rank).filter(Number.isFinite)),
      cmcRanksOutside1To500: raw.data.filter(r => !Number.isFinite(r.cmc_rank) || r.cmc_rank < 1 || r.cmc_rank > 500).length,
      containsBTC: snap.byId.has('1'),
      quoteTimestampCount: Object.keys(counts).length,
      quoteTimeRange: range(times.map(Date.parse).filter(Number.isFinite)),
      invalidTimestamps: times.filter(t => !Number.isFinite(Date.parse(t))).length,
      zeroPrice: data.filter(r => r.quote.USD.price === 0).length,
      invalidOrNegativePrice: data.filter(r => !Number.isFinite(r.quote.USD.price) || r.quote.USD.price < 0).length,
      nonpositiveOrInvalidCap: data.filter(r => !Number.isFinite(r.quote.USD.market_cap) || r.quote.USD.market_cap <= 0).length,
      zeroVolume: data.filter(r => r.quote.USD.volume_24h === 0).length,
      staleBeyondHour: times.filter(t => time - Date.parse(t) > HOUR).length,
      aheadBeyondHour: times.filter(t => Date.parse(t) - time > HOUR).length,
      keyMinusModalMinutes: (Date.parse(key.date) - time) / 60000 }
    assert(rec.duplicateIds === 0, `Duplicate IDs require explicit handling: ${name}`)
    manifest.push(rec); snaps.push(snap)
  }
  const byDay = new Map()
  for (const snap of snaps) {
    const day = iso(snap.time).slice(0, 10), target = Date.parse(day + 'T23:00:00Z')
    const distance = Math.abs(snap.time - target)
    if (distance > HOUR / 2) continue
    const old = byDay.get(day)
    if (!old || distance < old.distance || (distance === old.distance && (snap.time < old.snap.time ||
      (snap.time === old.snap.time && snap.name < old.snap.name)))) byDay.set(day, { distance, snap })
  }
  const daily = [...byDay.values()].map(v => v.snap).sort((a, b) => a.time - b.time)
  const blocks = []
  for (const snap of daily) {
    const prev = blocks.at(-1)?.at(-1)
    if (!prev || Date.parse(iso(snap.time).slice(0, 10)) - Date.parse(iso(prev.time).slice(0, 10)) !== DAY) blocks.push([])
    blocks.at(-1).push(snap)
  }
  const duplicateGroups = field => Object.entries(countBy(manifest.map(m => m[field]))).filter(([, n]) => n > 1)
  let repeatedAdjacentQuotes = 0, unchangedAdjacentPrices = 0, adjacentMatched = 0
  const adjacentUniverseOverlap = []
  for (const block of blocks) for (let i = 1; i < block.length; i++) {
    adjacentUniverseOverlap.push({ start: iso(block[i - 1].time), end: iso(block[i].time),
      sharedIds: [...block[i].byId.keys()].filter(id => block[i - 1].byId.has(id)).length })
    for (const [id, row] of block[i].byId) {
      const prev = block[i - 1].byId.get(id)
      if (!prev) continue
      adjacentMatched++
      if (prev.quote.USD.last_updated === row.quote.USD.last_updated) repeatedAdjacentQuotes++
      if (prev.quote.USD.price === row.quote.USD.price) unchangedAdjacentPrices++
    }
  }
  const hourSlots = [...new Set(snaps.map(s => Math.round(s.time / HOUR)))].sort((a, b) => a - b)
  const hourBlocks = []
  for (const slot of hourSlots) {
    if (!hourBlocks.length || slot !== hourBlocks.at(-1).at(-1) + 1) hourBlocks.push([])
    hourBlocks.at(-1).push(slot)
  }
  const sum = key => manifest.reduce((a, m) => a + m[key], 0)
  return { snaps, blocks, report: {
    inputFingerprint: hash(manifest.map(m => `${m.path}\t${m.sha256}`).join('\n')),
    files: manifest.length, parseFailures: failures, trackedFiles: manifest.filter(m => m.tracked).length,
    rows: sum('n'), uniqueIds: new Set(snaps.flatMap(s => [...s.byId.keys()])).size,
    statusMinusModalDays: range(manifest.map(m => (Date.parse(m.statusTimestamp) - Date.parse(m.modalQuoteTime)) / DAY).filter(Number.isFinite)),
    sizes: countBy(manifest.map(m => m.n)), timestampRange: [iso(Math.min(...snaps.map(s => s.time))), iso(Math.max(...snaps.map(s => s.time)))],
    duplicatePayloadGroups: duplicateGroups('dataSha256'), duplicateModalTimeGroups: duplicateGroups('modalQuoteTime'),
    zeroPrice: sum('zeroPrice'), invalidOrNegativePrice: sum('invalidOrNegativePrice'), staleBeyondHour: sum('staleBeyondHour'),
    aheadBeyondHour: sum('aheadBeyondHour'), nonpositiveOrInvalidCap: sum('nonpositiveOrInvalidCap'), zeroVolume: sum('zeroVolume'),
    selectedDaily: daily.length, excludedFromDaily: snaps.length - daily.length,
    dailyBlocks: blocks.map(b => ({ start: iso(b[0].time), end: iso(b.at(-1).time), n: b.length,
      uniqueIds: new Set(b.flatMap(s => [...s.byId.keys()])).size,
      holdoutStart: iso(b[b.length - Math.ceil(b.length / 3)].time),
      sourceFiles: b.map(s => s.name) })),
    hourlySlotBlocksAtLeast3: hourBlocks.filter(b => b.length >= 3).map(b => ({ start: iso(b[0] * HOUR), end: iso(b.at(-1) * HOUR), n: b.length })),
    dailyAdjacent: { adjacentMatched, repeatedAdjacentQuotes, unchangedAdjacentPrices, adjacentUniverseOverlap },
    selectedDailyRankMetadataExceptions: manifest.filter(m => daily.some(s => s.name === path.basename(m.path)) && m.cmcRanksOutside1To500 > 0)
      .map(m => ({ path: m.path, cmcRankRange: m.cmcRankRange, outside: m.cmcRanksOutside1To500, containsBTC: m.containsBTC })),
    manifest,
  } }
}
function summarize(decisions) {
  const groups = new Map()
  for (const d of decisions) {
    const key = `${d.era}|${d.lookback}/${d.forward}|${d.phase}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(d)
  }
  return [...groups].map(([group, ds]) => ({ group, decisions: ds.length,
    firstDecision: ds[0].decision, lastDecision: ds.at(-1).decision,
    sharedUniverse: range(ds.map(d => d.eligibility.sharedFullHistory)),
    nativeCurrentEligible: range(ds.map(d => d.eligibility.nativeCurrentEligible)),
    nativeEligible: range(ds.map(d => d.eligibility.nativeEligible)),
    nativeClassicTop10Overlap: mean(ds.map(d => d.nativeClassicTop10Overlap)),
    btcMean: mean(ds.map(d => d.btc.return).filter(x => x !== null)), btcMissing: ds.filter(d => d.btc.return === null).length,
    portfolios: Object.fromEntries([...METHODS, 'Universe'].map(method => {
      const bs = ds.map(d => d.portfolios[method])
      const gross0 = mean(bs.map(b => b.missingZeroReturn))
      return [method, { meanMissingZero: gross0,
        meanMissingTotalLoss: mean(bs.map(b => b.missingTotalLossReturn)),
        meanConditionalObservedOnly: mean(bs.map(b => b.observedOnlyMean).filter(x => x !== null)),
        completeDecisions: bs.filter(b => b.missing === 0).length,
        missingEndpoints: bs.reduce((a, b) => a + b.missing, 0),
        totalEndpoints: bs.reduce((a, b) => a + b.n, 0),
        meanExcessUniverseMissingZero: mean(ds.map(d => d.portfolios[method].missingZeroReturn - d.portfolios.Universe.missingZeroReturn)),
        meanExcessBTCMissingZero: mean(ds.filter(d => d.btc.return !== null).map(d => d.portfolios[method].missingZeroReturn - d.btc.return)),
        meanTop10OverlapReturn: method === 'Universe' ? null : mean(ds.map(d => d.descriptive[method].overlapReturn)),
        meanSpearmanReturn: method === 'Universe' ? null : mean(ds.map(d => d.descriptive[method].spearmanReturn).filter(x => x !== null)),
        meanTurnover: method === 'Universe' ? null : mean(ds.map(d => d.descriptive[method].turnover).filter(x => x !== null)),
        costScenarioPerSideBps: method === 'Universe' ? null : Object.fromEntries([10, 50, 100].map(bps => [bps, gross0 - 2 * bps / 10000])),
      }]
    })),
  }))
}
async function main() {
  // Small deterministic checks cover formula direction, constant paths, ties, and endpoint accounting.
  const rows = prices => prices.map((p, i) => ({ quote: { USD: { price: p, last_updated: iso(i * DAY) } } }))
  assert.equal(alternatives(rows([1, 1, 1])).TrendQuality, 0)
  assert.equal(alternatives(rows([1, 1, 1])).VolAdjusted, 0)
  assert(Math.abs(alternatives(rows([1, 2, 4])).Return - 3) < 1e-12)
  assert(alternatives(rows([4, 2, 1])).TrendQuality < 0)
  assert.equal(spearman({ a: 1, b: 2, c: 2 }, { a: 3, b: 1, c: 1 }), -1)
  const missingCheck = basket([{ id: 'a', return: 0.2 }, { id: 'b', return: null }])
  assert.equal(missingCheck.completeReturn, null)
  assert.equal(missingCheck.missingZeroReturn, 0.1)
  assert.equal(missingCheck.missingTotalLossReturn, -0.4)
  const { blocks, report: inv } = inventory()
  fs.writeFileSync(path.join(__dirname, 'local-cache-2020-2026-inventory.json'), JSON.stringify(inv, null, 2) + '\n')
  console.log(JSON.stringify({ files: inv.files, trackedFiles: inv.trackedFiles, selectedDaily: inv.selectedDaily,
    dailyBlocks: inv.dailyBlocks.map(b => ({ ...b, sourceFiles: undefined })), inputFingerprint: inv.inputFingerprint }, null, 2))
  if (process.argv.includes('--inventory-only')) return
  const decisions = [], skipped = []
  for (const block of blocks) {
    const era = iso(block[0].time).slice(0, 10) + '_' + iso(block.at(-1).time).slice(0, 10)
    const split = block.length - Math.ceil(block.length / 3)
    for (const [lookback, forward] of [[7, 1], [21, 7]]) {
      let previous = null
      for (let i = lookback; i + forward < block.length; i += forward) {
        if (i < split && i + forward >= split) {
          skipped.push({ era, lookback, forward, decision: iso(block[i].time), reason: 'forward-crosses-holdout-boundary' }); continue
        }
        const phase = i >= split ? 'holdout' : 'exploratory'
        const window = block.slice(i - lookback, i + 1), start = block[i], end = block[i + forward]
        const union = new Set(window.flatMap(s => [...s.byId.keys()]))
        const native = await classic(window)
        const nativeEligible = native.cryptosSortedByScore.filter(c => !c.insufficientHistory && c.score !== NAN_SCORE && Number.isFinite(c.score))
        const currentEligible = nativeEligible.filter(c => start.byId.has(c.id))
        const ids = currentEligible.map(c => c.id).filter(id => validHistory(id, window))
        if (ids.length < 10) { skipped.push({ era, lookback, forward, decision: iso(start.time), reason: 'under-10-shared-coins', n: ids.length }); continue }
        const shared = new Set(ids), disabled = new Set([...union].filter(id => !shared.has(id)))
        const restricted = await classic(window, disabled)
        const alt = Object.fromEntries(ids.map(id => [id, alternatives(window.map(s => s.byId.get(id)))]))
        const scores = Object.fromEntries(METHODS.map(m => [m, Object.fromEntries(ids.map(id => [id, m === 'Classic' ? restricted.cryptosById[id].score : alt[id][m]]))]))
        for (const m of METHODS) for (const value of Object.values(scores[m])) assert(Number.isFinite(value))
        const orders = Object.fromEntries(METHODS.map(m => [m, m === 'Classic' ? restricted.cryptosSortedByScore.filter(c => shared.has(c.id)).map(c => c.id) :
          [...ids].sort((a, b) => scores[m][b] - scores[m][a] || Number(a) - Number(b))]))
        const holdings = ids.map(id => ({ ...outcome(id, start, end), scores: Object.fromEntries(METHODS.map(m => [m, scores[m][id]])), diagnostics: alt[id] }))
        const byId = new Map(holdings.map(h => [h.id, h]))
        const tops = Object.fromEntries(METHODS.map(m => [m, orders[m].slice(0, 10)]))
        const nativeTop = currentEligible.slice(0, 10).map(c => c.id)
        const portfolios = Object.fromEntries(METHODS.map(m => [m, { ...basket(tops[m].map(id => byId.get(id))), ids: tops[m] }]))
        portfolios.Universe = basket(holdings)
        const descriptive = Object.fromEntries(METHODS.map(m => [m, {
          overlapReturn: overlap(tops[m], tops.Return), spearmanReturn: spearman(scores[m], scores.Return),
          turnover: previous && previous.phase === phase && previous.index + forward === i ? 1 - overlap(tops[m], previous.tops[m]) / 10 : null,
        }]))
        decisions.push({ era, lookback, forward, phase, decision: iso(start.time), forwardEndpoint: iso(end.time),
          elapsedGridDays: (end.time - start.time) / DAY, lookbackGridDays: (start.time - window[0].time) / DAY,
          sourceFiles: window.map(s => s.name), forwardSourceFile: end.name,
          eligibility: { decisionRows: start.data.length, anyLookback: union.size, nativeEligible: nativeEligible.length,
            nativeCurrentEligible: currentEligible.length, sharedFullHistory: ids.length,
            fullHistoryBeforeNativeGate: [...start.byId.keys()].filter(id => validHistory(id, window)).length,
            zeroVolatilityShared: ids.filter(id => alt[id].dailyLogSD === 0).length },
          nativeClassicTop10: nativeTop, nativeClassicTop10Overlap: overlap(nativeTop, tops.Classic),
          portfolios, btc: outcome('1', start, end), descriptive, holdings })
        previous = { index: i, phase, tops }
      }
    }
  }
  // Assert non-overlap and that every missing endpoint stays in its original basket denominator.
  for (const d of decisions) {
    assert.equal(d.holdings.length, d.eligibility.sharedFullHistory)
    for (const m of METHODS) {
      assert.equal(d.portfolios[m].n, 10)
      assert.equal(d.portfolios[m].known + d.portfolios[m].missing, 10)
    }
  }
  const byGroup = new Map()
  for (const d of decisions) {
    const key = `${d.era}/${d.lookback}/${d.forward}`
    const prev = byGroup.get(key)
    if (prev) assert(Date.parse(prev.forwardEndpoint) <= Date.parse(d.decision))
    byGroup.set(key, d)
  }
  const summaries = summarize(decisions)
  const results = { protocolSha256: hash(fs.readFileSync(path.join(__dirname, 'local-cache-predeclared-protocol.md'))),
    runnerSha256: hash(fs.readFileSync(__filename)), inputFingerprint: inv.inputFingerprint,
    node: process.version, typescript: ts.version, timezone: process.env.TZ, sourceHashes,
    interpretationWarnings: [
      'The 2020-2021 era is diagnostic-only: 2021-01-28 is mislabeled start=1 but contains ranks 1300-1800, with zero overlap on adjacent days. Do not interpret its missing endpoints as economic losses.',
      '2020-11-30 has only 173/170 IDs in common with adjacent daily snapshots; cause unresolved. No source exclusion or score retuning was made after seeing results.',
      'Primary preliminary comparison is the separately reported 2026 era. Minor rank metadata exceptions (501) remain inventoried, not silently removed.',
      'Missing=0 and missing=-100% are scenarios, not unbiased estimates. Endpoint absence does not establish delisting.',
      'Quote timestamps are not ingestion/publication evidence. Historical data were fetched retrospectively; cache is selectively seeded.',
    ],
    scorerWarnings, warningMeaning: 'Actual scorer warns on one-quote groups/no total; counted, suppressed from stdout, never treated as eligible.',
    skipped, summaries, decisions }
  fs.writeFileSync(path.join(__dirname, 'local-cache-2020-2026-results.json.gz'), gzipSync(JSON.stringify(results) + '\n'))
  fs.writeFileSync(path.join(__dirname, 'local-cache-2020-2026-summary.json'), JSON.stringify({ ...results, decisions: undefined,
    decisionCount: decisions.length, decisionsSha256: hash(JSON.stringify(decisions)) }, null, 2) + '\n')
  console.log(`Saved ${decisions.length} decisions; ${skipped.length} skipped; ${scorerWarnings} native scorer warnings counted.`)
  for (const s of summaries) console.log(`${s.group}: ${s.decisions} decisions`)
  console.log('Read local-cache-2020-2026-summary.json for outcomes; README.md documents source-quality limitations.')
}
main().catch(err => { console.error(err); process.exitCode = 1 })
