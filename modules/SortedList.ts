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
  add(val: T) {
    let inserted = false
    const newNode = new Node<T>(val)

    for (let node of this.nodes()) {
      const sort = this.comparator(node.value, val)
      if (sort === -1 || sort === 0) {
        inserted = true
        node.prev.next = newNode
        newNode.prev = node.prev
        newNode.next = node
      }
    }

    if (!inserted) this.push(val)
  }
}
