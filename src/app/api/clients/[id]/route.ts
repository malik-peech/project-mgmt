import { NextResponse } from 'next/server'
import { TABLES, updateRecord } from '@/lib/airtable'
import { upsertRecord } from '@/lib/store'

/**
 * PATCH /api/clients/[id]
 * Update a Client's official information (used during onboarding
 * when the sales creates a new client).
 *
 * Body (all optional):
 *   - officialSiren: string
 *   - nameOfficial: string
 *   - address: string
 *   - postalCode: string
 *   - city: string
 *   - countryAlpha2: string
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    const body = await request.json()
    const fields: Record<string, unknown> = {}

    if (body.officialSiren !== undefined) {
      fields['Official SIREN'] = body.officialSiren || null
    }
    if (body.nameOfficial !== undefined) {
      fields['client name (official)'] = body.nameOfficial || null
    }
    if (body.address !== undefined) {
      fields['address'] = body.address || null
    }
    if (body.postalCode !== undefined) {
      fields['postal_code'] = body.postalCode || null
    }
    if (body.city !== undefined) {
      fields['city'] = body.city || null
    }
    if (body.countryAlpha2 !== undefined) {
      fields['country_alpha2'] = body.countryAlpha2 || null
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const updated = await updateRecord(TABLES.CLIENTS, id, fields as Record<string, string>)
    upsertRecord(TABLES.CLIENTS, { id: updated.id, fields: updated.fields as Record<string, unknown> })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating client:', error)
    const msg = error instanceof Error ? error.message : 'Failed to update'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
