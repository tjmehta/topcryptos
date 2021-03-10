import { Color } from './Color'
import { interpolate } from './interpolate'

export function interpolateColor({
  start,
  end,
  steps,
  count,
}: {
  start: Color
  end: Color
  steps: number
  count: number
}): Color {
  return new Color(
    interpolate({
      start: start.r,
      end: end.r,
      steps,
      count,
    }),
    interpolate({
      start: start.g,
      end: end.g,
      steps,
      count,
    }),
    interpolate({
      start: start.b,
      end: end.b,
      steps,
      count,
    }),
  )
}
