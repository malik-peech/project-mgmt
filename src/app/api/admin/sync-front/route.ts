import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { startSyncFromFront, getSyncJobState } from '@/lib/front-sync'

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if ((token as { role?: string }).role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  return null
}

/**
 * POST /api/admin/sync-front
 *
 * Triggers a Front → in-memory front-evidence sync. Long-running (~10-15 min
 * depending on conversation count). Admin-only.
 *
 * Body (optional):
 *   { query?: string, maxConversations?: number }
 *
 * Response:
 *   { ok: true, stats: SyncFrontStats }
 *
 * After the sync, the references store is refreshed in-place so /api/references
 * and /api/assistant/chat see the new sent_via_front_count signal immediately.
 */
export async function POST(request: NextRequest) {
  try {
    const denied = await requireAdmin(request)
    if (denied) return denied

    let body: {
      content?: string
      inboxId?: string
      after?: string
      query?: string
      maxConversations?: number
    } = {}
    try {
      body = await request.json()
    } catch {
      // empty body is fine
    }

    // Fire-and-forget: kick off the sync as a background job and return
    // immediately. The sync runs ~10-15 min, far past any reverse-proxy
    // timeout. Poll GET /api/admin/sync-front for live status + final stats.
    const job = startSyncFromFront({
      content: body.content,
      inboxId: body.inboxId,
      after: body.after,
      query: body.query,
      maxConversations: body.maxConversations,
    })

    return NextResponse.json(
      { ok: true, job },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[api/admin/sync-front] error:', error)
    const msg = error instanceof Error ? error.message : 'Sync failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * GET /api/admin/sync-front
 * Health-check / readiness — does NOT trigger a sync (avoid accidental
 * long-running calls from a browser). Useful to confirm the env var is set.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied
  return NextResponse.json(
    {
      ok: true,
      tokenConfigured: !!process.env.FRONT_API_TOKEN,
      job: getSyncJobState(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
