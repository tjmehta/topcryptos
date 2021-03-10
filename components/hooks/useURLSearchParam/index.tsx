import { useRouter } from 'next/router'
import { useState } from 'react'

type Value = string | string[]

const isServer = typeof window === 'undefined'
const qs = new URLSearchParams(isServer ? '' : window.location.search.slice(1))

export default function useURLSearchParam<T>(
  key: string,
  parse?: (val: string | string[]) => T,
): [T, (val: T) => void] {
  const router = useRouter()
  const [value, setValue] = useState<T>(parse(router.query[key] ?? qs.get(key)))

  const setURLSearchParam = (val: T) => {
    if (val === value) return
    // TODO: update url
    setValue(val)
  }

  return [value, setURLSearchParam]
}
