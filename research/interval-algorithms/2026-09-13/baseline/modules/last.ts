export function last<T>(arr: Array<T>): T | undefined {
  if (arr.length === 0) return
  return arr[arr.length - 1]
}
