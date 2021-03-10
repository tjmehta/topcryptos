import { padLeft } from './padLeft'

export function zeroPadLeft(str: string, len: number) {
  return padLeft(str, len, '0')
}
