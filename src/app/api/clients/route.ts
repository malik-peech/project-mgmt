import { NextResponse } from 'next/server'
import { ensureStore, upsertRecord } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import { TABLES, createRecord } from '@/lib/airtable'

/**
 * GET /api/clients
 * Returns all clients { id, name }, sorted by name.
 */
export async function GET() {
  try {
    const store = await ensureStore()
    const clients = store.clients.records
      .map((r) => ({
        id: r.id,
        name: String(r.fields['Client'] || '').trim(),
      }))
      .filter((c) => c.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

    return NextResponse.json(sanitize(clients), {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    })
  } catch (error) {
    console.error('Error fetching clients:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}

/**
 * POST /api/clients { name }
 * Creates a new Client record and returns it.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name } = body as { name?: string }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const trimmed = name.trim()

    // Check if already exists (case insensitive)
    const store = await ensureStore()
    const existing = store.clients.records.find(
      (r) => String(r.fields['Client'] || '').toLowerCase() === trimmed.toLowerCase()
    )
    if (existing) {
      return NextResponse.json({ id: existing.id, name: String(existing.fields['Client']) })
    }

    const created = await createRecord(TABLES.CLIENTS, { Client: trimmed })
    upsertRecord(TABLES.CLIENTS, { id: created.id, fields: created.fields as Record<string, unknown> })
    return NextResponse.json({ id: created.id, name: trimmed }, { status: 201 })
  } catch (error) {
    console.error('Error creating client:', error)
    const msg = error instanceof Error ? error.message : 'Failed to create client'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
