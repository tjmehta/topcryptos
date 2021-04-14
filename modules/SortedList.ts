import Doubly from 'doubly'
import Node from 'doubly/dist/cjs/Node'

export default class SortedList<T> extends Doubly<T> {
  private comparator: (a: T, b: T) => -1 | 1 | 0

  constructor(opts?: {
    head?: Node<T>
    comparator: (a: T, b: T) => -1 | 1 | 0
  }) {
    super(opts)
    this.comparator = opts.comparator
  }
  add(newValue: T) {
    let node: Node<T> | null = null
    let index = -1
    let i = 0
    for (let n of this.nodes()) {
      const sort = this.comparator(n.value, newValue)
      if (sort === -1 || sort === 0) {
        node = n
        index = i
        break
      }
      i++
    }
    if (index === 0) {
      // @ts-ignore
      // console.log('unshift!', newValue.score, this.head?.value.score)
      this.unshift(newValue)
      return
    }
    if (index < 0) {
      // @ts-ignore
      // console.log('push!', newValue.score, this.tail?.value.score)
      this.push(newValue)
      return
    }
    // @ts-ignore
    // console.log('insert!', newValue.score, node.value.score)
    const prev = node.prev
    const next = node
    const newNode = new Node(newValue, {
      prev,
      next,
    })
    if (!prev) debugger
    prev.next = newNode
    node.prev = newNode
  }
}
