import type { NextApiRequest, NextApiResponse } from 'next'

import { cmc } from '../../../modules/coinmarketcap'
import { get } from 'env-var'
import { roundToHour } from '../../../modules/roundToHour'

const CRON_SECRET = get('CRON_SECRET').asString()

// Fetching 500 listings from CMC and writing the snapshot to S3 is normally a
// few seconds. Give it room for a slow upstream without hitting the platform
// default.
export const config = {
  maxDuration: 120,
}

export type HourlyListingsCronResponse =
  | {
      ok: true
      /** Hour bucket the snapshot was written under, e.g. 2026-08-08T23:00:00.000Z */
      bucket: string
      /** Raw CMC timestamp the bucket was derived from. */
      lastUpdated: string
      count: number
    }
  | { ok: false; error: string }

/**
 * Hourly snapshot cron. Replaces the long-lived DigitalOcean container that ran
 * `app/crons/runHourlyListingsCron.ts`.
 *
 * Scheduling now comes from `vercel.json` rather than the in-process interval in
 * `app/crons/HourlyCron.ts`, so the "skip first run" / "minute <= 15" guards are
 * gone. What matters for correctness is only that this runs between :00 and :29
 * past the hour: `cmc.listings({ hourlyCron: true })` keys the snapshot by
 * `roundToHour(last_updated)`, which floors below :30 and ceils at or above it.
 * Running at :05 leaves ~25 minutes of slack for a delayed invocation before the
 * snapshot would land in the next hour's bucket.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HourlyListingsCronResponse>,
) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
  // set on the project. Refuse to run unprotected — this endpoint spends CMC
  // credits and writes to S3.
  if (!CRON_SECRET) {
    console.error('hourly-listings cron: CRON_SECRET is not configured')
    return res.status(500).json({ ok: false, error: 'CRON_SECRET not configured' })
  }
  if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  try {
    const result = await cmc.listings({
      start: 1,
      limit: 500,
      hourlyCron: true,
    })

    const lastUpdated = result?.data?.[0]?.quote?.USD?.last_updated
    if (!lastUpdated) {
      // cmc.listings' cache `set` step logs and skips the write on a malformed
      // response, so surface that as a failure rather than a silent success.
      throw new Error('CMC returned no listings; snapshot not written')
    }

    const bucket = roundToHour(new Date(lastUpdated))
    console.log('hourly-listings cron: wrote snapshot', {
      bucket: bucket.toISOString(),
      lastUpdated,
      count: result.data.length,
    })

    return res.status(200).json({
      ok: true,
      bucket: bucket.toISOString(),
      lastUpdated,
      count: result.data.length,
    })
  } catch (err) {
    // Let the failure show up as a non-2xx in Vercel's cron log. The old
    // DigitalOcean cron wrapped this in Promise.allSettled and swallowed it.
    console.error('hourly-listings cron: failed', err)
    return res
      .status(500)
      .json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
