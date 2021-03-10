import { interpolate } from '../interpolate'

describe('interpolate', () => {
  it('should interpolate', () => {
    expect(
      interpolate({
        start: 0,
        end: 255,
        steps: 5000,
        count: 1000,
      }),
    ).toMatchInlineSnapshot(`51`)
  })
})
