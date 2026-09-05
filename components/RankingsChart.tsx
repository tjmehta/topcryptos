import {
  Crypto,
  CryptosMinMaxes,
  NAN_SCORE,
  Quote,
} from '@/modules/processRankings'
import { axisBottom, axisLeft, line, pointer, scaleLinear, scaleTime, select, timeFormat } from 'd3'
import { percent, trend } from '@/modules/format'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { D3Chart } from '@/components/D3Chart'
import { cn } from '@/lib/utils'

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
  const figureRef = useRef<HTMLElement | null>(null)

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

  /*
   * The active (hovered) series is NOT part of the redraw key. It used to be,
   * and that broke tapping on touch screens: a tap fires pointerenter first,
   * which set activeCryptoId, which re-keyed the chart, which wiped and
   * rebuilt every path *under the finger* before the click could dispatch —
   * the tap lit the line yellow but never toggled the highlight. A mouse
   * hovers long before it clicks, so desktop never saw it. Toggling a class
   * on the existing paths is also far cheaper than redrawing 500 of them on
   * every table-row hover.
   */
  const renderKey = [
    points,
    drawn.length,
    [...highlightedIds].join(','),
    [...hiddenIds].join(','),
  ].join(':')

  useEffect(() => {
    if (figureRef.current == null) return
    select(figureRef.current)
      .selectAll<SVGPathElement, Crypto>('path.rank-line')
      .classed('is-active', (c) => c.id === activeCryptoId)
  }, [activeCryptoId, renderKey])

  return (
    <figure ref={figureRef} className="relative m-0">
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
          // Hourly windows span a day or two: label hours, not the same date six times.
          const spanMs =
            minMaxes.dateMinMax.max.getTime() - minMaxes.dateMinMax.min.getTime()
          const xFormat = timeFormat(spanMs <= 2 * 24 * 3600 * 1000 ? '%-H:%M' : '%b %-d')
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
                .tickFormat((d) => xFormat(d as Date))
                .tickSize(0)
                .tickPadding(10),
            )
            .call((g) => g.select('.domain').remove())

          const drawLine = line<Quote>()
            .x((q) => xScale(q.date))
            .y((q) => yScale(q.rankByMarketCap))

          /*
           * Scores are percentile ranks, so they spread uniformly across the
           * field — mapped linearly to stroke, the *median* coin would get a
           * mid-weight line and 500 of them fuse into a solid wall. Emphasis
           * has to be convex: the power curve keeps the bulk of the field at
           * hairline weight and spends the visual budget on the top decile,
           * which is the shape the old skewed divide-by-max scores produced
           * incidentally.
           */
          const emphasis = (value: number, bound: number, exponent: number) => {
            if (!Number.isFinite(value) || !Number.isFinite(bound) || bound === 0) {
              return 0
            }
            return Math.pow(Math.min(1, Math.max(0, value / bound)), exponent)
          }

          const strokeFor = (c: Crypto) =>
            highlightedIds.has(c.id)
              ? 'var(--spotlight)'
              : (c.total?.pricePct ?? 0) >= 0
                ? 'var(--gain)'
                : 'var(--loss)'

          const widthFor = (c: Crypto) =>
            c.score >= 0
              ? 1 + 13 * emphasis(c.score, minMaxes.scoreMinMax.max, 4)
              : 0.75 +
                6.25 * emphasis(Math.abs(c.score), Math.abs(minMaxes.scoreMinMax.min), 4)

          const opacityFor = (c: Crypto) => {
            if (highlightedIds.has(c.id)) return 1
            const raw =
              c.score >= 0
                ? 0.16 + 0.79 * emphasis(c.score, minMaxes.scoreMinMax.max, 3)
                : 0.16 +
                  0.32 * emphasis(Math.abs(c.score), Math.abs(minMaxes.scoreMinMax.min), 3)
            return Math.min(0.95, raw)
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

          // Visible marks, weakest first so the strong movers land on top —
          // and pinned coins last of all, so a highlight is never buried.
          const ordered = drawn.slice().sort((a, b) => {
            const ah = highlightedIds.has(a.id) ? 1 : 0
            const bh = highlightedIds.has(b.id) ? 1 : 0
            return ah - bh || a.score - b.score
          })

          svg
            .append('g')
            .selectAll('path.rank-line')
            .data(ordered, (c: any) => c.id)
            .join('path')
            .attr('class', 'rank-line')
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

          /*
           * Rank rails. Every drawn coin gets a label in each gutter — its rank
           * at the start of the window on the left, at the end on the right —
           * so the edges of the chart read 1…500 and every series can be found
           * without aiming at a hairline. 500 labels in 300px are illegible,
           * so at rest they collapse to a faint tick strip and a fisheye lens
           * follows the pointer: labels near it spread apart and grow, the rest
           * squeeze away (the macOS dock / d3-fisheye distortion). Dragging a
           * finger along the rail does the same, so touch gets it too.
           */
          const RAIL_W = 40
          const DISTORTION = 5
          const LENS = 120 // px radius of the lens

          type RailItem = { crypto: Crypto; rank: number; y: number }
          const railItems = (side: 'start' | 'end'): RailItem[] =>
            drawn
              .map((c) => {
                const q = side === 'start' ? c.quotes[0] : c.quotes[c.quotes.length - 1]
                const rank = q?.rankByMarketCap
                return rank == null ? null : { crypto: c, rank, y: yScale(rank) }
              })
              .filter((v): v is RailItem => v != null)
              .sort((a, b) => a.y - b.y)

          const fisheye = (y: number, focus: number) => {
            const dy = y - focus
            if (dy === 0) return { y, k: 1 }
            const ad = Math.abs(dy)
            if (ad >= LENS) return { y, k: 0 }
            // d3-fisheye: distance is remapped by (d+1)/(d + LENS/|dy|)
            const f = (DISTORTION + 1) / (DISTORTION + LENS / ad)
            const yy = focus + Math.sign(dy) * f * LENS
            // magnification is the derivative — used for font size.
            const k = ((DISTORTION + 1) * DISTORTION * LENS) / Math.pow(DISTORTION * ad + LENS, 2)
            return { y: yy, k: Math.min(1, k) }
          }

          const drawRail = (side: 'start' | 'end') => {
            const items = railItems(side)
            const x = side === 'start' ? -6 : width + 6
            const g = svg
              .append('g')
              .attr('class', `rank-rail rank-rail-${side}`)
              .attr('transform', `translate(${x}, 0)`)

            const ticks = g
              .selectAll('line')
              .data(items)
              .join('line')
              .attr('class', 'rank-rail-tick')
              .attr('x1', side === 'start' ? -4 : 0)
              .attr('x2', side === 'start' ? 0 : 4)
              .attr('y1', (d) => d.y)
              .attr('y2', (d) => d.y)
              .style('stroke', (d) => strokeFor(d.crypto))

            const labels = g
              .selectAll('text')
              .data(items)
              .join('text')
              .attr('class', 'rank-rail-label')
              .attr('text-anchor', side === 'start' ? 'end' : 'start')
              .attr('dominant-baseline', 'middle')
              .attr('x', 0)
              .attr('y', (d) => d.y)
              .style('display', 'none')
              .text((d) => d.rank)

            const layout = (focus: number | null) => {
              if (focus == null) {
                labels.style('display', 'none')
                ticks.attr('y1', (d) => d.y).attr('y2', (d) => d.y).style('opacity', null)
                svg.selectAll('.axis text').style('opacity', null)
                return
              }
              // Hide the y-axis numbers while the lens is open — they and the
              // rail labels would otherwise fight for the same 40px.
              svg.selectAll('.axis text').style('opacity', 0.15)
              const pos = items.map((d) => fisheye(d.y, focus))
              // Labels must not overlap: walk outward from the focus and only
              // keep a label if it clears the previous kept one by ~its height.
              const keep = new Set<number>()
              const order = items
                .map((_, i) => i)
                .sort((a, b) => Math.abs(pos[a].y - focus) - Math.abs(pos[b].y - focus))
              const placed: number[] = []
              order.forEach((i) => {
                const size = 7 + 7 * pos[i].k
                if (pos[i].k < 0.12) return
                if (placed.every((j) => Math.abs(pos[j].y - pos[i].y) >= size * 0.95)) {
                  keep.add(i)
                  placed.push(i)
                }
              })
              labels
                .style('display', (_, i) => (keep.has(i) ? null : 'none'))
                .attr('y', (_, i) => pos[i].y)
                .style('font-size', (_, i) => `${7 + 7 * pos[i].k}px`)
                .style('font-weight', (_, i) => (pos[i].k > 0.85 ? 600 : 400))
                .style('opacity', (_, i) => 0.35 + 0.65 * pos[i].k)
              ticks
                .attr('y1', (_, i) => pos[i].y)
                .attr('y2', (_, i) => pos[i].y)
                .style('opacity', (_, i) => (pos[i].k === 0 ? 0.35 : 0.5 + 0.5 * pos[i].k))
            }

            const nearest = (y: number) => {
              let best: RailItem | null = null
              let bestD = Infinity
              items.forEach((d) => {
                const dd = Math.abs(d.y - y)
                if (dd < bestD) {
                  bestD = dd
                  best = d
                }
              })
              return best as RailItem | null
            }

            // The whole gutter is the hit area, not just the labels.
            g.append('rect')
              .attr('class', 'rank-rail-hit')
              .attr('x', side === 'start' ? -RAIL_W + 6 : -6)
              .attr('y', -8)
              .attr('width', RAIL_W)
              .attr('height', height + 16)
              .on('pointerenter pointermove', function (evt: any) {
                const [, my] = pointer(evt, svg.node())
                layout(my)
                const hit = nearest(my)
                if (hit) {
                  // Park the card just inside the plot, clear of the rail so
                  // the magnified numbers stay readable under it.
                  handleHover({
                    crypto: hit.crypto,
                    // hover.x is in <svg> space, i.e. includes the 44px gutter.
                    x: side === 'start' ? 44 + 12 : width + 44 - 250,
                    y: Math.min(height - 10, Math.max(80, hit.y)),
                  })
                }
              })
              .on('pointerleave', () => {
                layout(null)
                handleHover(null)
              })
              .on('click', function (evt: any) {
                const [, my] = pointer(evt, svg.node())
                const hit = nearest(my)
                if (hit) onToggleHighlight(hit.crypto.id)
              })
          }

          drawRail('start')
          drawRail('end')
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
          <p className="mt-1.5 text-[0.9em] text-muted-foreground/80">
            {highlightedIds.has(hover.crypto.id)
              ? 'Highlighted · click to release'
              : 'Click to highlight'}
          </p>
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
