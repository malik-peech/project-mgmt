'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// SWR-like hook: serve stale data from localStorage instantly, revalidate in background

type UseDataOptions = {
  /** localStorage cache key */
  key: string
  /** Time in ms before cached data is considered stale (default: 30s) */
  staleTime?: number
  /** Skip fetching (e.g. when session not ready) */
  enabled?: boolean
}

type UseDataReturn<T> = {
  data: T | null
  loading: boolean
  revalidating: boolean
  error: Error | null
  mutate: (updater: T | ((prev: T | null) => T | null)) => void
  revalidate: () => Promise<void>
}

function readCache<T>(key: string): { data: T; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(`swr:${key}`)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`swr:${key}`, JSON.stringify({ data, timestamp: Date.now() }))
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

export function useData<T>(
  url: string | null,
  options: UseDataOptions
): UseDataReturn<T> {
  const { key, staleTime = 30_000, enabled = true } = options

  const [data, setData] = useState<T | null>(() => {
    if (typeof window === 'undefined') return null
    const cached = readCache<T>(key)
    return cached?.data ?? null
  })
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return readCache<T>(key) === null
  })
  const [revalidating, setRevalidating] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const revalidate = useCallback(async () => {
    if (!url || !enabled) return

    // Abort any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setRevalidating(true)

    // Retry up to 2 times with backoff
    let lastErr: Error | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`HTTP ${res.status}`)
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const freshData = await res.json()
        setData(freshData)
        writeCache(key, freshData)
        setError(null)
        lastErr = null
        break
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        lastErr = err instanceof Error ? err : new Error(String(err))
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        }
      }
    }

    if (lastErr) setError(lastErr)
    setRevalidating(false)
    setLoading(false)
  }, [url, key, enabled])

  // On mount: serve cached data, then revalidate if stale
  useEffect(() => {
    if (!enabled || !url) return

    const cached = readCache<T>(key)
    if (cached) {
      setData(cached.data)
      setLoading(false)
      // Revalidate in background if stale
      if (Date.now() - cached.timestamp > staleTime) {
        revalidate()
      }
    } else {
      setLoading(true)
      revalidate()
    }

    return () => {
      abortRef.current?.abort()
    }
  }, [url, key, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const mutate = useCallback(
    (updater: T | ((prev: T | null) => T | null)) => {
      setData((prev) => {
        const next = typeof updater === 'function' ? (updater as (prev: T | null) => T | null)(prev) : updater
        if (next !== null) writeCache(key, next)
        return next
      })
    },
    [key]
  )

  return { data, loading, revalidating, error, mutate, revalidate }
}
