export default class SortedList<T> {
  private readonly comparator: (a: T, b: T) => -1 | 1 | 0
  private readonly items: T[]

  constructor(opts: { comparator: (a: T, b: T) => -1 | 1 | 0 }) {
    this.comparator = opts.comparator
    this.items = []
  }

  add(newValue: T) {
    // find first index where existing item is strictly less than or equal to newValue
    let insertIndex = -1
    for (let i = 0; i < this.items.length; i++) {
      const compare = this.comparator(this.items[i], newValue)
      if (compare === -1 || compare === 0) {
        insertIndex = i
        break
      }
    }
    if (insertIndex === 0) {
      this.items.unshift(newValue)
      return
    }
    if (insertIndex < 0) {
      this.items.push(newValue)
      return
    }
    this.items.splice(insertIndex, 0, newValue)
  }

  indexOf(value: T): number {
    return this.items.indexOf(value)
  }

  forEach(cb: (value: T, index: number) => void) {
    for (let i = 0; i < this.items.length; i++) {
      cb(this.items[i], i)
    }
  }
}
