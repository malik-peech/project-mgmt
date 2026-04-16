import { NextResponse } from 'next/server'
import { ensureStore } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'

/**
 * GET /api/mensuel
 * Returns all Mensuel entries { id, name } for "Mois signature" linked field on Projets.
 * Sorted descending by name (latest months first, assuming YYYY-MM format).
 */
export async function GET() {
  try {
    const store = await ensureStore()
    const items = store.mensuel.records
      .map((r) => ({
        id: r.id,
        name: String(r.fields['Name'] || '').trim(),
      }))
      .filter((m) => m.name.length > 0)
      .sort((a, b) => b.name.localeCompare(a.name))

    return NextResponse.json(sanitize(items), {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    })
  } catch (error) {
    console.error('Error fetching mensuel:', error)
    return NextResponse.json({ error: 'Failed to fetch mensuel' }, { status: 500 })
  }
}
