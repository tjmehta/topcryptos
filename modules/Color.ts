import { zeroPadLeft } from './zeroPadLeft'

export class Color {
  r: number
  g: number
  b: number

  constructor(red: number, green: number, blue: number) {
    this.r = red
    this.g = green
    this.b = blue
  }

  toHexCode() {
    const redHex = zeroPadLeft(this.r.toString(16), 2)
    const greenHex = zeroPadLeft(this.g.toString(16), 2)
    const blueHex = zeroPadLeft(this.b.toString(16), 2)
    return `#${redHex}${greenHex}${blueHex}`
  }
}
