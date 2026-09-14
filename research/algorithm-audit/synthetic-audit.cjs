// Run: TZ=UTC node research/algorithm-audit/synthetic-audit.cjs
// Executes production modules via the already-installed TS compiler, in memory.
// No downloads, network calls, build output, or production file changes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript')
process.env.TZ = 'UTC'
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  })
  module._compile(outputText, filename)
}
const { processRankings, NAN_SCORE } = require('../../modules/processRankings.ts')
const { topCryptos } = require('../../modules/topCryptos.ts')
const epoch = Date.parse('2026-08-01T00:00:00Z')
const date = minute => new Date(epoch + minute * 60000).toISOString()
const coin = (id, times, prices, caps = prices.map(() => 1000)) => ({ id, times, prices, caps })
function snapshots(coins) {
  const times = [...new Set(coins.flatMap(c => c.times))].sort((a, b) => a - b)
  return times.map(t => ({ status: {}, data: coins.flatMap(c => {
    const i = c.times.indexOf(t)
    return i < 0 ? [] : [{ id: c.id, name: `coin-${c.id}`, symbol: `C${c.id}`, slug: `coin-${c.id}`,
      cmc_rank: 999, circulating_supply: c.caps[i] / c.prices[i],
      quote: { USD: { price: c.prices[i], market_cap: c.caps[i], volume_24h: 1000, last_updated: date(t) } } }]
  }) }))
}
const run = (data, hidden = [], start = 0) => processRankings(structuredClone(data), new Date(date(start)), new Set(hidden.map(String)))
const get = (result, id = 1) => result.cryptosById[String(id)]
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
const summary = c => ({ pricePct: c.total.pricePct, minutes: c.total.duration, coverage: c.coverage,
  insufficient: c.insufficientHistory, priceAccel: c.pricePctAccelsSum, rankAccel: c.rankAccelsSum,
  ranks: c.quotes.map(q => q.rankByMarketCap), score: c.score, rank: c.rank })
const checks = []
async function check(name, fn) { const evidence = await fn(); checks.push({ name, evidence }); console.log(`PASS ${name}`) }
async function main() {
  await check('Coverage-adjusted endpoint velocity equals return/shared span', async () => {
    const r = await run(snapshots([coin(1, [0, 50, 100], [100, 110, 120]), coin(2, [50, 75, 100], [100, 110, 120])]))
    for (const c of Object.values(r.cryptosById)) close(c.total.pricePctVelocity * c.coverage, c.total.pricePct / 100)
    close(get(r, 2).coverage, 0.5)
    return Object.values(r.cryptosById).map(summary)
  })
  await check('Regular grid telescopes despite radically different interiors', async () => {
    const prices = [[100, 200, 400, 800, 1600], [100, 200, 100, 800, 1600]]
    const results = []
    for (const p of prices) {
      const c = get(await run(snapshots([coin(1, [0, 1, 2, 3, 4], p)])))
      close(c.pricePctAccelsSum, 0); close(c.total.pricePct, 1500)
      results.push(summary(c))
    }
    assert.equal(results[0].score, results[1].score)
    return results
  })
  await check('Irregular grid preserves endpoint return but breaks cancellation', async () => {
    const c = get(await run(snapshots([coin(1, [0, 1, 3, 4, 5], [100, 200, 100, 800, 1600])])))
    close(c.pricePctAccelsSum, -200); close(c.total.pricePct, 1500)
    return summary(c)
  })
  await check('Timestamp jitter affects acceleration with identical quote prices', async () => {
    const a = get(await run(snapshots([coin(1, [0, 1, 2, 3], [100, 200, 400, 800])])))
    const b = get(await run(snapshots([coin(1, [0, 1.1, 1.9, 3], [100, 200, 400, 800])])))
    close(a.pricePctAccelsSum, 0); close(b.pricePctAccelsSum, 0, 1e-6)
    const c = get(await run(snapshots([coin(1, [0, 1.1, 2, 3], [100, 200, 400, 800])])))
    assert.ok(Math.abs(c.pricePctAccelsSum) > 1)
    return [a, b, c].map(summary)
  })
  await check('Steady dollar growth, accelerating growth, pump/reversal signs', async () => {
    const r = await run(snapshots([
      coin(1, [0, 1, 2, 3], [100, 110, 120, 130], [3000, 3000, 3000, 3000]),
      coin(2, [0, 1, 2, 3], [100, 105, 115, 130], [2000, 2000, 2000, 2000]),
      coin(3, [0, 1, 2, 3], [100, 200, 150, 130], [1000, 1000, 1000, 1000]),
    ]))
    close(get(r, 1).pricePctAccelsSum, 100 * (10 / 120 - 10 / 100))
    assert.ok(get(r, 2).pricePctAccelsSum > 0)
    assert.ok(get(r, 3).pricePctAccelsSum < get(r, 1).pricePctAccelsSum)
    return Object.values(r.cryptosById).map(summary)
  })
  await check('Floating-point dust receives a full singleton acceleration percentile', async () => {
    const c = get(await run(snapshots([coin(1, [0, 1, 2, 3], [100, 110, 121, 133.1])])))
    assert.ok(c.pricePctAccelsSum < 0 && Math.abs(c.pricePctAccelsSum) < 1e-12)
    close(c.score, 250)
    return summary(c)
  })
  await check('Internal gap and stale half-window endpoint still eligible', async () => {
    const r = await run(snapshots([
      coin(1, [0, 1, 100], [100, 110, 120]),
      coin(2, [0, 25, 50], [100, 110, 120]),
      coin(3, [0, 50, 100], [100, 110, 120]),
    ]))
    assert.equal(get(r, 1).insufficientHistory, false)
    assert.equal(get(r, 2).insufficientHistory, false)
    close(get(r, 2).coverage, 0.5)
    const stalled = get(await run(snapshots([coin(1, [0, 1, 2], [100, 110, 120])])) )
    close(stalled.coverage, 1); assert.equal(stalled.insufficientHistory, false)
    return { gapAndStale: [get(r, 1), get(r, 2)].map(summary), allStalled: summary(stalled) }
  })
  await check('Two-quote hidden outlier still changes shared span and eligibility', async () => {
    const base = snapshots([coin(1, [0, 1, 2], [100, 110, 120])])
    const before = get(await run(base))
    const after = get(await run(snapshots([coin(1, [0, 1, 2], [100, 110, 120]), coin(2, [0, 10], [1, 1])]), [2]))
    assert.equal(before.insufficientHistory, false); assert.equal(after.insufficientHistory, true)
    assert.equal(after.score, NAN_SCORE)
    return { before: summary(before), after: summary(after) }
  })
  await check('Hidden coins recalibrate percentiles but remain in scored output', async () => {
    const data = snapshots([coin(1, [0, 1, 2], [100, 150, 225]), coin(2, [0, 1, 2], [100, 200, 400]), coin(3, [0, 1, 2], [100, 300, 900])])
    const before = await run(data); const after = await run(data, [3])
    close(get(before, 1).score, 700 / 6); close(get(after, 1).score, 175)
    close(get(after, 3).score, 700); assert.equal(after.cryptosSortedByScore.length, 3)
    return { before: Object.values(before.cryptosById).map(summary), after: Object.values(after.cryptosById).map(summary) }
  })
  await check('Accelerating rank improvement is penalized; deterioration rewarded', async () => {
    const ranks = async caps => {
      const data = snapshots([coin(1, [0, 1, 2], [100, 100, 100], caps),
        coin(2, [0, 1, 2], [100, 100, 100], [300, 300, 300]),
        coin(3, [0, 1, 2], [100, 100, 100], [200, 200, 200]),
        coin(4, [0, 1, 2], [100, 100, 100], [100, 100, 100])])
      // Hidden peers still establish market-cap rank but do not calibrate percentile pools.
      return get(await run(data, [2, 3, 4]))
    }
    const improving = await ranks([50, 150, 400]); const worsening = await ranks([400, 250, 50])
    const steady = await ranks([50, 150, 250])
    assert.deepEqual(improving.quotes.map(q => q.rankByMarketCap), [4, 3, 1])
    close(improving.rankAccelsSum, -1); close(improving.score, -50)
    close(worsening.rankAccelsSum, 1); close(worsening.score, 50)
    close(steady.rankAccelsSum, 0); close(steady.score, 0)
    return { improving: summary(improving), worsening: summary(worsening), steady: summary(steady) }
  })
  await check('Market-cap growth has no direct weight without rank crossings', async () => {
    const a = get(await run(snapshots([coin(1, [0, 1, 2], [100, 100, 100], [100, 200, 400])])))
    close(a.total.marketCapPct, 300); close(a.score, 0)
    return summary(a)
  })
  await check('Cutoff filters local calendar day, not hour; no upper bound', async () => {
    const c = get(await run(snapshots([coin(1, [0, 60, 120, 1440], [100, 110, 120, 130])]), [], 720))
    assert.equal(c.quotes.length, 4); assert.equal(c.quotes[0].date.toISOString(), date(0))
    return { requestedStart: date(720), kept: c.quotes.map(q => q.date.toISOString()) }
  })
  await check('Processor accepts duplicate timestamps, silently zeroes invalid acceleration', async () => {
    const data = snapshots([coin(1, [0, 1, 2], [100, 110, 120])])
    data[1].data[0].quote.USD.last_updated = date(0)
    const c = get(await run(data))
    assert.equal(c.insufficientHistory, false); assert.ok(!Number.isFinite(c.pricePctAccelsSum))
    close(c.score, 350)
    return { ...summary(c), accelerationNonfinite: true }
  })
  await check('Processor preserves input order, including backwards interior timestamp', async () => {
    const data = snapshots([coin(1, [0, 1, 2, 3], [100, 110, 120, 130])])
    const c = get(await run([data[0], data[2], data[1], data[3]]))
    assert.deepEqual(c.quotes.map(q => (q.date.valueOf() - epoch) / 60000), [0, 2, 1, 3])
    assert.equal(c.insufficientHistory, false)
    return summary(c)
  })
  await check('Equal market caps take input order; equal scores take reverse insertion order', async () => {
    const data = snapshots([coin(1, [0, 1, 2], [100, 100, 100]), coin(2, [0, 1, 2], [100, 100, 100])])
    const r = await run(data)
    assert.deepEqual(get(r, 1).quotes.map(q => q.rankByMarketCap), [1, 1, 1])
    assert.deepEqual(r.cryptosSortedByScore.map(c => c.id), ['2', '1'])
    const flipped = await run(data.map((s, i) => ({ ...s, data: i === 1 ? s.data.slice().reverse() : s.data })))
    close(get(flipped, 1).rankAccelsSum, -2)
    return { tiedScores: r.cryptosSortedByScore.map(summary), tiedCapOrderChanged: summary(get(flipped, 1)) }
  })
  await check('Actual hourly client deduplicates by textual hour and compresses snapshot ranks', async () => {
    const originalFetch = global.fetch
    const data = snapshots([coin(1, [0, 60, 120], [100, 110, 120], [2000, 2000, 2000]), coin(2, [0, 60, 120], [100, 110, 120], [1000, 1000, 1000])])
    // High-cap coin has a stale timestamp in the middle snapshot; it is removed there.
    data[1].data[0].quote.USD.last_updated = date(1)
    global.fetch = async url => ({ ok: true, json: async () => new URL(url).searchParams.get('hoursSkip') === '0' ? structuredClone(data) : [] })
    try {
      const merged = await topCryptos.getHourlyRankings({})
      assert.equal(merged[1].data.length, 1)
      const r = await run(merged)
      assert.deepEqual(get(r, 2).quotes.map(q => q.rankByMarketCap), [2, 1, 2])
      close(get(r, 2).rankAccelsSum, 2 / (60 * 60))
      return summary(get(r, 2))
    } finally { global.fetch = originalFetch }
  })
  const source = path.resolve(__dirname, '../../modules/processRankings.ts')
  console.log(JSON.stringify({ sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'), checks: checks.length, results: checks }, (_, v) => typeof v === 'number' && !Number.isFinite(v) ? String(v) : v, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
