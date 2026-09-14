#!/usr/bin/env node
// Isolated offline v2 research runner. Production TypeScript is transpiled in memory only.
process.env.TZ = 'UTC'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { gzipSync } = require('node:zlib')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '../..')
const DAY = 86400000
const HOUR = DAY / 24
const QUARANTINE = new Set(['2020-11-30', '2021-01-28'])
const LOOKBACKS = [7, 21, 30]
const HOLDINGS = [1, 7]
const MONTHS = [1, 3, 6, 12]
const COST_BPS = [10, 50, 100]
const METHODS = [
  'Classic',
  'Return',
  'ClassicNoRank',
  'ClassicNoPriceAccel',
  'ClassicRankSignCorrected',
  'TrendQuality',
  'VolAdjusted',
  'ReturnContinuity',
]
const PORTFOLIOS = [...METHODS, 'Universe', 'BTC']
const SCENARIOS = ['missingZero', 'missingTotalLoss']
const sourceHashes = {}
let scorerWarnings = 0

const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const iso = time => new Date(time).toISOString()
const dayOf = time => iso(time).slice(0, 10)
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const finiteMean = values => mean(values.filter(Number.isFinite))
const sum = values => values.reduce((total, value) => total + value, 0)
const countBy = values => Object.fromEntries(values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map()))
const near = (actual, expected, label = 'values') => assert(
  Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected)),
  `${label}: ${actual} != ${expected}`,
)
function stableIdCompare(a, b) {
  const as = String(a), bs = String(b)
  if (/^\d+$/.test(as) && /^\d+$/.test(bs)) {
    const ai = BigInt(as), bi = BigInt(bs)
    return ai < bi ? -1 : ai > bi ? 1 : 0
  }
  return as < bs ? -1 : as > bs ? 1 : 0
}
function stableScoreOrder(ids, scores) {
  return [...ids].sort((a, b) => scores[b] - scores[a] || stableIdCompare(a, b))
}
function datePlusDays(day, days) {
  return dayOf(Date.parse(`${day}T00:00:00Z`) + days * DAY)
}
function datePlusMonths(day, months) {
  const [year, month, date] = day.split('-').map(Number)
  const targetMonth = month - 1 + months
  const targetYear = year + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const value = new Date(Date.UTC(targetYear, normalizedMonth, date))
  if (value.getUTCFullYear() !== targetYear || value.getUTCMonth() !== normalizedMonth || value.getUTCDate() !== date) return null
  return value.toISOString().slice(0, 10)
}

require.extensions['.ts'] = (module, filename) => {
  assert(filename.startsWith(path.join(ROOT, 'modules') + path.sep), `Unexpected TS import: ${filename}`)
  const text = fs.readFileSync(filename, 'utf8')
  sourceHashes[path.relative(ROOT, filename)] = hash(text)
  module._compile(ts.transpileModule(text, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename)
}
const { processRankings, NAN_SCORE } = require(path.join(ROOT, 'modules/processRankings.ts'))

async function productionClassic(window, disabled = new Set()) {
  const warn = console.warn
  console.warn = () => { scorerWarnings++ }
  try {
    return await processRankings(window.map(snapshot => ({ data: [...snapshot.data] })), new Date(window[0].time), disabled)
  } finally {
    console.warn = warn
  }
}

class SignedPercentiles {
  constructor() { this.gains = []; this.losses = []; this.sorted = false }
  add(value) {
    if (!Number.isFinite(value) || value === 0) return
    ;(value > 0 ? this.gains : this.losses).push(Math.abs(value))
    this.sorted = false
  }
  rank(value) {
    if (!Number.isFinite(value) || value === 0) return 0
    if (!this.sorted) {
      this.gains.sort((a, b) => a - b)
      this.losses.sort((a, b) => a - b)
      this.sorted = true
    }
    const pool = value > 0 ? this.gains : this.losses
    if (!pool.length) return 0
    const magnitude = Math.abs(value)
    let below = 0, atOrBelow = 0
    while (below < pool.length && pool[below] < magnitude) below++
    atOrBelow = below
    while (atOrBelow < pool.length && pool[atOrBelow] <= magnitude) atOrBelow++
    const percentile = (below + 0.5 * (atOrBelow - below)) / pool.length
    return value > 0 ? percentile : -percentile
  }
}

function quoteTime(row) { return Date.parse(row?.quote?.USD?.last_updated) }
function freshPrice(row, snapshot) {
  const quote = row?.quote?.USD
  const time = quoteTime(row)
  return !!quote && Number.isFinite(quote.price) && quote.price > 0 && Number.isFinite(time) && Math.abs(time - snapshot.time) <= HOUR
}
function validFormation(id, window, signalCutoff) {
  let previous = -Infinity
  return window.every(snapshot => {
    const row = snapshot.byId.get(id)
    const time = quoteTime(row)
    const quote = row?.quote?.USD
    const valid = freshPrice(row, snapshot) && Number.isFinite(quote.market_cap) && quote.market_cap > 0 &&
      time > previous && time <= signalCutoff
    previous = time
    return valid
  })
}
function signalCutoff(snapshot) {
  const times = snapshot.data.map(quoteTime).filter(Number.isFinite)
  assert(times.length > 0, `No finite signal timestamps: ${snapshot.name}`)
  return Math.max(...times)
}
function alternatives(rows) {
  const prices = rows.map(row => row.quote.USD.price)
  const logs = prices.map(Math.log)
  const firstTime = quoteTime(rows[0])
  const days = rows.map(row => (quoteTime(row) - firstTime) / DAY)
  const xMean = mean(days), yMean = mean(logs)
  const xx = sum(days.map(value => (value - xMean) ** 2))
  const yy = sum(logs.map(value => (value - yMean) ** 2))
  const xy = sum(days.map((value, index) => (value - xMean) * (logs[index] - yMean)))
  const slope = xy / xx
  const r2 = yy > 0 ? Math.min(1, (xy * xy) / (xx * yy)) : 0
  const daily = logs.slice(1).map((value, index) => value - logs[index])
  const dailyMean = mean(daily)
  const variance = daily.length > 1 ? sum(daily.map(value => (value - dailyMean) ** 2)) / (daily.length - 1) : 0
  const sd = Math.sqrt(variance)
  const cumulativeLogReturn = logs.at(-1) - logs[0]
  const direction = Math.sign(cumulativeLogReturn)
  const continuity = direction === 0 ? 0 : daily.filter(value => Math.sign(value) === direction).length / daily.length
  return {
    Return: prices.at(-1) / prices[0] - 1,
    TrendQuality: slope * r2,
    VolAdjusted: cumulativeLogReturn / (Math.max(sd, 1e-12) * Math.sqrt(daily.length)),
    ReturnContinuity: cumulativeLogReturn * continuity,
    cumulativeLogReturn,
    continuity,
    logSlopePerDay: slope,
    r2,
    dailyLogSD: sd,
  }
}

async function scoreFormation(window) {
  const signal = window.at(-1)
  const cutoff = signalCutoff(signal)
  const union = new Set(window.flatMap(snapshot => [...snapshot.byId.keys()]))
  const formationIds = [...signal.byId.keys()].filter(id => validFormation(id, window, cutoff)).sort(stableIdCompare)
  const initialDisabled = new Set([...union].filter(id => !formationIds.includes(id)))
  const initial = await productionClassic(window, initialDisabled)
  const ids = formationIds.filter(id => {
    const coin = initial.cryptosById[id]
    return coin && !coin.insufficientHistory && coin.score !== NAN_SCORE && Number.isFinite(coin.score)
  })
  const eligible = new Set(ids)
  const disabled = new Set([...union].filter(id => !eligible.has(id)))
  const exact = ids.length === formationIds.length ? initial : await productionClassic(window, disabled)
  const raw = {}
  for (const id of ids) {
    const coin = exact.cryptosById[id]
    assert(coin && !coin.insufficientHistory && coin.score !== NAN_SCORE && Number.isFinite(coin.score), `Classic lost eligible ${id}`)
    raw[id] = {
      adjustedVelocity: coin.total.pricePctVelocity * coin.coverage,
      priceAccel: coin.pricePctAccelsSum,
      rankAccel: coin.rankAccelsSum,
      productionClassic: coin.score,
      coverage: coin.coverage,
    }
    for (const [key, value] of Object.entries(raw[id])) assert(Number.isFinite(value), `Nonfinite ${key} for ${id}`)
  }
  const velocityPool = new SignedPercentiles(), pricePool = new SignedPercentiles(), rankPool = new SignedPercentiles()
  for (const id of ids) {
    velocityPool.add(raw[id].adjustedVelocity)
    pricePool.add(raw[id].priceAccel)
    rankPool.add(raw[id].rankAccel)
  }
  const scores = Object.fromEntries(METHODS.map(method => [method, {}]))
  const diagnostics = {}
  for (const id of ids) {
    const velocity = velocityPool.rank(raw[id].adjustedVelocity)
    const priceAccel = pricePool.rank(raw[id].priceAccel)
    const rankAccel = rankPool.rank(raw[id].rankAccel)
    const reconstructed = 700 * velocity + 200 * priceAccel + 100 * rankAccel
    near(reconstructed, raw[id].productionClassic, `Classic parity ${id}`)
    const alt = alternatives(window.map(snapshot => snapshot.byId.get(id)))
    const values = {
      Classic: raw[id].productionClassic,
      Return: alt.Return,
      ClassicNoRank: 700 * velocity + 200 * priceAccel,
      ClassicNoPriceAccel: 700 * velocity + 100 * rankAccel,
      ClassicRankSignCorrected: 700 * velocity + 200 * priceAccel - 100 * rankAccel,
      TrendQuality: alt.TrendQuality,
      VolAdjusted: alt.VolAdjusted,
      ReturnContinuity: alt.ReturnContinuity,
    }
    for (const [method, value] of Object.entries(values)) {
      assert(Number.isFinite(value), `Nonfinite ${method} for ${id}`)
      scores[method][id] = value
    }
    diagnostics[id] = { ...raw[id], velocityPercentile: velocity, priceAccelPercentile: priceAccel,
      rankAccelPercentile: rankAccel, ...alt }
  }
  const orders = Object.fromEntries(METHODS.map(method => [method, stableScoreOrder(ids, scores[method])]))
  return { cutoff, ids, scores, diagnostics, orders, anyFormationIds: union.size, formationValidBeforeNative: formationIds.length }
}

function endpointOutcome(id, signalEligible, signal, entry, exit, cutoff) {
  const signalRow = signal.byId.get(id)
  const symbol = signalRow?.symbol || entry.byId.get(id)?.symbol || exit.byId.get(id)?.symbol || null
  if (!signalEligible) return { id, symbol, signalEligible: false, entryAvailable: false, exitAvailable: false,
    missingStage: 'entry', missingReason: 'not-eligible-at-signal', knownReturn: null,
    missingZero: 0, missingTotalLoss: 0, entryQuoteTime: null, exitQuoteTime: null, elapsedDays: null }
  const entryRow = entry.byId.get(id)
  const entryTime = quoteTime(entryRow)
  let entryReason = null
  if (!entryRow) entryReason = 'entry-absent'
  else if (!freshPrice(entryRow, entry)) entryReason = 'entry-invalid-or-stale'
  else if (!(entryTime > cutoff)) entryReason = 'entry-not-after-signal-cutoff'
  if (entryReason) return { id, symbol, signalEligible: true, entryAvailable: false, exitAvailable: false,
    missingStage: 'entry', missingReason: entryReason, knownReturn: null,
    missingZero: 0, missingTotalLoss: 0, entryQuoteTime: Number.isFinite(entryTime) ? iso(entryTime) : null,
    exitQuoteTime: null, elapsedDays: null }
  const exitRow = exit.byId.get(id)
  const exitTime = quoteTime(exitRow)
  let exitReason = null
  if (!exitRow) exitReason = 'exit-absent'
  else if (!freshPrice(exitRow, exit)) exitReason = 'exit-invalid-or-stale'
  else if (!(exitTime > entryTime)) exitReason = 'exit-not-after-entry'
  if (exitReason) return { id, symbol, signalEligible: true, entryAvailable: true, exitAvailable: false,
    missingStage: 'exit', missingReason: exitReason, knownReturn: null,
    missingZero: 0, missingTotalLoss: -1, entryQuoteTime: iso(entryTime),
    exitQuoteTime: Number.isFinite(exitTime) ? iso(exitTime) : null, elapsedDays: null }
  const knownReturn = exitRow.quote.USD.price / entryRow.quote.USD.price - 1
  return { id, symbol, signalEligible: true, entryAvailable: true, exitAvailable: true,
    missingStage: null, missingReason: null, knownReturn, missingZero: knownReturn, missingTotalLoss: knownReturn,
    entryQuoteTime: iso(entryTime), exitQuoteTime: iso(exitTime), elapsedDays: (exitTime - entryTime) / DAY }
}
function basket(outcomes) {
  const known = outcomes.filter(outcome => outcome.knownReturn !== null)
  const entryMissing = outcomes.filter(outcome => outcome.missingStage === 'entry').length
  const exitMissing = outcomes.filter(outcome => outcome.missingStage === 'exit').length
  return {
    n: outcomes.length,
    known: known.length,
    entryMissing,
    exitMissing,
    missing: entryMissing + exitMissing,
    complete: entryMissing + exitMissing === 0,
    knownOnlyMean: mean(known.map(outcome => outcome.knownReturn)),
    completeReturn: entryMissing + exitMissing === 0 ? mean(known.map(outcome => outcome.knownReturn)) : null,
    missingZero: mean(outcomes.map(outcome => outcome.missingZero)),
    missingTotalLoss: mean(outcomes.map(outcome => outcome.missingTotalLoss)),
    missingIds: outcomes.filter(outcome => outcome.missingStage).map(outcome => outcome.id),
  }
}
function targetFromOutcomes(ids, outcomesById) {
  const weight = 1 / ids.length
  const assets = new Map()
  let cash = 0
  for (const id of ids) {
    if (outcomesById.get(id).entryAvailable) assets.set(id, weight)
    else cash += weight
  }
  return { assets, cash }
}
function overlapCount(a, b) {
  const right = new Set(b)
  return a.filter(id => right.has(id)).length
}
function membershipReplacement(previous, current) {
  if (!previous) return null
  return 1 - overlapCount(previous, current) / Math.max(previous.length, current.length)
}
function evolveTarget(target, outcomesById, scenario) {
  const values = new Map()
  let factor = target.cash
  for (const [id, weight] of target.assets) {
    const value = weight * (1 + outcomesById.get(id)[scenario])
    values.set(id, value)
    factor += value
  }
  assert(factor >= 0 && Number.isFinite(factor), `Invalid portfolio factor ${factor}`)
  if (factor === 0) return { factor, assets: new Map(), cash: 1 }
  return { factor, assets: new Map([...values].map(([id, value]) => [id, value / factor])), cash: target.cash / factor }
}
function rebalanceNotional(current, target) {
  const ids = new Set([...current.assets.keys(), ...target.assets.keys()])
  let buys = 0, sells = 0
  for (const id of ids) {
    const delta = (target.assets.get(id) || 0) - (current.assets.get(id) || 0)
    if (delta > 0) buys += delta
    else sells -= delta
  }
  return { buys, sells, total: buys + sells }
}
function sequentialAccounting(decisions, portfolio, scenario) {
  let current = { assets: new Map(), cash: 1 }
  let grossWealth = 1
  const costWealth = Object.fromEntries(COST_BPS.map(bps => [bps, 1]))
  let buys = 0, sells = 0
  const events = []
  let previousIds = null
  for (const decision of decisions) {
    const ids = decision.portfolios[portfolio].ids
    const outcomesById = new Map(decision.outcomes.map(outcome => [outcome.id, outcome]))
    const target = targetFromOutcomes(ids, outcomesById)
    const trade = rebalanceNotional(current, target)
    buys += trade.buys
    sells += trade.sells
    for (const bps of COST_BPS) costWealth[bps] *= 1 - (bps / 10000) * trade.total
    const evolved = evolveTarget(target, outcomesById, scenario)
    grossWealth *= evolved.factor
    for (const bps of COST_BPS) costWealth[bps] *= evolved.factor
    events.push({ decision: decision.signal, entry: decision.entry, exit: decision.exit,
      buys: trade.buys, sells: trade.sells, total: trade.total,
      membershipReplacement: membershipReplacement(previousIds, ids), periodReturn: evolved.factor - 1 })
    current = { assets: evolved.assets, cash: evolved.cash }
    previousIds = ids
  }
  const liquidation = sum([...current.assets.values()])
  sells += liquidation
  for (const bps of COST_BPS) costWealth[bps] *= 1 - (bps / 10000) * liquidation
  return {
    cohorts: decisions.length,
    grossDiagnosticWealth: grossWealth,
    grossDiagnosticReturn: grossWealth - 1,
    costAdjustedDiagnosticWealth: costWealth,
    costAdjustedDiagnosticReturn: Object.fromEntries(COST_BPS.map(bps => [bps, costWealth[bps] - 1])),
    weightNotional: { buys, sells, total: buys + sells, initialBuys: events[0]?.buys || 0, finalLiquidationSells: liquidation,
      meanPerRebalanceBeforeFinal: mean(events.map(event => event.total)) },
    meanMembershipReplacement: finiteMean(events.map(event => event.membershipReplacement)),
  }
}

function inventory() {
  const directory = path.join(ROOT, '.cache/coinmarketcap')
  const snapshots = [], manifest = [], failures = []
  for (const name of fs.readdirSync(directory).sort().filter(name => name.startsWith('cryptocurrency_listings:') && name.endsWith('.json'))) {
    const filename = path.join(directory, name)
    const text = fs.readFileSync(filename, 'utf8')
    let raw, cacheKey
    try {
      raw = JSON.parse(text)
      cacheKey = JSON.parse(name.slice(name.indexOf(':') + 1, -5))
    } catch (error) {
      failures.push({ name, error: error.message })
      continue
    }
    const quoteTimes = raw.data.map(quoteTime)
    const modal = Object.entries(countBy(quoteTimes.filter(Number.isFinite))).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]
    assert(modal, `No modal timestamp: ${name}`)
    const time = Number(modal[0])
    const data = raw.data.map(row => ({ id: String(row.id), name: row.name, symbol: row.symbol, slug: row.slug,
      quote: { USD: { price: row.quote.USD.price, market_cap: row.quote.USD.market_cap,
        volume_24h: row.quote.USD.volume_24h, last_updated: row.quote.USD.last_updated } } }))
    const byId = new Map(data.map(row => [row.id, row]))
    assert.equal(byId.size, data.length, `Duplicate IDs: ${name}`)
    snapshots.push({ name, time, data, byId })
    manifest.push({ path: path.relative(ROOT, filename), sha256: hash(text), bytes: Buffer.byteLength(text), cacheKey,
      modalQuoteTime: iso(time), modalQuoteCount: modal[1], rows: data.length, date: dayOf(time), quarantined: QUARANTINE.has(dayOf(time)) })
  }
  const byDay = new Map()
  for (const snapshot of snapshots) {
    const day = dayOf(snapshot.time)
    const target = Date.parse(`${day}T23:00:00Z`)
    const distance = Math.abs(snapshot.time - target)
    if (distance > HOUR / 2) continue
    const previous = byDay.get(day)
    if (!previous || distance < previous.distance || (distance === previous.distance &&
      (snapshot.time < previous.snapshot.time || (snapshot.time === previous.snapshot.time && snapshot.name < previous.snapshot.name)))) {
      byDay.set(day, { distance, snapshot })
    }
  }
  const selected = [...byDay.values()].map(value => value.snapshot).sort((a, b) => a.time - b.time)
  const quarantineRecords = selected.filter(snapshot => QUARANTINE.has(dayOf(snapshot.time))).map(snapshot => ({ date: dayOf(snapshot.time),
    name: snapshot.name, time: iso(snapshot.time), rows: snapshot.data.length }))
  const usable = selected.filter(snapshot => !QUARANTINE.has(dayOf(snapshot.time)))
  const blocks = []
  for (const snapshot of usable) {
    const previous = blocks.at(-1)?.at(-1)
    if (!previous || datePlusDays(dayOf(previous.time), 1) !== dayOf(snapshot.time)) blocks.push([])
    blocks.at(-1).push(snapshot)
  }
  const blockRecords = blocks.map((block, index) => {
    const split = Math.ceil(block.length * 2 / 3)
    return { id: `block-${index + 1}`, start: dayOf(block[0].time), end: dayOf(block.at(-1).time), days: block.length,
      era: block[0].time >= Date.parse('2026-01-01T00:00:00Z') ? 'modern-primary' : 'old-diagnostic',
      segments: [
        { name: 'exploratory-train-era', startIndex: 0, endIndex: split - 1, start: dayOf(block[0].time), end: dayOf(block[split - 1].time), days: split },
        { name: 'exploratory-test-era', startIndex: split, endIndex: block.length - 1, start: dayOf(block[split].time), end: dayOf(block.at(-1).time), days: block.length - split },
      ] }
  })
  return { blocks, blockRecords, report: {
    inputFingerprint: hash(manifest.map(record => `${record.path}\t${record.sha256}`).join('\n')),
    files: manifest.length,
    parseFailures: failures,
    selectedDailyBeforeQuarantine: selected.length,
    selectedDailyAfterQuarantine: usable.length,
    quarantine: quarantineRecords,
    timestampRange: [iso(Math.min(...snapshots.map(snapshot => snapshot.time))), iso(Math.max(...snapshots.map(snapshot => snapshot.time)))],
    blocks: blockRecords,
    manifest,
  } }
}

function monthlyFeasibility(blocks, blockRecords) {
  const output = []
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex], record = blockRecords[blockIndex]
    const indexByDay = new Map(block.map((snapshot, index) => [dayOf(snapshot.time), index]))
    for (const segment of record.segments) {
      const indices = Array.from({ length: segment.endIndex - segment.startIndex + 1 }, (_, offset) => segment.startIndex + offset)
      const lookbackCounts = {}, forwardCounts = {}, pairs = {}
      for (const months of MONTHS) {
        lookbackCounts[months] = indices.filter(index => {
          const target = datePlusMonths(dayOf(block[index].time), -months)
          return target && indexByDay.has(target)
        }).length
        forwardCounts[months] = indices.filter(index => {
          const target = datePlusMonths(dayOf(block[index].time), months)
          const targetIndex = target == null ? undefined : indexByDay.get(target)
          return targetIndex != null && targetIndex <= segment.endIndex
        }).length
      }
      for (const lookbackMonths of MONTHS) for (const forwardMonths of MONTHS) {
        const key = `${lookbackMonths}x${forwardMonths}`
        pairs[key] = indices.filter(signalIndex => {
          const signalDay = dayOf(block[signalIndex].time)
          const lookbackDay = datePlusMonths(signalDay, -lookbackMonths)
          const entryDay = datePlusDays(signalDay, 1)
          const exitDay = datePlusMonths(entryDay, forwardMonths)
          const lookbackIndex = lookbackDay == null ? undefined : indexByDay.get(lookbackDay)
          const entryIndex = indexByDay.get(entryDay)
          const exitIndex = exitDay == null ? undefined : indexByDay.get(exitDay)
          return lookbackIndex != null && entryIndex != null && exitIndex != null &&
            signalIndex >= segment.startIndex && entryIndex <= segment.endIndex && exitIndex <= segment.endIndex
        }).length
      }
      output.push({ block: record.id, era: record.era, segment: segment.name, range: [segment.start, segment.end],
        lookbackEndpointCounts: lookbackCounts, forwardEndpointCounts: forwardCounts, pairCounts: pairs })
    }
  }
  return output
}

function segmentDecisionIndices(block, segment, lookback, holding) {
  const first = Math.max(lookback, segment.startIndex)
  const last = segment.endIndex - 1 - holding
  if (first > last) return []
  const indices = []
  for (let index = first; index <= last; index += holding) indices.push(index)
  return indices
}

async function buildDecisions(blocks, blockRecords) {
  const decisions = [], skipped = []
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex], blockRecord = blockRecords[blockIndex]
    for (const segment of blockRecord.segments) for (const lookback of LOOKBACKS) for (const holding of HOLDINGS) {
      const indices = segmentDecisionIndices(block, segment, lookback, holding)
      for (const signalIndex of indices) {
        const formation = block.slice(signalIndex - lookback, signalIndex + 1)
        const signal = block[signalIndex], entry = block[signalIndex + 1], exit = block[signalIndex + 1 + holding]
        assert.equal(formation.length, lookback + 1)
        assert.equal(datePlusDays(dayOf(formation[0].time), lookback), dayOf(signal.time))
        assert.equal(datePlusDays(dayOf(signal.time), 1), dayOf(entry.time))
        assert.equal(datePlusDays(dayOf(entry.time), holding), dayOf(exit.time))
        const scored = await scoreFormation(formation)
        assert(entry.time > scored.cutoff, `Entry snapshot not after cutoff: ${signal.name}`)
        for (const id of scored.ids) for (const snapshot of formation) assert(quoteTime(snapshot.byId.get(id)) <= scored.cutoff)
        if (scored.ids.length < 10) {
          skipped.push({ block: blockRecord.id, era: blockRecord.era, segment: segment.name, lookback, holding,
            signal: iso(signal.time), reason: 'under-10-signal-eligible', eligible: scored.ids.length })
          continue
        }
        const eligible = new Set(scored.ids)
        const outcomes = scored.ids.map(id => endpointOutcome(id, true, signal, entry, exit, scored.cutoff))
        const outcomesById = new Map(outcomes.map(outcome => [outcome.id, outcome]))
        const portfolios = {}
        for (const method of METHODS) {
          const ids = scored.orders[method].slice(0, 10)
          portfolios[method] = { ids, basket: basket(ids.map(id => outcomesById.get(id))) }
        }
        portfolios.Universe = { ids: [...scored.ids], basket: basket(outcomes) }
        const btcOutcome = endpointOutcome('1', eligible.has('1'), signal, entry, exit, scored.cutoff)
        if (!outcomesById.has('1')) outcomes.push(btcOutcome)
        portfolios.BTC = { ids: ['1'], basket: basket([btcOutcome]), eligibleAtSignal: eligible.has('1') }
        for (const portfolio of PORTFOLIOS) {
          const result = portfolios[portfolio].basket
          assert.equal(result.n, portfolios[portfolio].ids.length)
          assert.equal(result.known + result.entryMissing + result.exitMissing, result.n)
        }
        const topUnion = new Set(METHODS.flatMap(method => portfolios[method].ids))
        const coins = scored.ids.map(id => ({ id, symbol: signal.byId.get(id)?.symbol || null,
          scores: Object.fromEntries(METHODS.map(method => [method, scored.scores[method][id]])),
          diagnostics: scored.diagnostics[id], outcome: outcomesById.get(id), selectedBy: METHODS.filter(method => topUnion.has(id) && portfolios[method].ids.includes(id)) }))
        decisions.push({ block: blockRecord.id, era: blockRecord.era, segment: segment.name, lookback, holding,
          signal: iso(signal.time), signalDate: dayOf(signal.time), signalCutoff: iso(scored.cutoff), entry: iso(entry.time), exit: iso(exit.time),
          gridEntryLagDays: (entry.time - signal.time) / DAY, gridHoldingDays: (exit.time - entry.time) / DAY,
          sourceFiles: formation.map(snapshot => snapshot.name), entrySourceFile: entry.name, exitSourceFile: exit.name,
          eligibility: { signalRows: signal.data.length, anyFormationIds: scored.anyFormationIds,
            formationValidBeforeNative: scored.formationValidBeforeNative, eligible: scored.ids.length },
          portfolios, outcomes, coins })
      }
    }
  }
  return { decisions, skipped }
}

function extremes(decisions, portfolio, scenario) {
  if (!decisions.length) return null
  const values = decisions.map(decision => ({ decision: decision.signal, value: decision.portfolios[portfolio].basket[scenario] }))
  const ordered = [...values].sort((a, b) => a.value - b.value || a.decision.localeCompare(b.decision))
  const average = mean(values.map(item => item.value))
  const worst = ordered[0], best = ordered.at(-1)
  return { mean: average, worst: { ...worst, meanWithout: mean(values.filter(item => item !== worst).map(item => item.value)) },
    best: { ...best, meanWithout: mean(values.filter(item => item !== best).map(item => item.value)) } }
}
function frequentHoldings(decisions, portfolio, limit = 10) {
  const counts = new Map(), symbols = new Map()
  for (const decision of decisions) {
    const symbolById = new Map(decision.outcomes.map(outcome => [outcome.id, outcome.symbol]))
    for (const id of decision.portfolios[portfolio].ids) {
      counts.set(id, (counts.get(id) || 0) + 1)
      if (symbolById.get(id)) symbols.set(id, symbolById.get(id))
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || stableIdCompare(a[0], b[0])).slice(0, limit)
    .map(([id, count]) => ({ id, symbol: symbols.get(id) || null, cohorts: count, fraction: count / decisions.length }))
}
function endpointTotals(decisions, portfolio) {
  const baskets = decisions.map(decision => decision.portfolios[portfolio].basket)
  return { total: sum(baskets.map(value => value.n)), known: sum(baskets.map(value => value.known)),
    entryMissing: sum(baskets.map(value => value.entryMissing)), exitMissing: sum(baskets.map(value => value.exitMissing)),
    completeCohorts: baskets.filter(value => value.complete).length, cohorts: baskets.length }
}
function summarize(decisions) {
  const groups = new Map()
  for (const decision of decisions) {
    const key = `${decision.block}|${decision.era}|${decision.segment}|L${decision.lookback}|H${decision.holding}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(decision)
  }
  return [...groups].map(([group, groupDecisions]) => {
    groupDecisions.sort((a, b) => Date.parse(a.signal) - Date.parse(b.signal))
    const portfolioSummary = {}
    for (const portfolio of PORTFOLIOS) {
      const baskets = groupDecisions.map(decision => decision.portfolios[portfolio].basket)
      const previousIds = groupDecisions.map(decision => decision.portfolios[portfolio].ids)
      portfolioSummary[portfolio] = {
        endpointCounts: endpointTotals(groupDecisions, portfolio),
        averageForwardReturns: {
          missingZero: mean(baskets.map(value => value.missingZero)),
          missingTotalLoss: mean(baskets.map(value => value.missingTotalLoss)),
          conditionalKnownOnly: finiteMean(baskets.map(value => value.knownOnlyMean)),
          exactCompleteOnly: finiteMean(baskets.map(value => value.completeReturn)),
        },
        pairedBenchmarkDifferences: {
          versusUniverseMissingZero: portfolio === 'Universe' ? 0 : mean(groupDecisions.map(decision => decision.portfolios[portfolio].basket.missingZero - decision.portfolios.Universe.basket.missingZero)),
          versusUniverseMissingTotalLoss: portfolio === 'Universe' ? 0 : mean(groupDecisions.map(decision => decision.portfolios[portfolio].basket.missingTotalLoss - decision.portfolios.Universe.basket.missingTotalLoss)),
          versusBTCMissingZero: portfolio === 'BTC' ? 0 : mean(groupDecisions.map(decision => decision.portfolios[portfolio].basket.missingZero - decision.portfolios.BTC.basket.missingZero)),
          versusBTCMissingTotalLoss: portfolio === 'BTC' ? 0 : mean(groupDecisions.map(decision => decision.portfolios[portfolio].basket.missingTotalLoss - decision.portfolios.BTC.basket.missingTotalLoss)),
        },
        meanMembershipReplacement: finiteMean(previousIds.slice(1).map((ids, index) => membershipReplacement(previousIds[index], ids))),
        frequentHoldings: frequentHoldings(groupDecisions, portfolio),
        outcomeInfluence: Object.fromEntries(SCENARIOS.map(scenario => [scenario, extremes(groupDecisions, portfolio, scenario)])),
        sequential: Object.fromEntries(SCENARIOS.map(scenario => [scenario, sequentialAccounting(groupDecisions, portfolio, scenario)])),
      }
    }
    return { group, decisions: groupDecisions.length, firstSignal: groupDecisions[0].signal, lastSignal: groupDecisions.at(-1).signal,
      firstEntry: groupDecisions[0].entry, lastExit: groupDecisions.at(-1).exit,
      eligibility: { min: Math.min(...groupDecisions.map(decision => decision.eligibility.eligible)),
        max: Math.max(...groupDecisions.map(decision => decision.eligibility.eligible)),
        mean: mean(groupDecisions.map(decision => decision.eligibility.eligible)) },
      portfolios: portfolioSummary }
  })
}

function syntheticSnapshot(time, rows, name = iso(time)) {
  const data = rows.map(row => ({ id: String(row.id), name: row.name || `coin-${row.id}`, symbol: row.symbol || `C${row.id}`,
    slug: row.slug || `coin-${row.id}`, quote: { USD: { price: row.price, market_cap: row.marketCap,
      volume_24h: row.volume || 1000, last_updated: iso(row.time ?? time) } } }))
  return { name, time, data, byId: new Map(data.map(row => [row.id, row])) }
}
async function syntheticChecks() {
  const checks = []
  const pass = (name, evidence) => checks.push({ name, evidence })

  const currentRankContribution = 100 * -1
  const correctedRankContribution = -100 * -1
  assert(correctedRankContribution > currentRankContribution)
  pass('rank-acceleration sign correction', { improvingRankAccelPercentile: -1, currentRankContribution, correctedRankContribution })

  const pureRows = [1, 1.2, 1.5].map((price, index) => ({ quote: { USD: { price, last_updated: iso(index * DAY) } } }))
  const pure = alternatives(pureRows)
  near(pure.Return, 0.5, 'pure return')
  near(Math.expm1(pure.cumulativeLogReturn), pure.Return, 'simple/log return equivalence')
  pass('pure-return equivalence', { simpleReturn: pure.Return, fromLogReturn: Math.expm1(pure.cumulativeLogReturn) })

  const base = Date.parse('2026-01-01T23:00:00Z')
  const signal = syntheticSnapshot(base, [{ id: 1, price: 10, marketCap: 100, time: base - 1000 }, { id: 2, price: 10, marketCap: 90, time: base }])
  const cutoff = signalCutoff(signal)
  const next = syntheticSnapshot(base + DAY, [{ id: 1, price: 11, marketCap: 110, time: base + DAY - 1000 }])
  assert(cutoff === base)
  assert(next.time > cutoff)
  assert(quoteTime(next.byId.get('1')) > cutoff)
  pass('strict cutoff and next entry', { cutoff: iso(cutoff), nextObservation: iso(next.time), entryQuote: iso(quoteTime(next.byId.get('1'))) })

  const exit = syntheticSnapshot(base + 2 * DAY, [{ id: 1, price: 12, marketCap: 120 }])
  const unavailable = endpointOutcome('2', true, signal, next, exit, cutoff)
  const available = endpointOutcome('1', true, signal, next, exit, cutoff)
  const fixedBasket = basket([available, unavailable])
  assert.equal(unavailable.entryAvailable, false)
  assert.equal(unavailable.missingZero, 0)
  assert.equal(unavailable.missingTotalLoss, 0)
  assert.equal(fixedBasket.n, 2)
  assert.equal(fixedBasket.entryMissing, 1)
  const target = targetFromOutcomes(['1', '2'], new Map([['1', available], ['2', unavailable]]))
  near(target.assets.get('1'), 0.5)
  near(target.cash, 0.5)
  pass('cash unavailable entry no survivors filter', { selected: ['1', '2'], assets: Object.fromEntries(target.assets), cash: target.cash })

  const exitMissing = { id: '2', knownReturn: null, entryAvailable: true, missingStage: 'exit', missingZero: 0, missingTotalLoss: -1 }
  const denominator = basket([{ id: '1', knownReturn: 0.2, entryAvailable: true, missingStage: null, missingZero: 0.2, missingTotalLoss: 0.2 }, exitMissing])
  near(denominator.missingZero, 0.1)
  near(denominator.missingTotalLoss, -0.4)
  assert.equal(denominator.n, 2)
  pass('missing denominators', denominator)

  const syntheticDecision = (signalDate, returns) => {
    const outcomes = Object.entries(returns).map(([id, value]) => ({ id, entryAvailable: true, missingZero: value, missingTotalLoss: value }))
    return { signal: signalDate, entry: signalDate, exit: signalDate, outcomes,
      portfolios: { Test: { ids: Object.keys(returns) } } }
  }
  const twoCoin = [syntheticDecision('a', { a: 1, b: 0 }), syntheticDecision('b', { a: 0, b: 0 })]
  const accounting = sequentialAccounting(twoCoin, 'Test', 'missingZero')
  near(accounting.weightNotional.initialBuys, 1)
  near(accounting.weightNotional.finalLiquidationSells, 1)
  near(accounting.weightNotional.buys - accounting.weightNotional.initialBuys, 1 / 6)
  near(accounting.weightNotional.sells - accounting.weightNotional.finalLiquidationSells, 1 / 6)
  near(accounting.weightNotional.buys, 7 / 6)
  near(accounting.weightNotional.sells, 7 / 6)
  near(accounting.costAdjustedDiagnosticWealth[100], 1.5 * 0.99 * (1 - 0.01 / 3) * 0.99)
  pass('portfolio trade-cost accounting known two-coin case', { weightNotional: accounting.weightNotional,
    wealthAt100Bps: accounting.costAdjustedDiagnosticWealth[100] })

  const times = [0, 1, 2].map(offset => base + offset * DAY)
  const formation = times.map((time, index) => syntheticSnapshot(time, [
    { id: 1, price: [100, 110, 125][index], marketCap: [300, 310, 330][index] },
    { id: 2, price: [100, 105, 108][index], marketCap: [200, 210, 205][index] },
    { id: 3, price: [100, 98, 95][index], marketCap: [100, 90, 80][index] },
  ], `synthetic-${index}`))
  const scored = await scoreFormation(formation)
  assert.equal(scored.ids.length, 3)
  for (const id of scored.ids) near(scored.scores.Classic[id], scored.diagnostics[id].productionClassic, `synthetic baseline parity ${id}`)
  pass('baseline Classic parity', { ids: scored.ids, scores: scored.scores.Classic })
  return checks
}

async function main() {
  const protocolPath = path.join(__dirname, 'v2-protocol.md')
  assert(fs.existsSync(protocolPath), 'v2 protocol must exist before running')
  const synthetic = await syntheticChecks()
  const { blocks, blockRecords, report: inventoryReport } = inventory()
  const feasibility = monthlyFeasibility(blocks, blockRecords)
  const inventoryOutput = { ...inventoryReport, monthlyCycleFeasibility: feasibility }
  fs.writeFileSync(path.join(__dirname, 'v2-inventory.json'), JSON.stringify(inventoryOutput, null, 2) + '\n')
  console.log(JSON.stringify({ syntheticChecks: synthetic.map(check => check.name), files: inventoryReport.files,
    selectedDailyBeforeQuarantine: inventoryReport.selectedDailyBeforeQuarantine,
    selectedDailyAfterQuarantine: inventoryReport.selectedDailyAfterQuarantine,
    blocks: blockRecords, monthlyCycleFeasibility: feasibility }, null, 2))
  if (process.argv.includes('--inventory-only')) return

  const { decisions, skipped } = await buildDecisions(blocks, blockRecords)
  for (const decision of decisions) {
    assert(Date.parse(decision.entry) > Date.parse(decision.signalCutoff))
    assert(!QUARANTINE.has(decision.signalDate))
    for (const portfolio of PORTFOLIOS) assert.equal(decision.portfolios[portfolio].basket.n, decision.portfolios[portfolio].ids.length)
  }
  const summaries = summarize(decisions)
  const protocolSha256 = hash(fs.readFileSync(protocolPath))
  const runnerSha256 = hash(fs.readFileSync(__filename))
  const results = {
    status: 'exploratory-only-no-untouched-holdout',
    protocolSha256,
    runnerSha256,
    inputFingerprint: inventoryReport.inputFingerprint,
    node: process.version,
    typescript: ts.version,
    timezone: process.env.TZ,
    sourceHashes,
    parameters: { quarantine: [...QUARANTINE], lookbacksDays: LOOKBACKS, holdingsDays: HOLDINGS, entryLagDays: 1,
      methods: METHODS, costBpsPerTradedNotional: COST_BPS, monthlyCycleMonths: MONTHS },
    caveats: [
      'All v2 outcomes are exploratory because earlier outcomes were already read; train/test-era labels are descriptive diagnostics, not holdouts.',
      'The 2026 block is primary. Every 2020-2021 block is old diagnostic evidence only and is split by quarantined 2020-11-30 and 2021-01-28 hard gaps.',
      'Quote timestamps do not prove when data became publicly available; cache history was assembled retrospectively and selectively.',
      'Unavailable entry is modeled as cash. Unavailable exit is shown under 0% and -100% scenarios; neither convention is an unbiased delisting estimate.',
      'Sequential wealth and cost outputs are bookkeeping diagnostics under modeled marks, not executable compounded performance.',
      'Arithmetic average forward returns are reported separately and must not be described as compounded executable returns.',
      'Top-500 membership, token events, bad prints, exchange access, liquidity, spread, market impact, and capacity remain unresolved.',
      'The monthly/cycle inventory is feasibility-only; these short blocks cannot validate 3, 6, or 12 month horizons.',
    ],
    syntheticChecks: synthetic,
    scorerWarnings,
    skipped,
    summaries,
    decisions,
  }
  fs.writeFileSync(path.join(__dirname, 'v2-results.json.gz'), gzipSync(JSON.stringify(results) + '\n'))
  const summary = { ...results, decisions: undefined, decisionCount: decisions.length,
    decisionsSha256: hash(JSON.stringify(decisions)), feasibility,
    resultFile: 'v2-results.json.gz' }
  fs.writeFileSync(path.join(__dirname, 'v2-summary.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(`Saved ${decisions.length} exploratory decisions; ${skipped.length} skipped; ${scorerWarnings} scorer warnings counted.`)
  for (const item of summaries) console.log(`${item.group}: ${item.decisions} decisions`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
