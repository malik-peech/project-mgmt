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

import {
  setFrontEvidence,
  type FrontEvidenceEntry,
  type FrontExcerpt,
} from './front-evidence'
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
  subject?: string
  body?: string
  text?: string
  author?: { email?: string; first_name?: string; last_name?: string }
  recipients?: { handle: string; role: 'from' | 'to' | 'cc' | 'bcc' }[]
}

type FrontConversation = {
  id: string
  subject?: string
  _links?: { related?: { messages?: string; inbox?: string; inboxes?: string } }
}

/**
 * Match a conversation's inbox(es) link against the wanted inbox ID. Front's
 * search response exposes the inbox via _links.related.inbox (URL ending in
 * /inboxes/inb_xxx) — older API versions used `inboxes` (plural). Match on
 * either to be safe.
 */
function matchesInbox(conv: FrontConversation, inboxId: string): boolean {
  const links = [
    conv._links?.related?.inbox,
    conv._links?.related?.inboxes,
  ].filter(Boolean) as string[]
  return links.some((u) => u.includes(`/inboxes/${inboxId}`))
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

/** Internal-domain detection — used to pick the "real" recipient domain. */
const INTERNAL_DOMAINS = new Set(['peech.studio', 'peech-studio.com', 'newic.fr'])

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

/**
 * Extract a ~250-char excerpt centered on the first occurrence of any Vimeo
 * URL in the plain-text body. Used so the LLM can quote the actual sales pitch
 * the team used in real outbound emails.
 */
function buildExcerpt(plainText: string, halfWidth = 125): string {
  const m = plainText.match(VIMEO_URL_RE)
  if (!m || m.index == null) {
    // Fallback: just take the head of the message
    return plainText.slice(0, halfWidth * 2).trim()
  }
  const start = Math.max(0, m.index - halfWidth)
  const end = Math.min(plainText.length, m.index + halfWidth)
  let snippet = plainText.slice(start, end).trim()
  if (start > 0) snippet = '… ' + snippet
  if (end < plainText.length) snippet = snippet + ' …'
  return snippet
}

function pickRecipientDomain(m: FrontMessage): string | null {
  for (const r of m.recipients || []) {
    if (r.role !== 'to' && r.role !== 'cc') continue
    const at = r.handle.indexOf('@')
    if (at < 0) continue
    const dom = r.handle.slice(at + 1).toLowerCase()
    if (!INTERNAL_DOMAINS.has(dom)) return dom
  }
  return null
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

/** Max excerpts kept per Vimeo ID. The LLM gets only top-N most recent. */
const MAX_EXCERPTS_PER_VIMEO = 5

type Aggregator = Map<
  string,
  {
    sentCount: number
    firstSentAt?: number
    lastSentAt?: number
    recipientDomains: Set<string>
    senders: Set<string>
    excerpts: Array<FrontExcerpt & { _ts: number }>
  }
>

function bumpAggregator(
  agg: Aggregator,
  vimeoId: string,
  m: FrontMessage,
  conversationId: string,
  plainText: string,
): void {
  const cur = agg.get(vimeoId) || {
    sentCount: 0,
    recipientDomains: new Set<string>(),
    senders: new Set<string>(),
    excerpts: [],
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

  // Capture an excerpt of this email centered on the Vimeo URL.
  cur.excerpts.push({
    _ts: m.created_at,
    sentAt: new Date(m.created_at * 1000).toISOString(),
    sender: sender || undefined,
    recipientDomain: pickRecipientDomain(m) || undefined,
    subject: m.subject?.trim() || undefined,
    snippet: buildExcerpt(plainText),
    conversationId,
  })

  agg.set(vimeoId, cur)
}

function finalize(agg: Aggregator): FrontEvidenceEntry[] {
  const out: FrontEvidenceEntry[] = []
  for (const [vimeoId, v] of agg) {
    // Keep top-N excerpts by recency (most recent first).
    const excerpts = v.excerpts
      .sort((a, b) => b._ts - a._ts)
      .slice(0, MAX_EXCERPTS_PER_VIMEO)
      .map(({ _ts: _ignored, ...rest }) => {
        void _ignored
        return rest
      })
    out.push({
      vimeoId,
      sentCount: v.sentCount,
      firstSentAt: v.firstSentAt ? new Date(v.firstSentAt * 1000).toISOString() : undefined,
      lastSentAt: v.lastSentAt ? new Date(v.lastSentAt * 1000).toISOString() : undefined,
      recipientDomains: Array.from(v.recipientDomains).sort(),
      senders: Array.from(v.senders).sort(),
      excerpts: excerpts.length > 0 ? excerpts : undefined,
    })
  }
  // Sort by sentCount desc for stable inspection
  out.sort((a, b) => b.sentCount - a.sentCount)
  return out
}

export type SyncFrontStats = {
  conversationsScanned: number
  conversationsKept: number
  messagesScanned: number
  vimeoIdsFound: number
  durationMs: number
  query: string
  inboxId: string
  afterDate: string
  errors: string[]
}

// ── Background job state ─────────────────────────────────────────────────
//
// The sync runs for minutes — far longer than typical proxy timeouts (30-60s
// on Coolify). We run it as a fire-and-forget background job and let the UI
// poll for status. This module-level singleton survives across HTTP requests
// in the same Node process.

export type SyncJobState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: string; progress: { conversationsScanned: number; conversationsKept: number; messagesScanned: number; vimeoIdsFound: number } }
  | { status: 'complete'; startedAt: string; finishedAt: string; stats: SyncFrontStats }
  | { status: 'failed'; startedAt: string; finishedAt: string; error: string }

let jobState: SyncJobState = { status: 'idle' }
// Mutable progress counter; the sync writes to it as it advances.
const liveProgress = {
  conversationsScanned: 0,
  conversationsKept: 0,
  messagesScanned: 0,
  vimeoIdsFound: 0,
}

export function getSyncJobState(): SyncJobState {
  if (jobState.status === 'running') {
    return { ...jobState, progress: { ...liveProgress } }
  }
  return jobState
}

/**
 * Default scope: only the #Hello - Peech inbox, only conversations from 2025
 * onwards. Caller can override via opts (e.g. to widen for a one-off backfill).
 *
 * Front's content search endpoint (`GET /conversations/search/:q`) does NOT
 * accept `inbox:` or `after:` modifiers (returns 400 "Unsupported search
 * modifier"), so we apply both filters in-code post-fetch.
 */
const DEFAULT_INBOX_ID = 'inb_vsl' // #Hello - Peech (per CLAUDE.md)
const DEFAULT_AFTER = '2025-01-01'

/**
 * Run a full sync: scan Front for outbound messages mentioning Vimeo URLs,
 * aggregate per Vimeo ID, push the result into the in-memory front-evidence
 * map, and refresh the references store so the new evidence is joined onto
 * each Reference.
 *
 * Default scope: inbox=inb_vsl (#Hello - Peech), after=2025-01-01, content=vimeo.com.
 *
 * Front's search endpoint doesn't support `inbox:` / `after:` modifiers, so
 * the inbox + date filters are applied post-fetch in code.
 *
 * Called from /api/admin/sync-front (manual) or from a Coolify cron.
 */
export async function syncFromFront(opts?: {
  /** Free-text content match. Default "vimeo.com" matches any Vimeo URL. */
  content?: string
  /** Inbox ID filter (e.g. "inb_vsl"). Default DEFAULT_INBOX_ID. Pass "" to disable. */
  inboxId?: string
  /** Date filter (YYYY-MM-DD). Default "2025-01-01". Pass "" to disable. */
  after?: string
  /** Pre-built Front search query string — overrides `content` if set. */
  query?: string
  /** Cap on conversations to scan (safety net). Default 5000. */
  maxConversations?: number
}): Promise<SyncFrontStats> {
  const token = process.env.FRONT_API_TOKEN
  if (!token) {
    throw new Error('FRONT_API_TOKEN env var is not set')
  }

  const query = opts?.query ?? (opts?.content || 'vimeo.com')
  const inboxId = opts?.inboxId ?? DEFAULT_INBOX_ID
  const afterDate = opts?.after ?? DEFAULT_AFTER
  const afterTs = afterDate ? Math.floor(new Date(afterDate).getTime() / 1000) : 0
  const maxConv = opts?.maxConversations ?? 5000
  const startedAt = Date.now()
  const errors: string[] = []
  const aggregator: Aggregator = new Map()

  let conversationsScanned = 0
  let conversationsKept = 0
  let messagesScanned = 0
  // Reset live progress counter for this run
  liveProgress.conversationsScanned = 0
  liveProgress.conversationsKept = 0
  liveProgress.messagesScanned = 0
  liveProgress.vimeoIdsFound = 0

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
      liveProgress.conversationsScanned = conversationsScanned

      // In-code inbox filter (Front search doesn't accept inbox: modifier)
      if (inboxId && !matchesInbox(conv, inboxId)) continue
      conversationsKept += 1
      liveProgress.conversationsKept = conversationsKept

      const messagesUrl = conv._links?.related?.messages
        || `${FRONT_BASE}/conversations/${conv.id}/messages`

      try {
        await delay(REQUEST_INTERVAL_MS)
        const mres = await fetch(messagesUrl, { headers: authHeaders(token), cache: 'no-store' })
        if (!mres.ok) {
          errors.push(`messages ${conv.id} ${mres.status}: ${(await mres.text()).slice(0, 150)}`)
          continue
        }
        const mbody = (await mres.json()) as FrontMessagesResponse
        const msgs = mbody._results || []
        for (const m of msgs) {
          messagesScanned += 1
          liveProgress.messagesScanned = messagesScanned
          if (m.is_inbound) continue // only count outbound (sales → prospect)
          if (afterTs && m.created_at < afterTs) continue // date filter (in-code)
          const content = m.body || m.text || ''
          if (!content) continue
          const plainText = stripHtml(content)
          const ids = extractVimeoIds(content)
          for (const id of ids) bumpAggregator(aggregator, id, m, conv.id, plainText)
          liveProgress.vimeoIdsFound = aggregator.size
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
    conversationsKept,
    messagesScanned,
    vimeoIdsFound: entries.length,
    durationMs: Date.now() - startedAt,
    query,
    inboxId,
    afterDate,
    errors,
  }
}

/**
 * Kick off a sync in the background (fire-and-forget). Returns immediately
 * with the new job state. Subsequent calls while a sync is running return
 * `{ status: 'running' }` without starting a second one (single concurrent job).
 *
 * Use this from HTTP routes — the proxy timeout would otherwise abort a long
 * sync (~10-15 min) well before completion.
 */
export function startSyncFromFront(
  opts?: Parameters<typeof syncFromFront>[0],
): SyncJobState {
  if (jobState.status === 'running') {
    return getSyncJobState()
  }
  const startedAt = new Date().toISOString()
  jobState = {
    status: 'running',
    startedAt,
    progress: { ...liveProgress },
  }

  // Background execution — explicitly NOT awaited. Errors are caught and
  // recorded onto jobState so the UI poll can surface them.
  void (async () => {
    try {
      const stats = await syncFromFront(opts)
      jobState = {
        status: 'complete',
        startedAt,
        finishedAt: new Date().toISOString(),
        stats,
      }
    } catch (err) {
      jobState = {
        status: 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })()

  return getSyncJobState()
}
