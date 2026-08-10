import {
  Crypto,
  CryptosMinMaxes,
  MAX_SCORE,
  NAN_SCORE,
  Quote,
} from '@/modules/processRankings'
import { axisBottom, axisLeft, line, scaleLinear, scaleTime, timeFormat } from 'd3'
import { percent, trend } from '@/modules/format'
import { useCallback, useMemo, useState } from 'react'

import { D3Chart } from '@/components/D3Chart'
import { cn } from '@/lib/utils'
import { interpolate } from '@/modules/interpolate'

type Hover = { crypto: Crypto; x: number; y: number } | null

/**
 * Rank-flow chart: every coin's market-cap rank over the window, rank 1 at the
 * top. Line weight and opacity encode score, so the strongest movers read as
 * bright thick strokes and the rest recede into texture.
 *
 * This is drawn with d3 rather than Recharts on purpose. It routinely renders
 * 500+ simultaneous series; Recharts would mount a React component per series
 * and per point, which is orders of magnitude more work for a chart whose marks
 * never need to be individually reactive.
 */
export function RankingsChart({
  cryptos,
  minMaxes,
  points,
  maxSeries,
  highlightedIds,
  hiddenIds,
  activeCryptoId,
  onToggleHighlight,
  onHover,
}: {
  cryptos: Crypto[]
  minMaxes: CryptosMinMaxes
  /**
   * Window size, in days or hours. Not a slice length — the series itself is
   * windowed upstream by date. Kept as part of the d3 redraw key.
   */
  points: number
  /** cap on drawn series — small screens get the top scorers only */
  maxSeries?: number
  highlightedIds: Set<string>
  hiddenIds: Set<string>
  activeCryptoId: string | null
  onToggleHighlight: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const [hover, setHover] = useState<Hover>(null)

  /**
   * Drawing 500 hairlines into 390px of phone is noise, not information. The
   * series are already sorted by score, so the cap keeps the movers that the
   * page exists to surface — plus anything explicitly highlighted, which must
   * never disappear just because it ranks low.
   */
  const drawn = useMemo(() => {
    const visible = cryptos.filter((c) => !hiddenIds.has(c.id) && c.score !== NAN_SCORE)
    if (maxSeries == null || visible.length <= maxSeries) return visible
    const top = visible.slice(0, maxSeries)
    const kept = new Set(top.map((c) => c.id))
    const pinned = visible.filter((c) => highlightedIds.has(c.id) && !kept.has(c.id))
    return [...top, ...pinned]
  }, [cryptos, hiddenIds, highlightedIds, maxSeries])

  const omitted = cryptos.length - drawn.length

  const handleHover = useCallback(
    (h: Hover) => {
      setHover(h)
      onHover(h?.crypto.id ?? null)
    },
    [onHover],
  )

  const renderKey = [
    points,
    drawn.length,
    activeCryptoId,
    [...highlightedIds].join(','),
    [...hiddenIds].join(','),
  ].join(':')

  return (
    <figure className="relative m-0">
      <D3Chart renderKey={renderKey} aspect={0.78} minHeight={280}>
        {(svg, height, width) => {
          /*
           * Rank 1 is the top of the ladder and rank 0 does not exist, so the
           * domain is pinned to 1 and the max is rounded up by hand. `.nice()`
           * was extending the axis to 0 and labelling a rank nothing can hold.
           */
          const maxRank = Math.max(2, minMaxes.rankByMarketCapMinMax.max)
          const step = maxRank > 250 ? 100 : maxRank > 100 ? 50 : 20
          const axisMax = Math.ceil(maxRank / step) * step
          const yScale = scaleLinear().domain([axisMax, 1]).range([height, 0])
          const yTickValues = [
            1,
            ...Array.from({ length: Math.floor(axisMax / step) }, (_, i) => (i + 1) * step),
          ]

          const xScale = scaleTime()
            .domain([minMaxes.dateMinMax.min, minMaxes.dateMinMax.max])
            .range([0, width])

          // Tick counts scale with available room; a phone gets 3, not 8.
          const xTicks = Math.max(2, Math.min(6, Math.floor(width / 90)))
          const yTicks = Math.max(3, Math.min(8, Math.floor(height / 60)))

          svg
            .append('g')
            .attr('class', 'axis')
            .call(
              axisLeft(yScale)
                .tickValues(
                  yTickValues.filter(
                    (_, i, arr) => arr.length <= yTicks || i % Math.ceil(arr.length / yTicks) === 0,
                  ),
                )
                .tickSize(-width)
                .tickPadding(8),
            )
            .call((g) => g.select('.domain').remove())
            .call((g) =>
              g.selectAll('.tick line').attr('stroke-opacity', 0.28),
            )

          svg
            .append('g')
            .attr('class', 'axis')
            .attr('transform', `translate(0, ${height})`)
            .call(
              axisBottom(xScale)
                .ticks(xTicks)
                .tickFormat((d) => timeFormat('%b %-d')(d as Date))
                .tickSize(0)
                .tickPadding(10),
            )
            .call((g) => g.select('.domain').remove())

          const drawLine = line<Quote>()
            .x((q) => xScale(q.date))
            .y((q) => yScale(q.rankByMarketCap))

          const weight = (value: number, bound: number, cap: number) => {
            if (!Number.isFinite(value) || !Number.isFinite(bound) || bound === 0) {
              return 0.75
            }
            return interpolate({ start: 0, end: cap, steps: bound, count: value })
          }

          const strokeFor = (c: Crypto) =>
            highlightedIds.has(c.id)
              ? 'var(--spotlight)'
              : (c.total?.pricePct ?? 0) >= 0
                ? 'var(--gain)'
                : 'var(--loss)'

          const widthFor = (c: Crypto) =>
            c.score >= 0
              ? Math.max(1, weight(c.score, minMaxes.scoreMinMax.max, 14))
              : Math.max(0.75, weight(Math.abs(c.score), Math.abs(minMaxes.scoreMinMax.min), 7))

          const opacityFor = (c: Crypto) => {
            if (highlightedIds.has(c.id)) return 1
            const raw =
              c.score >= 0
                ? weight(c.score, minMaxes.scoreMinMax.max, 900)
                : weight(Math.abs(c.score), Math.abs(minMaxes.scoreMinMax.min), 480)
            return Math.min(0.95, Math.max(0.16, raw / MAX_SCORE))
          }

          /*
           * Draw every quote processRankings kept, rather than re-limiting to
           * the last `points`. The window is defined by date upstream (quotes
           * are filtered to >= startDate) and the x-domain is built from that
           * same filtered set, so a second count-based limit here only
           * disagreed with the axis: a window of N days holds N+1 quotes (N
           * daily cron snapshots plus the live one fetched at request time),
           * so slice(-N) dropped each coin's oldest point while the axis still
           * spanned it. Every complete series started one column in, leaving
           * the first column occupied only by coins that happened to have a
           * gap elsewhere.
           */
          const path = (c: Crypto) => drawLine(c.quotes) ?? ''

          // Visible marks, weakest first so the strong movers land on top.
          const ordered = drawn.slice().sort((a, b) => a.score - b.score)

          svg
            .append('g')
            .selectAll('path.rank-line')
            .data(ordered, (c: any) => c.id)
            .join('path')
            .attr('class', (c) =>
              cn('rank-line', c.id === activeCryptoId && 'is-active'),
            )
            .attr('d', path)
            .style('stroke', strokeFor)
            .style('stroke-width', widthFor)
            .style('opacity', opacityFor)

          /*
           * Hit layer. A 1px stroke is unhittable with a finger and awkward with
           * a mouse, so every series gets a transparent 16px-wide companion path
           * on top. Drawn strongest-first so the most prominent line wins ties.
           */
          svg
            .append('g')
            .selectAll('path.rank-hit')
            .data(drawn, (c: any) => c.id)
            .join('path')
            .attr('class', 'rank-hit')
            .attr('d', path)
            .attr('tabindex', 0)
            .attr('role', 'button')
            .attr('aria-label', (c) => `${c.name}, rank ${c.rank}`)
            .on('pointerenter', function (evt: any, c: Crypto) {
              const [mx, my] = [evt.offsetX ?? 0, evt.offsetY ?? 0]
              handleHover({ crypto: c, x: mx, y: my })
            })
            .on('pointermove', function (evt: any, c: Crypto) {
              handleHover({ crypto: c, x: evt.offsetX ?? 0, y: evt.offsetY ?? 0 })
            })
            .on('pointerleave', () => handleHover(null))
            .on('focus', function (evt: any, c: Crypto) {
              const box = (this as SVGPathElement).getBBox()
              handleHover({ crypto: c, x: box.x + box.width / 2, y: box.y })
            })
            .on('blur', () => handleHover(null))
            .on('click', (_evt: any, c: Crypto) => onToggleHighlight(c.id))
            .on('keydown', (evt: any, c: Crypto) => {
              if (evt.key === 'Enter' || evt.key === ' ') {
                evt.preventDefault()
                onToggleHighlight(c.id)
              }
            })
        }}
      </D3Chart>

      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 max-w-[15rem] rounded-md border border-border bg-popover/95 px-2.5 py-2 text-xs shadow-xl backdrop-blur"
          style={{
            left: Math.min(hover.x + 14, 9999),
            top: Math.max(hover.y - 12, 0),
            transform: 'translateY(-100%)',
          }}
        >
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium">{hover.crypto.name}</span>
            <span className="figure text-[0.9em] text-muted-foreground">
              {hover.crypto.symbol}
            </span>
          </div>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
            <dt>Rank</dt>
            <dd className="figure text-right text-foreground">
              #{hover.crypto.total?.endQuote.rankByMarketCap ?? '—'}
            </dd>
            <dt>Price</dt>
            <dd
              className={cn(
                'figure text-right',
                (hover.crypto.total?.pricePct ?? 0) >= 0
                  ? 'text-[color:var(--gain)]'
                  : 'text-[color:var(--loss)]',
              )}
            >
              <span aria-hidden className="mr-0.5">
                {trend(hover.crypto.total?.pricePct)}
              </span>
              {percent(hover.crypto.total?.pricePct)}
            </dd>
          </dl>
        </div>
      )}

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <LegendKey color="var(--gain)" glyph="▲" label="Gaining" />
        <LegendKey color="var(--loss)" glyph="▼" label="Falling" />
        <LegendKey color="var(--spotlight)" glyph="★" label="Highlighted" />
        <span className="ml-auto">
          Line weight = score
          {omitted > 0 && ` · top ${drawn.length} of ${cryptos.length} shown`}
        </span>
      </figcaption>
    </figure>
  )
}

function LegendKey({
  color,
  glyph,
  label,
}: {
  color: string
  glyph: string
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden style={{ color }} className="text-[0.85em]">
        {glyph}
      </span>
      <span
        aria-hidden
        className="h-0.5 w-4 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  )
}
