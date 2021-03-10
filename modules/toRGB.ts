export function strToRGB(str: string): string {
  // java String#hashCode
  var hash = 0
  for (var i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return intToRGB(hash)
}

export function intToRGB(i: number): string {
  var c = (i & 0x00ffffff).toString(16).toUpperCase()

  return '#' + ('00000'.substring(0, 6 - c.length) + c)
}
