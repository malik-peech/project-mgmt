/**
 * Canva enrichment loader.
 *
 * Loads the pre-extracted Canva data from `src/data/canva-enrichment.json`
 * (produced by the extraction agent) and exposes a Map<vimeoId, Enrichment>
 * so the references store can merge pitch/testimonial/canvaPageUrl onto each
 * Reference at sync time.
 *
 * The JSON is committed in the repo and shipped with the build. To refresh it,
 * re-run the extraction (currently a dev-time agent task — future PR will wire
 * it to an admin route calling Claude directly).
 */

import fs from 'node:fs'
import path from 'node:path'

export interface CanvaEnrichmentEntry {
  vimeoId: string
  vimeoUrl: string
  canvaDesignId: string
  canvaDesignTitle: string
  canvaPageIndex: number
  canvaPageUrl: string
  client?: string
  category?: string | null
  pitch?: string
  testimonial?: string | null
}

interface CanvaEnrichmentFile {
  lastExtractedAt?: string
  sources?: { designId: string; designTitle: string; pageCount: number }[]
  entries?: CanvaEnrichmentEntry[]
}

let cached: Map<string, CanvaEnrichmentEntry> | null = null
let meta: { lastExtractedAt?: string; entryCount: number } | null = null

/**
 * Normalize any Vimeo URL to just its numeric ID (as string).
 * Handles forms:
 *   - https://vimeo.com/123456
 *   - https://vimeo.com/123456/abc123?share=copy
 *   - https://vimeo.com/manage/videos/123456
 *   - https://player.vimeo.com/video/123456
 */
export function normalizeVimeoId(url: string | undefined): string | null {
  if (!url) return null
  const patterns = [
    /vimeo\.com\/(?:manage\/videos\/|video\/)?(\d+)/i,
    /player\.vimeo\.com\/video\/(\d+)/i,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m && m[1]) return m[1]
  }
  return null
}

/**
 * Detect placeholder/template entries that slipped through the extraction.
 * Examples: client="Nom du client", pitch="xxxxxxxxx" or "Lorem ipsum".
 */
function isPlaceholder(e: CanvaEnrichmentEntry): boolean {
  const client = (e.client || '').toLowerCase().trim()
  const pitch = (e.pitch || '').toLowerCase().trim()
  if (!client && !pitch) return true
  if (client === 'nom du client' || client === 'client') return true
  if (pitch.startsWith('lorem ipsum')) return true
  if (/^x{5,}$/i.test(pitch.replace(/\s/g, ''))) return true
  // Pitch that's only repetitive placeholder chars
  if (pitch.length >= 5 && /^(.)\1+$/.test(pitch.replace(/\s/g, ''))) return true
  return false
}

function loadOnce(): Map<string, CanvaEnrichmentEntry> {
  if (cached) return cached
  cached = new Map()
  meta = { entryCount: 0 }

  // Resolve path relative to project root. In dev (Next.js) cwd is the project
  // root. In Docker build it should also be /app which contains src/.
  const filePath = path.join(process.cwd(), 'src', 'data', 'canva-enrichment.json')

  try {
    if (!fs.existsSync(filePath)) {
      console.log('[CanvaEnrichment] No file at', filePath, '— enrichment empty.')
      return cached
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data: CanvaEnrichmentFile = JSON.parse(raw)
    const entries = Array.isArray(data.entries) ? data.entries : []

    let skippedPlaceholder = 0
    for (const e of entries) {
      const id = e.vimeoId || normalizeVimeoId(e.vimeoUrl)
      if (!id) continue
      if (isPlaceholder(e)) {
        skippedPlaceholder += 1
        continue
      }

      // If multiple entries map to the same Vimeo ID, prefer the one with the
      // longer pitch (more info). This can happen when the same ref appears in
      // both canvases.
      const existing = cached.get(id)
      if (existing) {
        const existingLen = (existing.pitch || '').length
        const newLen = (e.pitch || '').length
        if (newLen <= existingLen) continue
      }
      cached.set(id, e)
    }

    meta = { lastExtractedAt: data.lastExtractedAt, entryCount: cached.size }
    console.log(
      `[CanvaEnrichment] Loaded ${cached.size} entries (${skippedPlaceholder} placeholders skipped, from ${entries.length} raw) — extracted at ${data.lastExtractedAt}`,
    )
  } catch (err) {
    console.error('[CanvaEnrichment] Failed to load:', err)
  }
  return cached
}

/**
 * Get the enrichment map (loaded once, cached for process lifetime).
 * Safe to call on every read — very cheap after the first call.
 */
export function getCanvaEnrichment(): Map<string, CanvaEnrichmentEntry> {
  return loadOnce()
}

export function getCanvaEnrichmentMeta(): { lastExtractedAt?: string; entryCount: number } {
  loadOnce()
  return meta || { entryCount: 0 }
}
