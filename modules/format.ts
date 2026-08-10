import { format } from 'd3'

/**
 * Shared number formatting.
 *
 * The mobile card list and the desktop table show the same figures in different
 * shapes; keeping the formatters here is what stops them drifting apart.
 */

const pct2 = format('.2f')
const compactNum = format('~s')

/** Market caps read as 113.6B, not 113,562,000,000. */
export function marketCap(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return compactNum(value).replace('G', 'B')
}

/** Signed percentage. The sign is deliberate — polarity is never color-alone. */
export function percent(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${pct2(value)}%`
}

/**
 * Prices span ~$0.00001 to ~$100,000, so a single format is unreadable at one
 * end or the other. Significant digits scale with magnitude.
 */
export function price(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value === 0) return '$0'
  const abs = Math.abs(value)
  if (abs >= 1000) return format('$,.0f')(value)
  if (abs >= 1) return format('$,.2f')(value)
  if (abs >= 0.01) return format('$,.4f')(value)
  return format('$,.8f')(value)
}

/**
 * Scores run roughly -1000..1000 and are only ever compared, never summed, so
 * one decimal is all the precision that carries meaning. Four decimals just made
 * the column noisy and pushed real data off narrow screens.
 */
export function score(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return format('.1f')(value)
}

/** Direction glyph — the secondary encoding that keeps polarity off color alone. */
export function trend(value: number | undefined | null): '▲' | '▼' | '—' {
  if (value == null || !Number.isFinite(value) || value === 0) return '—'
  return value > 0 ? '▲' : '▼'
}

export function toneClass(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return 'text-[color:var(--flat)]'
  }
  return value > 0 ? 'text-[color:var(--gain)]' : 'text-[color:var(--loss)]'
}

export const cmcUrl = (slug: string) =>
  `https://coinmarketcap.com/currencies/${slug}/`
