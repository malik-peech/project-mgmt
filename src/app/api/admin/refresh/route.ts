import { NextResponse } from 'next/server'
import { refreshAll } from '@/lib/store'
import { refreshReferences } from '@/lib/references-store'

export async function POST() {
  try {
    // Refresh both stores in parallel: main PM base + Belle Base references.
    // The references store powers the /refs facets (incl. the Year lookup)
    // and otherwise only re-syncs every 10 minutes.
    await Promise.all([refreshAll(), refreshReferences()])
    return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() })
  } catch (error) {
    console.error('Manual refresh error:', error)
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 })
  }
}
