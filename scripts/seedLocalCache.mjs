/**
 * Seed the local FS cache from the production rankings API.
 *
 * Working on this app locally used to be impossible without production
 * credentials: every data path reads snapshots that only the cron writes, and
 * CMC_API_KEY / AWS_S3_* are legacy *Encrypted* Vercel variables that cannot be
 * pulled back out. This fetches the already-public rankings payloads and writes
 * them into `.cache/coinmarketcap/` under the exact keys `FSStore` expects, so
 * `USE_FS_CACHE=true npm run dev` serves real multi-day data with no secrets.
 *
 *   node scripts/seedLocalCache.mjs [--days 30] [--hours 12]
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ORIGIN = process.env.SEED_ORIGIN ?? 'https://topcryptos.io'
const OUT = path.resolve(process.cwd(), '.cache/coinmarketcap')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = parseInt(process.argv[i + 1], 10)
  return Number.isNaN(v) ? fallback : v
}

const DAYS = arg('days', 30)
const HOURS = arg('hours', 12)

// Mirrors modules/roundToHour.ts — floor below :30, ceil at or above.
const floorHour = (d) => new Date(d.toISOString().slice(0, -10) + '00:00.000Z')
const ceilHour = (d) => {
  const out = floorHour(d)
  out.setHours(out.getHours() + 1)
  return out
}
const roundToHour = (d) => (d.getMinutes() >= 30 ? ceilHour(d) : floorHour(d))

// Mirrors modules/cache.ts cacheKey() — stable key order is date, hourlyCron,
// limit, start (fast-json-stable-stringify sorts alphabetically).
const cacheKey = (date) =>
  `cryptocurrency_listings:{"date":"${date.toISOString()}","hourlyCron":"true","limit":"500","start":"1"}`

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

async function collect(endpoint, skipParam, limitParam, total, chunk) {
  const seen = new Map()
  for (let skip = 0; skip < total; skip += chunk) {
    const url = `${ORIGIN}/api/rankings/${endpoint}?${skipParam}=${skip}&${limitParam}=${chunk}`
    let snapshots
    try {
      snapshots = await fetchJson(url)
    } catch (err) {
      console.warn(`  skip ${skip}: ${err.message}`)
      continue
    }
    for (const snap of snapshots) {
      const lastUpdated = snap?.data?.[0]?.quote?.USD?.last_updated
      if (!lastUpdated) continue
      const bucket = roundToHour(new Date(lastUpdated))
      seen.set(bucket.toISOString(), snap)
    }
    process.stdout.write(`  ${endpoint} ${skip}/${total} -> ${seen.size} buckets\r`)
  }
  console.log()
  return seen
}

await mkdir(OUT, { recursive: true })

console.log(`seeding from ${ORIGIN} into ${OUT}`)
const daily = await collect('daily', 'daySkip', 'dayLimit', DAYS, 9)
const hourly = await collect('hourly', 'hoursSkip', 'hoursLimit', HOURS, 6)

let written = 0
for (const [iso, snap] of [...daily, ...hourly]) {
  const key = cacheKey(new Date(iso)).replace(/\//g, '_') + '.json'
  await writeFile(path.join(OUT, key), JSON.stringify(snap))
  written += 1
}

console.log(`wrote ${written} snapshots`)
console.log('now run:  USE_FS_CACHE=true npm run dev')
