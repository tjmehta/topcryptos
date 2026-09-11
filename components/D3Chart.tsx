import { Selection, select } from 'd3'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

export type ChartMargin = { top: number; right: number; bottom: number; left: number }

export type D3ChartRenderer = (
  svg: Selection<SVGGElement, unknown, null, undefined>,
  height: number,
  width: number,
  margin: ChartMargin,
) => unknown

/*
 * Left and right gutters are equal on purpose: both carry a rank rail (see
 * RankingsChart). "500" needs ~40px at 11px mono, and on wider screens the
 * rail lens swings its magnified labels *outward* into the gutter, so it gets
 * room for a 17px "500" plus the swing. Phones keep the narrow gutter — plot
 * width is scarcer than the bend, and a finger covers the label anyway.
 */
const marginFor = (width: number): ChartMargin => {
  const gutter = width < 420 ? 44 : 60
  return { top: 10, right: gutter, bottom: 44, left: gutter }
}

/**
 * Responsive SVG host for imperative d3 rendering.
 *
 * The previous version measured itself by calling `svg.style('width')` from
 * inside the same effect that then called `setWidth`/`setHeight`, and attached
 * a `resize.<container id>` listener to `window` that was never removed — the
 * container had no id, so every mount registered under the same
 * `resize.null` namespace and clobbered the previous one. Sizing now comes from
 * a ResizeObserver on the wrapper, and the observer is torn down on unmount.
 */
export function D3Chart({
  children,
  className,
  renderKey,
  aspect = 1,
  minHeight = 0,
}: {
  children: D3ChartRenderer
  className?: string
  renderKey: string
  /** height / width */
  aspect?: number
  /**
   * Floor for the plot height. Pure aspect sizing collapses the chart on narrow
   * viewports — at 390px wide an 0.78 aspect leaves ~300px total, of which the
   * axes eat a third.
   */
  minHeight?: number
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (wrapper == null) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry == null) return
      const width = Math.floor(entry.contentRect.width)
      if (width <= 0) return
      const height = Math.max(
        minHeight,
        Math.min(Math.round(width * aspect), Math.round(window.innerHeight * 0.8)),
      )
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      )
    })

    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [aspect, minHeight])

  useEffect(() => {
    const node = svgRef.current
    if (node == null || size.width === 0 || size.height === 0) return

    const margin = marginFor(size.width)
    const chartWidth = size.width - margin.left - margin.right
    const chartHeight = size.height - margin.top - margin.bottom
    if (chartWidth <= 0 || chartHeight <= 0) return

    const svg = select(node)
    // d3 owns this subtree, so wipe it wholesale between renders rather than
    // removing only the first child as before (which leaked a <g> per render
    // once more than one existed).
    svg.selectAll('*').remove()

    const root = svg
      .attr('viewBox', `0 0 ${size.width} ${size.height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)

    children(
      root as Selection<SVGGElement, unknown, null, undefined>,
      chartHeight,
      chartWidth,
      margin,
    )
    // `children` is a fresh closure each render; renderKey is the intended
    // signal for when the drawing actually needs to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, renderKey])

  return (
    <div ref={wrapperRef} className="w-full">
      <svg
        ref={svgRef}
        // Lens labels may overshoot the gutter by a pixel or two; let them.
        className={cn('w-full overflow-visible', className)}
        style={{ height: size.height || undefined }}
        role="img"
        aria-label="Cryptocurrency rank over time"
      />
    </div>
  )
}
