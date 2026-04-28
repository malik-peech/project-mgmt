/**
 * Front sync — fetches outbound messages mentioning Vimeo URLs and aggregates
 * usage signal per Vimeo ID.
 *
 * Strategy:
 * 1. Search conversations matching "vimeo.com" via `GET /conversations/search/:q`
 * 2. For each conversation, fetch the messages via `GET /conversations/:id/messages`
 * 3. Parse outbound message bodies for Vimeo URLs, attribute to sender + recipient domains
 * 4. Aggregate per normalized Vimeo ID
 *
 * Throughput: Front API is rate-limited (50 req/min on standard plans). We
 * pace requests with `await delay(...)` between calls. A typical sync of ~500
 * conversations takes ~10-15 minutes.
 *
 * Storage: results are stored in-memory via setFrontEvidence(). Lost on
 * container restart — meant to be re-run via a daily Coolify cron.
 */

import { setFrontEvidence, type FrontEvidenceEntry } from './front-evidence'
import { refreshReferences } from './references-store'
import { normalizeVimeoId } from './canva-enrichment'

const FRONT_BASE = 'https://api2.frontapp.com'

// Pace between API calls (ms) — Front limits to 50 req/min on standard plans.
// 1500ms = 40 req/min, leaves headroom.
const REQUEST_INTERVAL_MS = 1500

const VIMEO_URL_RE = /https?:\/\/(?:player\.)?vimeo\.com\/[A-Za-z0-9/_?=&%.\-#]+/gi

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

type FrontMessage = {
  id: string
  type: string
  is_inbound: boolean
  created_at: number // unix seconds
  body?: string
  text?: string
  author?: { email?: string; first_name?: string; last_name?: string }
  recipients?: { handle: string; role: 'from' | 'to' | 'cc' | 'bcc' }[]
}

type FrontConversation = {
  id: string
  subject?: string
  _links?: { related?: { messages?: string } }
}

type FrontSearchResponse = {
  _pagination?: { next?: string | null }
  _results?: FrontConversation[]
}

type FrontMessagesResponse = {
  _pagination?: { next?: string | null }
  _results?: FrontMessage[]
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }
}

/** Strip HTML tags, decode common entities, return plain text for URL extraction. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

function extractVimeoIds(content: string): string[] {
  const text = stripHtml(content)
  const ids = new Set<string>()
  const matches = text.match(VIMEO_URL_RE) || []
  for (const url of matches) {
    const id = normalizeVimeoId(url)
    if (id) ids.add(id)
  }
  return Array.from(ids)
}

function domainOf(handle: string | undefined): string | null {
  if (!handle) return null
  const at = handle.indexOf('@')
  return at >= 0 ? handle.slice(at + 1).toLowerCase() : null
}

function authorLabel(a: FrontMessage['author']): string | null {
  if (!a) return null
  const name = [a.first_name, a.last_name].filter(Boolean).join(' ').trim()
  if (name) return name
  return a.email || null
}

type Aggregator = Map<
  string,
  {
    sentCount: number
    firstSentAt?: number
    lastSentAt?: number
    recipientDomains: Set<string>
    senders: Set<string>
  }
>

function bumpAggregator(
  agg: Aggregator,
  vimeoId: string,
  m: FrontMessage,
): void {
  const cur = agg.get(vimeoId) || {
    sentCount: 0,
    recipientDomains: new Set<string>(),
    senders: new Set<string>(),
  }
  cur.sentCount += 1
  if (!cur.firstSentAt || m.created_at < cur.firstSentAt) cur.firstSentAt = m.created_at
  if (!cur.lastSentAt || m.created_at > cur.lastSentAt) cur.lastSentAt = m.created_at
  for (const r of m.recipients || []) {
    if (r.role === 'to' || r.role === 'cc') {
      const d = domainOf(r.handle)
      if (d) cur.recipientDomains.add(d)
    }
  }
  const sender = authorLabel(m.author)
  if (sender) cur.senders.add(sender)
  agg.set(vimeoId, cur)
}

function finalize(agg: Aggregator): FrontEvidenceEntry[] {
  const out: FrontEvidenceEntry[] = []
  for (const [vimeoId, v] of agg) {
    out.push({
      vimeoId,
      sentCount: v.sentCount,
      firstSentAt: v.firstSentAt ? new Date(v.firstSentAt * 1000).toISOString() : undefined,
      lastSentAt: v.lastSentAt ? new Date(v.lastSentAt * 1000).toISOString() : undefined,
      recipientDomains: Array.from(v.recipientDomains).sort(),
      senders: Array.from(v.senders).sort(),
    })
  }
  // Sort by sentCount desc for stable inspection
  out.sort((a, b) => b.sentCount - a.sentCount)
  return out
}

export type SyncFrontStats = {
  conversationsScanned: number
  messagesScanned: number
  vimeoIdsFound: number
  durationMs: number
  errors: string[]
}

/**
 * Run a full sync: scan Front for outbound messages mentioning Vimeo URLs,
 * aggregate per Vimeo ID, push the result into the in-memory front-evidence
 * map, and refresh the references store so the new evidence is joined onto
 * each Reference.
 *
 * Called from /api/admin/sync-front (manual) or from a Coolify cron.
 */
export async function syncFromFront(opts?: {
  /** Front search query. Default "vimeo.com" matches any Vimeo URL in the body. */
  query?: string
  /** Cap on conversations to scan (safety net). Default 2000. */
  maxConversations?: number
}): Promise<SyncFrontStats> {
  const token = process.env.FRONT_API_TOKEN
  if (!token) {
    throw new Error('FRONT_API_TOKEN env var is not set')
  }

  const query = opts?.query || 'vimeo.com'
  const maxConv = opts?.maxConversations ?? 2000
  const startedAt = Date.now()
  const errors: string[] = []
  const aggregator: Aggregator = new Map()

  let conversationsScanned = 0
  let messagesScanned = 0

  // ── 1. Paginate through search results ──
  let nextUrl: string | null =
    `${FRONT_BASE}/conversations/search/${encodeURIComponent(query)}?limit=100`

  while (nextUrl && conversationsScanned < maxConv) {
    let page: FrontSearchResponse
    try {
      const res = await fetch(nextUrl, { headers: authHeaders(token), cache: 'no-store' })
      if (!res.ok) {
        errors.push(`search ${res.status}: ${(await res.text()).slice(0, 200)}`)
        break
      }
      page = (await res.json()) as FrontSearchResponse
    } catch (e) {
      errors.push(`search fetch: ${e instanceof Error ? e.message : String(e)}`)
      break
    }
    const conversations = page._results || []

    for (const conv of conversations) {
      if (conversationsScanned >= maxConv) break
      conversationsScanned += 1

      const messagesUrl = conv._links?.related?.messages
        || `${FRONT_BASE}/conversations/${conv.id}/messages`

      try {
        await delay(REQUEST_INTERVAL_MS)
        const mres = await fetch(messagesUrl, { headers: authHeaders(token), cache: 'no-store' })
        if (!mres.ok) {
          errors.push(`messages ${conv.id} ${mres.status}`)
          continue
        }
        const mbody = (await mres.json()) as FrontMessagesResponse
        const msgs = mbody._results || []
        for (const m of msgs) {
          messagesScanned += 1
          if (m.is_inbound) continue // only count outbound (sales → prospect)
          const content = m.body || m.text || ''
          if (!content) continue
          const ids = extractVimeoIds(content)
          for (const id of ids) bumpAggregator(aggregator, id, m)
        }
      } catch (e) {
        errors.push(`messages ${conv.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    nextUrl = (page._pagination?.next as string | null) || null
    if (nextUrl) await delay(REQUEST_INTERVAL_MS)
  }

  // ── 2. Persist into in-memory store + refresh references ──
  const entries = finalize(aggregator)
  setFrontEvidence(entries)
  // Re-run references store sync so the new evidence gets joined.
  await refreshReferences()

  return {
    conversationsScanned,
    messagesScanned,
    vimeoIdsFound: entries.length,
    durationMs: Date.now() - startedAt,
    errors,
  }
}
