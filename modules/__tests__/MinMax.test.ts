import { MinMaxState } from '../MinMax'

describe('MinMax', () => {
  it('should find min', async () => {
    const arr = [1, 4, 532, 4324, 2, 243235, 5, 3, 24, 324, 32]
    const minMax = new MinMaxState(arr[0])
    arr.forEach((num) => minMax.compare(num))
    expect(minMax.min).toMatchInlineSnapshot(`1`)
    expect(minMax.max).toMatchInlineSnapshot(`243235`)
  })
})
