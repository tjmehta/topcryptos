'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../../..')
const source = 'research/cumulative/2026-09-13/'
const read = (file) => fs.readFileSync(path.join(root, file))
const hash = (file) => crypto.createHash('sha256').update(read(file)).digest('hex')
const summary = JSON.parse(read(source + 'cmc-summary.json'))
const ledger = JSON.parse(zlib.gunzipSync(read(source + 'cmc-results.json.gz')))
assert.equal(hash(source + 'cmc-results.json.gz'), summary.hashes.ledger)
assert.equal(hash('modules/processRankings.ts'), summary.hashes.sources['modules/processRankings.ts'])
const minimumSignals = 6
const key = (r) => `${r.signal}/${r.entrySnapshot}`
const mean = (numbers) => numbers.reduce((sum, value) => sum + value, 0) / numbers.length
const round = (number) => Math.round(number * 1e10) / 1e10
const costReturn = (p, cost, totalLoss) => p.entryMissing ? 0 : ((1 + (p.gross ?? (totalLoss ? -1 : 0))) * (1 - cost)) / (1 + cost) - 1
const fields = { net50: [0.005, false], net100: [0.01, false], netLoss50: [0.005, true], netLoss100: [0.01, true] }
let arithmeticChecks = 0
for (const r of ledger.records) {
  assert(r.positions.length <= 10)
  for (const [field, [cost, loss]] of Object.entries(fields)) {
    for (const p of r.positions) {
      assert(Math.abs(costReturn(p, cost, loss) - p[field]) < 1e-12)
      arithmeticChecks++
    }
    assert(Math.abs(r.positions.reduce((sum, p) => sum + costReturn(p, cost, loss), 0) / 10 - r[field]) < 1e-12)
    arithmeticChecks++
  }
}
const configurations = []
for (const mode of ['daily', 'hourly']) for (const view of summary.views[mode]) {
  const records = ledger.records.filter((r) => r.mode === mode && r.view === view)
  const counts = summary.holds[mode].map((holding) => ({ holding, availableSignals: Math.min(...summary.methods.map((method) => records.filter((r) => r.method === method && r.holding === holding).length)) }))
  const admitted = counts.filter((r) => r.availableSignals >= minimumSignals).map((r) => r.holding)
  const sets = admitted.flatMap((holding) => summary.methods.map((method) => new Set(records.filter((r) => r.holding === holding && r.method === method).map(key))))
  const common = sets.length ? [...sets[0]].filter((k) => sets.every((s) => s.has(k))).sort() : []
  assert(!common.length || common.length >= minimumSignals)
  const matched = new Set(common)
  const representative = records.filter((r) => r.method === summary.methods[0] && r.holding === admitted[0] && matched.has(key(r))).sort((a, b) => a.signal.localeCompare(b.signal))
  const windows = counts.map(({ holding, availableSignals }) => {
    const rows = records.filter((r) => r.holding === holding && matched.has(key(r)))
    const comparable = admitted.includes(holding) && common.length >= minimumSignals
    const dates = comparable ? rows.map((r) => r.exitSnapshot).sort() : []
    return { holding, availableSignals, status: comparable ? 'comparable' : availableSignals ? 'sparse' : 'unavailable', exitStart: dates[0] ?? null, exitEnd: dates.at(-1) ?? null }
  })
  const methods = Object.fromEntries(summary.methods.map((method) => [method, windows.filter((w) => w.status === 'comparable').map(({ holding }) => {
    const rows = records.filter((r) => r.method === method && r.holding === holding && matched.has(key(r)))
    assert.equal(rows.length, common.length)
    const positions = rows.flatMap((r) => r.positions)
    const known = positions.filter((p) => !p.entryMissing && !p.exitMissing)
    for (const r of rows) {
      const reference = records.find((other) => other.method === method && other.holding === admitted[0] && key(other) === key(r))
      assert.deepEqual(r.positions.map((p) => p.id), reference.positions.map((p) => p.id))
    }
    return { holding, selected: positions.length, known: known.length, knownLosers50: known.filter((p) => costReturn(p, .005, false) < 0).length,
      entryMissing: positions.filter((p) => p.entryMissing).length, exitMissing: positions.filter((p) => p.exitMissing).length,
      ...Object.fromEntries(Object.entries(fields).map(([field, [cost, loss]]) => ['mean' + field[0].toUpperCase() + field.slice(1), round(mean(rows.map((r) => r.positions.reduce((sum, p) => sum + costReturn(p, cost, loss), 0) / 10)))])) }
  })]))
  configurations.push({ mode, view, matchedSignals: common.length, signalDates: representative.map((r) => r.signal), entryDates: representative.map((r) => r.entrySnapshot), slots: common.length * 10, windows, methods })
}
const artifact = { schemaVersion: 1, study: { date: '2026-09-14', backtestCompletedAt: summary.completedAt, source: 'CoinMarketCap snapshots', minimumSignals, recommendation: null, validation: 'retrospective-only', universe: 'native-cmc-top-ten', exchangeFiltered: false, dataBlocks: summary.dataBlocks, sourcePath: source, scorerHash: hash('modules/processRankings.ts'), ledgerHash: hash(source + 'cmc-results.json.gz'), inputsHash: summary.hashes.inputs, sourceArtifactHash: summary.hashes.sourceArtifact, protocolHash: hash('research/native-exits/2026-09-14/protocol.md'), exporterHash: hash('research/native-exits/2026-09-14/export.cjs') }, configurations }
const output = JSON.stringify(artifact) + '\n'
assert(Buffer.byteLength(output) < 100000)
fs.writeFileSync(path.join(root, 'modules/data/native-exit-evidence.json'), output)
console.log(JSON.stringify({ bytes: Buffer.byteLength(output), configurations: configurations.length, methodWindowRows: configurations.reduce((sum, c) => sum + Object.values(c.methods).flat().length, 0), arithmeticChecks, artifactHash: hash('modules/data/native-exit-evidence.json') }, null, 2))
