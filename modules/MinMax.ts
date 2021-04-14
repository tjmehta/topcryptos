export class MinMaxState<T> {
  min: T
  max: T
  private comparator: (a: T, b: T) => -1 | 1 | 0

  constructor(init?: T, comparator?: (a: T, b: T) => -1 | 1 | 0) {
    this.comparator = comparator ?? ((a, b) => (a > b ? -1 : a < b ? 1 : 0))
    if (init == null) return
    this.min = init
    this.max = init
  }

  compare(val: T) {
    const result1 = this.min == null ? -1 : this.comparator(this.min, val)
    if (result1 === -1) this.min = val

    const result2 = this.max == null ? 1 : this.comparator(this.max, val)
    if (result2 === 1) this.max = val
  }
}

export function getMinMax<V, T>(
  arr: Array<V>,
  opts: { pick: (a: V) => T; comparator?: (a: T, b: T) => -1 | 1 | 0 },
) {
  const minMaxState = new MinMaxState(opts.pick(arr[0]), opts.comparator)
  arr.forEach((item) => {
    minMaxState.compare(opts.pick(item))
  })

  return {
    min: minMaxState.min,
    max: minMaxState.max,
  }
}
