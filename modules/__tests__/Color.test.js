import { Color } from '../Color'

describe('Color', () => {
  it('should create a color', () => {
    const c = new Color(255, 200, 100)
    expect(c.r).toMatchInlineSnapshot(`255`)
    expect(c.g).toMatchInlineSnapshot(`200`)
    expect(c.b).toMatchInlineSnapshot(`100`)
  })

  it('should convert color to hex code', () => {
    const c1 = new Color(255, 255, 255)
    expect(c1.toHexCode()).toMatchInlineSnapshot(`"#ffffff"`)
    const c2 = new Color(16, 255, 16)
    expect(c2.toHexCode()).toMatchInlineSnapshot(`"#10ff10"`)
    const c3 = new Color(0, 0, 0)
    expect(c3.toHexCode()).toMatchInlineSnapshot(`"#000000"`)
  })
})
