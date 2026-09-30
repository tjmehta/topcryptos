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
    // Syncs state from an external store (the URL) once it becomes
    // available after hydration; not derivable during render without
    // desyncing server/client markup (see comment above).
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // `router.query` is a new object every render, so it has to be
    // stringified to compare by value; depending on the object itself would
    // make this callback identity change every render, and depending on
    // individual keys isn't possible since the query shape varies by page.
    // `router` and `serialize` are intentionally omitted too: `router` is
    // stable across renders from `useRouter()` and including it would add
    // nothing, and `serialize` is typically an inline arrow at the call
    // site, so depending on it would recreate this callback (and re-trigger
    // consumers) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
    [router.isReady, router.pathname, JSON.stringify(router.query), key],
  )

  return [value, setURLSearchParam]
}
