/**
 * Views count UTC calendar buckets, including the current partial bucket.
 * Seven daily buckets are not a promise of seven complete elapsed days.
 * Keep this definition shared by the UI and historical replay.
 */
export function getRankingWindow(
  mode: 'daily' | 'hourly',
  amount: number,
  now = new Date(),
) {
  const intervalMs = mode === 'daily' ? 86_400_000 : 3_600_000
  const endTime = now.valueOf()
  const currentBucket = Math.floor(endTime / intervalMs) * intervalMs
  return {
    startDate: new Date(currentBucket - (amount - 1) * intervalMs),
    endDate: new Date(endTime),
    intervalMs,
  }
}
