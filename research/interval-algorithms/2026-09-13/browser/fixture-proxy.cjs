// UI verification only: synthetic prices, no upstream API/credential access.
// Run production Next on 3305, this proxy on 3306; browser opens 3306.
const http = require('node:http')
const now = Date.now() - 60_000
const hour = 3_600_000
const day = 24 * hour
const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu']
const requests = []
function snapshot(mode, age) {
  const cadence = mode === 'daily' ? day : hour
  const bucket = Math.floor(now / cadence) * cadence
  const time = age === 0 ? now : bucket - age * cadence + (mode === 'daily' ? 23 * hour : 3 * 60_000)
  const date = new Date(time).toISOString()
  const data = names.map((name, i) => {
    const t = 100 - age
    const price = 10 * Math.exp(t * (i % 3 === 0 ? -.003 : .002 + i * .0004)) *
      (1 + (i % 2 ? .06 : .01) * Math.sin(t * (i + 1) / 3))
    return { id: i + 1, name: `Fixture ${name}`, symbol: name.slice(0, 3).toUpperCase(),
      slug: `fixture-${name.toLowerCase()}`, cmc_rank: i + 1, tags: [],
      last_updated: date, quote: { USD: { price, market_cap: (13 - i) * 100_000_000,
        volume_24h: 10_000_000, last_updated: date } } }
  })
  return { status: { timestamp: date, error_code: 0 }, data }
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:3306')
  if (url.pathname === '/__fixture/requests') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(requests))
    return
  }
  if (url.pathname.startsWith('/api/')) {
    requests.push(url.pathname + url.search)
    res.setHeader('content-type', 'application/json')
    if (url.pathname === '/api/exchanges') {
      res.end(JSON.stringify({ generatedAt: new Date(now).toISOString(),
        exchanges: [{ id: 'fixture', name: 'Fixture Exchange', rank: 1 }],
        exchangeIdsByCoinId: Object.fromEntries(names.slice(0, 6).map((_, i) => [i + 1, ['fixture']])) }))
      return
    }
    const mode = url.pathname === '/api/rankings/daily' ? 'daily' : 'hourly'
    if (!['/api/rankings/daily', '/api/rankings/hourly'].includes(url.pathname)) {
      res.statusCode = 404
      res.end('{}')
      return
    }
    const skip = Number(url.searchParams.get(mode === 'daily' ? 'daySkip' : 'hoursSkip'))
    const limit = Number(url.searchParams.get(mode === 'daily' ? 'dayLimit' : 'hoursLimit'))
    res.end(JSON.stringify(Array.from({ length: limit }, (_, i) => snapshot(mode, skip + i)).reverse()))
    return
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: 3305, path: req.url,
    method: req.method, headers: { ...req.headers, host: 'localhost:3305' } }, incoming => {
    res.writeHead(incoming.statusCode, incoming.headers)
    incoming.pipe(res)
  })
  upstream.on('error', error => { res.statusCode = 502; res.end(error.message) })
  req.pipe(upstream)
})
server.listen(3306, '127.0.0.1', () => console.log('Synthetic UI fixture proxy on http://localhost:3306'))
