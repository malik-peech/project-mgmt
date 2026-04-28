/**
 * Front evidence loader.
 *
 * Loads aggregated Vimeo-URL usage data from `src/data/front-evidence.json`
 * (produced by the Front extraction agent) and exposes a Map<vimeoId, Evidence>
 * so the references store can merge signal-of-pertinence onto each Reference:
 *   "this ref has been sent 12 times to pharma prospects by Laurine,
 *    most recently 2 weeks ago".
 */

import fs from 'node:fs'
import path from 'node:path'

export interface FrontExcerpt {
  /** Send date (ISO 8601) */
  sentAt: string
  /** Sender display name (e.g. "Laurine Angelini") */
  sender?: string
  /** Recipient domain (e.g. "bpce.fr") — only the first non-internal one */
  recipientDomain?: string
  /** Email subject (trimmed) */
  subject?: string
  /** Plain-text snippet around the Vimeo URL (~250 chars centered) */
  snippet: string
  /** Front conversation ID for traceability */
  conversationId?: string
}

export interface FrontEvidenceEntry {
  vimeoId: string
  vimeoUrl?: string
  sentCount: number
  firstSentAt?: string
  lastSentAt?: string
  recipientDomains?: string[]
  senders?: string[]
  /** Up to ~5 representative excerpts of mails citing this Vimeo URL */
  excerpts?: FrontExcerpt[]
}

interface FrontEvidenceFile {
  lastExtractedAt?: string
  scanMeta?: Record<string, unknown>
  entries?: FrontEvidenceEntry[]
}

let cached: Map<string, FrontEvidenceEntry> | null = null
let meta: { lastExtractedAt?: string; entryCount: number } | null = null

function loadOnce(): Map<string, FrontEvidenceEntry> {
  if (cached) return cached
  cached = new Map()
  meta = { entryCount: 0 }

  const filePath = path.join(process.cwd(), 'src', 'data', 'front-evidence.json')

  try {
    if (!fs.existsSync(filePath)) {
      console.log('[FrontEvidence] No file at', filePath, '— evidence empty.')
      return cached
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data: FrontEvidenceFile = JSON.parse(raw)
    const entries = Array.isArray(data.entries) ? data.entries : []

    for (const e of entries) {
      if (!e.vimeoId || !e.sentCount || e.sentCount < 1) continue
      // Keep entries with the highest sentCount if duplicated
      const existing = cached.get(e.vimeoId)
      if (existing && existing.sentCount >= e.sentCount) continue
      cached.set(e.vimeoId, e)
    }

    meta = { lastExtractedAt: data.lastExtractedAt, entryCount: cached.size }
    console.log(
      `[FrontEvidence] Loaded ${cached.size} entries — extracted at ${data.lastExtractedAt}`,
    )
  } catch (err) {
    console.error('[FrontEvidence] Failed to load:', err)
  }
  return cached
}

export function getFrontEvidence(): Map<string, FrontEvidenceEntry> {
  return loadOnce()
}

export function getFrontEvidenceMeta(): { lastExtractedAt?: string; entryCount: number } {
  loadOnce()
  return meta || { entryCount: 0 }
}

/**
 * Replace the in-memory evidence map with freshly-synced data (typically from
 * the Front REST API via /api/admin/sync-front). Call this BEFORE triggering
 * a references-store refresh so the new data gets joined onto each Reference.
 */
export function setFrontEvidence(entries: FrontEvidenceEntry[]): void {
  const next = new Map<string, FrontEvidenceEntry>()
  for (const e of entries) {
    if (!e.vimeoId || !e.sentCount || e.sentCount < 1) continue
    const existing = next.get(e.vimeoId)
    if (existing && existing.sentCount >= e.sentCount) continue
    next.set(e.vimeoId, e)
  }
  cached = next
  meta = { lastExtractedAt: new Date().toISOString(), entryCount: next.size }
  console.log(`[FrontEvidence] Replaced in-memory map: ${next.size} entries`)
}
