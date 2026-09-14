// Read-only live smoke: capture counts, dates, provenance and scorer eligibility.
const fs = require('fs'), ts = require('typescript'), Module = require('module'), path = require('path')
function load(file) {
  const full = path.resolve(file), m = new Module(full, module)
  m.filename = full; m.paths = module.paths
  m._compile(ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, full)
  return m.exports
}
const { loadExchangeOhlc } = load('modules/exchangeOhlc.ts')
const { rankOhlc } = load('modules/ohlcAlgorithms.ts')
;(async () => {
  const result = { checked_at: new Date().toISOString(), exchanges: [] }
  for (const exchange of ['coinbase', 'kraken']) {
    const start = Date.now()
    try {
      const s = await loadExchangeOhlc(exchange)
      result.exchanges.push({ exchange, elapsed_ms: Date.now() - start, source: s.source, source_url: s.source_url,
        signal_date: s.signal_date, entry_date: s.entry_date, volume_method: s.volume_method, expected_instruments: s.expected_instruments,
        instruments: s.instruments.map(i => ({ symbol: i.symbol, bars: i.bars.length, last_bar: i.bars.at(-1)?.date, entry_price: i.entry_price, entry_unavailable_reason: i.entry_unavailable_reason })),
        views: [3,4,5,6,7,10,14,21,30,45,60,90].map(view_observations => { const r = rankOhlc({ signal_date: s.signal_date, interval_unit: 'day', view_observations, algorithm: 'Breakout', instruments: s.instruments }); return { view_observations, eligible: r.universe_assessments.filter(x=>x.eligible).length, selected: r.selected.length } }) })
    } catch (error) { result.exchanges.push({ exchange, error: String(error) }); process.exitCode = 1 }
  }
  fs.writeFileSync(path.join(__dirname, 'live-smoke.json'), JSON.stringify(result, null, 2)+'\n')
  console.log(JSON.stringify({ checked_at: result.checked_at, exchanges: result.exchanges.map(x=>({...x,instruments:x.instruments?.length})) }, null, 2))
})()
