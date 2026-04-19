import { NextResponse } from 'next/server'
import { ensureStore, upsertRecord } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import { TABLES, createRecord } from '@/lib/airtable'

function str(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v || undefined
  return String(v)
}

function mapClient(r: { id: string; fields: Record<string, unknown> }) {
  return {
    id: r.id,
    name: String(r.fields['Client'] || '').trim(),
    officialSiren: str(r.fields['Official SIREN']),
    nameOfficial: str(r.fields['client name (official)']),
    address: str(r.fields['address']),
    postalCode: str(r.fields['postal_code']),
    city: str(r.fields['city']),
    countryAlpha2: str(r.fields['country_alpha2']),
  }
}

/**
 * GET /api/clients
 * Returns all clients with their official info, sorted by name.
 */
export async function GET() {
  try {
    const store = await ensureStore()
    const clients = store.clients.records
      .map(mapClient)
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
      return NextResponse.json(mapClient(existing))
    }

    const created = await createRecord(TABLES.CLIENTS, { Client: trimmed })
    upsertRecord(TABLES.CLIENTS, { id: created.id, fields: created.fields as Record<string, unknown> })
    return NextResponse.json(mapClient({ id: created.id, fields: created.fields as Record<string, unknown> }), { status: 201 })
  } catch (error) {
    console.error('Error creating client:', error)
    const msg = error instanceof Error ? error.message : 'Failed to create client'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
