import { Selection, select } from 'd3'
import { useEffect, useRef, useState } from 'react'

export function D3Chart({
  children,
  renderKey,
}: {
  children: (
    svg: Selection<SVGElement, unknown, null, undefined>,
    height: number,
    width: number,
  ) => unknown
  renderKey: {}
}) {
  const ref = useRef<SVGSVGElement | null>(null)
  const [height, setHeight] = useState<number>(1536)
  const [width, setWidth] = useState<number>(1536)

  useEffect(() => {
    if (ref.current == null) return
    const margin = { top: 10, right: 10, bottom: 40, left: 40 }
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    if (ref.current?.childNodes[0]) {
      ref.current?.removeChild(ref.current?.childNodes[0])
    }

    const svg = select(ref.current)
      .attr('width', width)
      .attr('height', height)
      .call(responsivefy)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)

    children(svg, chartHeight, chartWidth)
  }, [ref.current, height, width, renderKey])

  function responsivefy(
    svg: Selection<
      HTMLDivElement | SVGElement,
      unknown,
      HTMLDivElement,
      unknown
    >,
  ) {
    // get container + svg aspect ratio
    const container = select(svg.node().parentNode)
    const width = parseInt(svg.style('width'))
    const height = parseInt(svg.style('height'))
    const aspect = width / height
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
      const _width = Math.min(
        parseInt(container.style('width'), 10),
        Math.round(window.innerHeight * 0.75),
      )
      const targetWidth = _width
      const targetHeight = Math.round(targetWidth / aspect)
      svg.attr('width', targetWidth)
      svg.attr('height', targetHeight)
      setWidth(targetWidth)
      setHeight(targetHeight)
    }
    resize()
  }

  return <svg ref={ref} className="chart" />
}
