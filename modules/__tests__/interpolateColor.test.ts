import { Color } from '../Color'
import { interpolateColor } from '../interpolateColor'

describe('interpolateColor', () => {
  it('should interpolate', () => {
    expect(
      interpolateColor({
        start: new Color(0, 0, 0),
        end: new Color(255, 0, 0),
        steps: 5000,
        count: 1000,
      }).toHexCode(),
    ).toMatchInlineSnapshot(`"#330000"`)
  })
})
