import { NextResponse } from 'next/server'
import { refreshAll } from '@/lib/store'

export async function POST() {
  try {
    await refreshAll()
    return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() })
  } catch (error) {
    console.error('Manual refresh error:', error)
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 })
  }
}
