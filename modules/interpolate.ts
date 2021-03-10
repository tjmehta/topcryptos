import * as d3 from 'd3'

export function interpolate({
  start,
  end,
  steps,
  count,
}: {
  start: number
  end: number
  steps: number
  count: number
}) {
  const s = Math.round(start)
  const e = Math.round(end)
  const final = s + ((e - s) / Math.round(steps)) * Math.round(count)

  return Math.floor(final)
}
