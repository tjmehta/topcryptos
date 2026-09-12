import {
  Crypto,
  CryptosMinMaxes,
  NAN_SCORE,
  Quote,
} from '@/modules/processRankings'
import {
  axisBottom,
  axisLeft,
  easeCubicOut,
  line,
  pointer,
  scaleLinear,
  scaleTime,
  select,
  timeFormat,
} from 'd3'
import { percent, trend } from '@/modules/format'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { D3Chart } from '@/components/D3Chart'
import { cn } from '@/lib/utils'

type Hover = { crypto: Crypto; x: number; y: number } | null

const RAIL_SIDES = ['start', 'end'] as const
type RailSide = (typeof RAIL_SIDES)[number]
/** What a drawn rail exposes to React: call out one coin's rank, or clear it. */
type RailApi = { mark: (id: string | null) => void }

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
  /*
   * The rank rails are drawn inside the d3 render closure but need driving
   * from React: any active coin (line hover, table hover, keyboard focus)
   * gets its rank called out on both rails. Each rail registers its API here;
   * `scrubbing` names the rail the pointer is currently on, whose own lens
   * must not be overwritten by the callout.
   */
  const railsRef = useRef<Partial<Record<RailSide, RailApi>>>({})
  const scrubbingRef = useRef<RailSide | null>(null)

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
  // Track the actual immutable data, not just its length. Exchange changes
  // can replace every coin while the responsive series cap stays unchanged;
  // new quotes and scales also need a redraw even when coin IDs stay the same.
  const renderKey = useMemo(
    () => ({ drawn, minMaxes, points, highlightedIds, hiddenIds }),
    [drawn, minMaxes, points, highlightedIds, hiddenIds],
  )

  // A tooltip from the previous exchange/window must not linger over new data.
  useEffect(() => {
    scrubbingRef.current = null
    handleHover(null)
  }, [cryptos, minMaxes, points, handleHover])

  useEffect(() => {
    if (figureRef.current == null) return
    select(figureRef.current)
      .selectAll<SVGPathElement, Crypto>('path.rank-line')
      .classed('is-active', (c) => c.id === activeCryptoId)
    for (const side of RAIL_SIDES) {
      if (scrubbingRef.current === side) continue
      railsRef.current[side]?.mark(activeCryptoId)
    }
  }, [activeCryptoId, renderKey])

  return (
    <figure ref={figureRef} className="relative m-0">
      <D3Chart renderKey={renderKey} aspect={0.78} minHeight={280}>
        {(svg, height, width, margin) => {
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
            .attr('class', 'axis axis-y')
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
           * so at rest they collapse to a faint tick strip and a lens follows
           * the pointer: the coin under it gets the big label, its neighbours
           * step down in tiers (the macOS dock / iOS index bar). Dragging a
           * finger along the rail does the same, so touch gets it too.
           *
           * Whichever way a coin becomes active — scrubbing a rail, hovering
           * its line, hovering its table row — the *other* rail calls out that
           * coin's rank there, so a hover always shows where the coin started
           * and where it ended. Only the rail under the pointer opens the full
           * lens; the callout is a single label, because the lens is a pointer
           * affordance and the far side has no pointer.
           */
          const RAIL_INSET = 6 // gap between the plot edge and the rail
          const TICK_LEN = 4
          /*
           * The lens is deliberately small. An iOS index bar magnifies the
           * one letter under your finger; a chart crosshair shows one axis
           * value. Nineteen stacked numbers read as a wall — and since ranks
           * are consecutive, "173 is next to 172" tells nobody anything. So:
           * the focused rank sits in a pill (the same pill the far rail uses
           * to call the coin out), flanked by two faint neighbours a side that
           * give the scrub its dock feel without competing with the pill.
           */
          const PILL_FONT = 13
          const PILL_H = 20
          const PILL_PAD = 6
          const GAP = 2 // between stacked labels
          const NEIGHBOURS = [
            { size: 10.5, k: 0.55, alpha: 0.7 },
            { size: 9, k: 0.2, alpha: 0.4 },
          ]
          const REACH = NEIGHBOURS.length
          /*
           * Labels bend *outward*, away from the plot, so the lens never sits
           * on top of the lines it is indexing. Each label swings out in
           * proportion to its tier and a leader runs from its true position on
           * the axis to where it now sits. The swing is whatever the gutter has
           * left after the pill — ~12px on desktop, nothing on a phone, where
           * the leaders simply run straight.
           */
          const pillWidth = (text: string) => text.length * PILL_FONT * 0.62 + PILL_PAD * 2
          const restX = TICK_LEN + 2
          const BULGE = Math.max(
            0,
            Math.min(12, margin.left - RAIL_INSET - restX - pillWidth(String(axisMax))),
          )
          const reduceMotion =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

          type RailItem = { crypto: Crypto; rank: number; y: number; i: number }
          const railItems = (side: RailSide): RailItem[] =>
            drawn
              .map((c) => {
                const q = side === 'start' ? c.quotes[0] : c.quotes[c.quotes.length - 1]
                const rank = q?.rankByMarketCap
                return rank == null ? null : { crypto: c, rank, y: yScale(rank) }
              })
              .filter((v): v is Omit<RailItem, 'i'> => v != null)
              .sort((a, b) => a.y - b.y || a.rank - b.rank)
              .map((d, i) => ({ ...d, i }))

          // The y-axis numbers share the left gutter; fade them while it is in use.
          const dimAxis = (on: boolean) =>
            svg.selectAll('.axis-y text').style('opacity', () => (on ? 0.12 : null))

          type Slot = { y: number; k: number; size: number; alpha: number }
          type Focus = { item: RailItem; y: number }

          const drawRail = (side: RailSide): RailApi => {
            const items = railItems(side)
            const out = side === 'start' ? -1 : 1 // away from the plot
            const g = svg
              .append('g')
              .attr('class', `rank-rail rank-rail-${side}`)
              .attr('transform', `translate(${side === 'start' ? -RAIL_INSET : width + RAIL_INSET}, 0)`)

            const leaders = g
              .selectAll('line')
              .data(items)
              .join('line')
              .attr('class', 'rank-rail-tick')
              .attr('x1', 0)
              .attr('y1', (d) => d.y)
              .attr('x2', out * TICK_LEN)
              .attr('y2', (d) => d.y)
              .style('stroke', (d) => strokeFor(d.crypto))

            const labels = g
              .selectAll('text')
              .data(items)
              .join('text')
              .attr('class', 'rank-rail-label')
              .attr('text-anchor', side === 'start' ? 'end' : 'start')
              .attr('dominant-baseline', 'middle')
              .attr('transform', (d) => `translate(${out * restX}, ${d.y})`)
              .style('font-size', `${NEIGHBOURS[REACH - 1].size}px`)
              .style('opacity', 0)
              .text((d) => d.rank)

            // One pill per rail; it moves to whichever rank is focused.
            const pill = g.append('g').attr('class', 'rank-rail-pill').style('opacity', 0)
            const pillRect = pill
              .append('rect')
              .attr('rx', PILL_H / 2)
              .attr('height', PILL_H)
              .attr('y', -PILL_H / 2)
            const pillText = pill
              .append('text')
              .attr('dominant-baseline', 'central')
              .attr('text-anchor', 'middle')
              .style('font-size', `${PILL_FONT}px`)
            let pillShown = false

            /*
             * Only the labels entering or leaving the lens are touched on each
             * move — restyling all 500 per pointer event is what makes rails
             * like this stutter. Short d3 transitions (interruptible, and they
             * start from the on-screen value, so a fast scrub just retargets)
             * make the stack glide rather than snap; closing is quicker than
             * opening, as a release should be.
             */
            let lit = new Set<number>()
            let prevFocus = -1
            const render = (focus: Focus | null, slots: Map<number, Slot>, ms: number) => {
              // The focused item's own label goes to rest under the pill; its
              // leader is the one thing the pill leaves behind, so the last
              // focus is always revisited to retract it.
              const touched = new Set([...lit, ...slots.keys()])
              if (prevFocus >= 0) touched.add(prevFocus)
              prevFocus = focus?.item.i ?? -1
              lit = new Set(slots.keys())
              const dur = reduceMotion ? 0 : ms
              const slot = (d: RailItem) => slots.get(d.i)

              labels
                .filter((d) => touched.has(d.i))
                .transition('lens')
                .duration(dur)
                .ease(easeCubicOut)
                .attr('transform', (d) => {
                  const s = slot(d)
                  return s
                    ? `translate(${out * (restX + BULGE * s.k)}, ${s.y})`
                    : `translate(${out * restX}, ${d.y})`
                })
                .style('font-size', (d) => `${slot(d)?.size ?? NEIGHBOURS[REACH - 1].size}px`)
                .style('opacity', (d) => slot(d)?.alpha ?? 0)

              const hitLeaders = leaders.filter(
                (d) => touched.has(d.i) || d.i === focus?.item.i,
              )
              hitLeaders.style('stroke', (d) =>
                focus?.item.i === d.i ? 'var(--active)' : strokeFor(d.crypto),
              )
              hitLeaders
                .transition('lens')
                .duration(dur)
                .ease(easeCubicOut)
                .attr('x2', (d) =>
                  focus?.item.i === d.i
                    ? out * (restX + BULGE - 1)
                    : out * (TICK_LEN + BULGE * (slot(d)?.k ?? 0)),
                )
                .attr('y2', (d) => (focus?.item.i === d.i ? focus.y : (slot(d)?.y ?? d.y)))
                .style('opacity', (d) => {
                  if (focus?.item.i === d.i) return 1
                  const s = slot(d)
                  return s ? 0.45 + 0.55 * s.k : 0.35
                })

              if (focus) {
                const text = String(focus.item.rank)
                const w = pillWidth(text)
                pillText.text(text)
                pillRect.attr('width', w).attr('x', side === 'start' ? -w : 0)
                pillText.attr('x', side === 'start' ? -w / 2 : w / 2)
                const target = `translate(${out * (restX + BULGE)}, ${focus.y})`
                // A pill arriving from nowhere snaps into place; one that is
                // already open glides to the next rank.
                if (!pillShown) pill.attr('transform', target)
                pillShown = true
                pill
                  .transition('lens')
                  .duration(dur)
                  .ease(easeCubicOut)
                  .attr('transform', target)
                  .style('opacity', 1)
              } else if (pillShown) {
                pillShown = false
                pill.transition('lens').duration(dur).ease(easeCubicOut).style('opacity', 0)
              }
            }

            const nearestIndex = (y: number) => {
              let best = -1
              let bestD = Infinity
              items.forEach((d, i) => {
                const dd = Math.abs(d.y - y)
                if (dd < bestD) {
                  bestD = dd
                  best = i
                }
              })
              return best
            }

            // A pill may ride into the top margin (it is exactly half a pill
            // tall) but never into the date axis below the plot.
            const clampY = (y: number) =>
              Math.min(height - PILL_H / 2, Math.max(-margin.top + PILL_H / 2, y))

            const close = () => {
              render(null, new Map(), 80)
              if (side === 'start') dimAxis(false)
            }

            /*
             * The dock layout: the focused rank's pill sits under the pointer,
             * neighbours stack outward from it, each a gap past the previous
             * one, so labels never overlap however dense the rail is. At the
             * ends of the rail the whole stack is nudged back inside the plot
             * rather than spilling over the top or into the date axis — the
             * pill drifts off the pointer a few px there, which reads as the
             * rail resisting at its boundary.
             */
            const lens = (f: number, pointerY: number) => {
              const item = items[f]
              if (item == null) return
              const first = items[0].y
              const last = items[items.length - 1].y
              let focusY = Math.min(last, Math.max(first, pointerY))
              const slots = new Map<number, Slot>()
              let top = focusY - PILL_H / 2
              let bottom = focusY + PILL_H / 2
              let up = focusY
              let down = focusY
              for (let d = 1; d <= REACH; d++) {
                const t = NEIGHBOURS[d - 1]
                const prev = d === 1 ? PILL_H : NEIGHBOURS[d - 2].size
                const step = (prev + t.size) / 2 + GAP
                if (f - d >= 0) {
                  up -= step
                  slots.set(f - d, { y: up, ...t })
                  top = up - t.size / 2
                }
                if (f + d < items.length) {
                  down += step
                  slots.set(f + d, { y: down, ...t })
                  bottom = down + t.size / 2
                }
              }
              const shift =
                top < -margin.top ? -margin.top - top : bottom > height ? height - bottom : 0
              if (shift !== 0) {
                focusY += shift
                slots.forEach((s) => (s.y += shift))
              }
              render({ item, y: focusY }, slots, 100)
              if (side === 'start') dimAxis(true)
            }

            // A single pill for one coin: the far-rail callout.
            const mark = (id: string | null) => {
              const item = id == null ? undefined : items.find((d) => d.crypto.id === id)
              if (item == null) {
                close()
                return
              }
              render({ item, y: clampY(item.y) }, new Map(), 120)
              if (side === 'start') dimAxis(true)
            }

            /*
             * Cursor: which rank the lens is on. The pointer sets it by
             * proximity; the arrow keys step it, which is how a keyboard user
             * walks the rail and how a mouse user nudges to the exact
             * neighbour a hairline-dense strip makes hard to hit. Hovering
             * takes focus so the keys work without a click; a keyboard step
             * then ignores pointer jitter until the mouse really moves.
             */
            let cursor = -1
            let pointerInside = false
            let pointerY = NaN
            let keyed = false // last move came from the keyboard
            const goTo = (f: number, y = items[f]?.y) => {
              if (f < 0 || f >= items.length) return
              cursor = f
              lens(f, y)
              // Park the card just inside the plot, clear of the rail so the
              // pill stays readable under it.
              handleHover({
                crypto: items[f].crypto,
                // hover.x is in <svg> space, i.e. includes the gutter.
                x: side === 'start' ? margin.left + 80 : width + margin.left - 320,
                y: Math.min(height - 10, Math.max(80, items[f].y)),
              })
            }
            const leave = () => {
              cursor = -1
              close()
              handleHover(null)
            }

            // The whole gutter is the hit area, not just the labels.
            const hit = g
              .append('rect')
              .attr('class', 'rank-rail-hit')
              .attr('x', side === 'start' ? -margin.left + RAIL_INSET : -RAIL_INSET)
              .attr('y', -8)
              .attr('width', margin.left)
              .attr('height', height + 16)
              .attr('tabindex', 0)
              .attr('role', 'slider')
              .attr('aria-orientation', 'vertical')
              .attr('aria-valuemin', 1)
              .attr('aria-valuemax', axisMax)
              .attr(
                'aria-label',
                side === 'start' ? 'Rank at start of window' : 'Rank at end of window',
              )
            const announce = () => {
              const item = items[cursor]
              hit
                .attr('aria-valuenow', item?.rank ?? null)
                .attr('aria-valuetext', item ? `${item.crypto.name}, rank ${item.rank}` : null)
            }

            hit
              .on('pointerenter pointermove', function (evt: any) {
                const [, my] = pointer(evt, svg.node())
                pointerInside = true
                scrubbingRef.current = side
                if (keyed && Number.isFinite(pointerY) && Math.abs(my - pointerY) < 4) return
                keyed = false
                pointerY = my
                ;(this as SVGRectElement).focus({ preventScroll: true })
                goTo(nearestIndex(my), my)
                announce()
              })
              .on('pointerleave', function () {
                pointerInside = false
                pointerY = NaN
                scrubbingRef.current = null
                leave()
                ;(this as SVGRectElement).blur()
              })
              .on('focus', () => {
                if (pointerInside || cursor >= 0) return
                scrubbingRef.current = side
                goTo(0)
                announce()
              })
              .on('blur', () => {
                if (pointerInside) return
                scrubbingRef.current = null
                leave()
              })
              .on('keydown', (evt: KeyboardEvent) => {
                const step =
                  evt.key === 'ArrowUp' || evt.key === 'ArrowLeft'
                    ? -1
                    : evt.key === 'ArrowDown' || evt.key === 'ArrowRight'
                      ? 1
                      : 0
                if (step !== 0) {
                  evt.preventDefault()
                  keyed = true
                  goTo(cursor < 0 ? (step > 0 ? 0 : items.length - 1) : cursor + step)
                } else if (evt.key === 'Home' || evt.key === 'End') {
                  evt.preventDefault()
                  keyed = true
                  goTo(evt.key === 'Home' ? 0 : items.length - 1)
                } else if (evt.key === 'Enter' || evt.key === ' ') {
                  evt.preventDefault()
                  if (cursor >= 0) onToggleHighlight(items[cursor].crypto.id)
                } else if (evt.key === 'Escape') {
                  ;(evt.currentTarget as SVGRectElement).blur()
                } else {
                  return
                }
                announce()
              })
              .on('click', function (evt: any) {
                const [, my] = pointer(evt, svg.node())
                const f = cursor >= 0 ? cursor : nearestIndex(my)
                if (f >= 0) onToggleHighlight(items[f].crypto.id)
              })

            return { mark }
          }

          for (const side of RAIL_SIDES) {
            railsRef.current[side] = drawRail(side)
          }
        }}
      </D3Chart>

      {hover && (
        <div
          role="tooltip"
          className="rank-tip pointer-events-none absolute z-20 max-w-[15rem] rounded-md border border-border bg-popover/95 px-2.5 py-2 text-xs shadow-xl backdrop-blur"
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
