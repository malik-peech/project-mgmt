import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { syncFromFront } from '@/lib/front-sync'

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
export async function POST(request: Request) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const role = (session.user as { role?: string } | undefined)?.role
    if (role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    let body: {
      content?: string
      inbox?: string
      after?: string
      query?: string
      maxConversations?: number
    } = {}
    try {
      body = await request.json()
    } catch {
      // empty body is fine
    }

    const stats = await syncFromFront({
      content: body.content,
      inbox: body.inbox,
      after: body.after,
      query: body.query,
      maxConversations: body.maxConversations,
    })

    return NextResponse.json(
      { ok: true, stats },
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
export async function GET() {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string } | undefined)?.role
  if (role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }
  return NextResponse.json({
    ok: true,
    tokenConfigured: !!process.env.FRONT_API_TOKEN,
    hint: 'POST to this endpoint to trigger a sync',
  })
}
