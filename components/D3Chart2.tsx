import { Axis, AxisScale, Selection, ValueFn, select } from 'd3'
import { useEffect, useRef } from 'react'

export function D3Chart<T, X, Y>({
  data,
  getAxes,
  getLine,
}: {
  data: T[][]
  getAxes: (data: T[][]) => [Axis<X>, Axis<Y>]
  getLine: (
    xScale: AxisScale<X>,
    yScale: AxisScale<Y>,
  ) => ValueFn<SVGPathElement, T[], string | number | boolean>
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (ref.current == null) return
    const margin = { top: 10, right: 20, bottom: 60, left: 50 }
    const width = 1300 - margin.left - margin.right
    const height = 1080 - margin.top - margin.bottom
    const fullWidth = width + margin.left + margin.right
    const fullHeight = height + margin.top + margin.bottom

    const svg = select(ref.current)
      .append('svg')
      .attr('width', fullWidth)
      .attr('height', fullHeight)
      .call(responsivefy)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)

    // add axes
    const axes = getAxes(data)
    axes.forEach((axis) => {
      svg.call(axis)
    })
    const xScale = axes[0].scale()
    const yScale = axes[1].scale()

    // draw lines
    svg
      .selectAll('.line')
      .data<T[]>(data)
      .enter()
      .append('path')
      .attr('class', 'line')
      .attr('d', getLine(xScale, yScale))
      .style('stroke', (arr, index) => {
        return '#00b300'
      })
      .style('stroke-width', (arr, index) => {
        return 1
      })
      .style('opacity', (arr, index) => {
        return 1
      })
  }, [ref.current])

  return <div ref={ref} className="chart" />
}

function responsivefy(
  svg: Selection<HTMLDivElement | SVGElement, unknown, HTMLDivElement, unknown>,
) {
  // get container + svg aspect ratio
  var container = select(svg.node().parentNode),
    width = parseInt(svg.style('width')),
    height = parseInt(svg.style('height')),
    aspect = 1
  // add viewBox and preserveAspectRatio properties,
  // and call resize so that svg resizes on inital page load
  svg
    .attr('viewBox', '0 0 ' + width + ' ' + height)
    .attr('preserveAspectRatio', 'xMinYMid')
    .call(resize)
  // to register multiple listeners for same event type,
  // you need to add namespace, i.e., 'click.foo'
  // necessary if you call invoke this function for multiple svgs
  // api docs: https://github.com/mbostock/d3/wiki/Selections#on
  select(window).on('resize.' + container.attr('id'), resize)
  // get width of container and resize svg to fit it
  function resize() {
    var targetWidth = parseInt(container.style('width'))
    svg.attr('width', Math.round(targetWidth / aspect))
    svg.attr('height', targetWidth / aspect)
  }
  resize()
}
