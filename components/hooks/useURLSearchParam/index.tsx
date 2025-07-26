import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'

type Value = string | string[]

export default function useURLSearchParam<T>(
  key: string,
  parse?: (val: string | string[]) => T,
): [T, (val: T) => void] {
  const router = useRouter()
  const [value, setValue] = useState<T>(() => {
    // Initialize with router query only (SSR-safe)
    const routerValue = router.query[key]
    if (parse && routerValue !== undefined) {
      return parse(routerValue)
    }
    return (routerValue ?? '') as T
  })

  useEffect(() => {
    // On client side, also check URL search params
    if (typeof window !== 'undefined') {
      const qs = new URLSearchParams(window.location.search.slice(1))
      const urlValue = qs.get(key)
      const routerValue = router.query[key]
      
      if (urlValue && !routerValue) {
        const parsedValue = parse ? parse(urlValue) : (urlValue as T)
        setValue(parsedValue)
      }
    }
  }, [key, parse, router.query])

  const setURLSearchParam = (val: T) => {
    if (val === value) return
    // TODO: update url
    setValue(val)
  }

  return [value, setURLSearchParam]
}
