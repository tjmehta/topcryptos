export function padLeft(str: string, len: number, char: string) {
  let out = str

  while (out.length < len) {
    out = char + out
  }

  return out
}
