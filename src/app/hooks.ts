import { useCallback, useEffect, useState } from 'preact/hooks'

/**
 * The current hash route, e.g. `#/videos/BV1xx` → `/videos/BV1xx`.
 *
 * Hash rather than a router: this page is loaded from a `chrome-extension://`
 * URL with no server behind it, so a path-based route would 404 on reload.
 */
export function useRoute(): string {
  const read = () => location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(read)

  useEffect(() => {
    const onChange = () => setRoute(read())
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export function navigate(route: string): void {
  location.hash = route
}

export interface Async<T> {
  data: T | null
  loading: boolean
  reload: () => void
}

/**
 * Runs an async read and re-runs it on demand.
 *
 * `load` is expected to be stable — wrap it in `useCallback` at the call site
 * if it closes over anything. A result arriving after the inputs changed is
 * dropped rather than rendered, so switching screens quickly can't leave the
 * previous screen's data on the new one.
 */
export function useAsync<T>(load: () => Promise<T>): Async<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    setLoading(true)
    load().then(
      (result) => {
        if (!live) return
        setData(result)
        setLoading(false)
      },
      (e: unknown) => {
        if (!live) return
        console.warn('[bb-subsgen] app read failed', e)
        setLoading(false)
      },
    )
    return () => {
      live = false
    }
  }, [load, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, loading, reload }
}
