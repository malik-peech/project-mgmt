'use client'

import { useCallback, useEffect, useState } from 'react'

export type ColumnWidths<K extends string> = Record<K, number>

/**
 * Column-resize hook. Persists widths in localStorage so the user's
 * preferences stick between reloads.
 *
 * Usage:
 *   const { widths, startResize } = useColumnWidths('cogs.columns', {
 *     projet: 260, ressource: 160, ... // defaults (px)
 *   })
 *   <ResizeHandle onMouseDown={(e) => startResize('projet', e)} />
 */
export function useColumnWidths<K extends string>(
  key: string,
  defaults: ColumnWidths<K>,
  options?: { min?: number; max?: number },
): {
  widths: ColumnWidths<K>
  startResize: (col: K, e: React.MouseEvent) => void
  resetWidths: () => void
} {
  const min = options?.min ?? 60
  const max = options?.max ?? 800

  const [widths, setWidths] = useState<ColumnWidths<K>>(() => {
    if (typeof window === 'undefined') return defaults
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return defaults
      const parsed = JSON.parse(raw) as Partial<ColumnWidths<K>>
      const merged = { ...defaults }
      for (const k of Object.keys(parsed) as K[]) {
        const v = parsed[k]
        if (typeof v === 'number' && v >= min && v <= max) merged[k] = v
      }
      return merged
    } catch {
      return defaults
    }
  })

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(widths))
    } catch {
      /* ignore */
    }
  }, [key, widths])

  const startResize = useCallback(
    (col: K, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startW = widths[col]

      // Keep the cursor nice even when the pointer leaves the handle
      const prevUserSelect = document.body.style.userSelect
      const prevCursor = document.body.style.cursor
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'

      const onMove = (ev: MouseEvent) => {
        const next = Math.max(min, Math.min(max, startW + (ev.clientX - startX)))
        setWidths((w) => (w[col] === next ? w : { ...w, [col]: next }))
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        document.body.style.userSelect = prevUserSelect
        document.body.style.cursor = prevCursor
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [widths, min, max],
  )

  const resetWidths = useCallback(() => setWidths(defaults), [defaults])

  return { widths, startResize, resetWidths }
}
