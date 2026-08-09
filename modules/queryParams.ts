/**
 * Helpers for reading Next API route query params.
 *
 * These were copy-pasted into daily.ts, hourly.ts and latest.ts with signatures
 * typed `null | string | string[]` — which does not describe what Next actually
 * hands you (`string | string[] | undefined`), so every call site failed once
 * strictNullChecks was enabled.
 */

export type QueryValue = string | string[] | undefined | null

export function stringParam(param: QueryValue): string | null {
  if (param == null) return null
  if (typeof param === 'string') return param
  return param[0] ?? null
}

export function intParam(param: QueryValue): number | null {
  const str = stringParam(param)
  if (str == null) return null
  const num = parseInt(str, 10)
  return Number.isNaN(num) ? null : num
}
