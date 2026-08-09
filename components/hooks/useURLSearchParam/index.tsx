import { useCallback, useEffect, useState } from 'react'

import { useRouter } from 'next/router'

/**
 * A query-string-backed piece of state.
 *
 * The previous implementation had a `// TODO: update url` where the write
 * should have been: the setter only touched React state, so the window/exchange
 * selection never reached the address bar and a reload or a shared link always
 * snapped back to the default. It also read `window.location.search` once at
 * module scope, which meant the value was captured at import time and went
 * stale on client-side navigation.
 *
 * Writes go through a shallow `router.replace`, so changing the selection
 * updates the URL without a server round trip or a scroll jump.
 */
export default function useURLSearchParam<T>(
  key: string,
  parse: (val: string | string[] | undefined) => T,
  serialize: (val: T) => string | undefined = (v) =>
    v == null ? undefined : String(v),
): [T, (val: T) => void] {
  const router = useRouter()
  const [value, setValue] = useState<T>(() => parse(undefined))

  // Next populates router.query on the client after hydration, so the initial
  // render has to use the default and adopt the URL value once it lands.
  // Deriving it during render instead would desync server and client markup.
  useEffect(() => {
    if (!router.isReady) return
    setValue(parse(router.query[key] as string | string[] | undefined))
    // `parse` is typically an inline arrow, so depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query[key], key])

  const setURLSearchParam = useCallback(
    (next: T) => {
      setValue(next)
      if (!router.isReady) return

      const query = { ...router.query }
      const serialized = serialize(next)
      if (serialized == null || serialized === '') {
        delete query[key]
      } else {
        query[key] = serialized
      }

      router.replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
        scroll: false,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router.isReady, router.pathname, JSON.stringify(router.query), key],
  )

  return [value, setURLSearchParam]
}
