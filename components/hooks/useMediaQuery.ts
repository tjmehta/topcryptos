import { useEffect, useState } from 'react'

/**
 * Subscribe to a media query.
 *
 * Starts `false` on the server and adopts the real value after mount, so the
 * markup Next renders and the markup React hydrates always agree.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return matches
}
