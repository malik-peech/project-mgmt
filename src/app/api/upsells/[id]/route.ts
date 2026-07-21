import { NextResponse } from 'next/server'
import { TABLES, updateRecord } from '@/lib/airtable'
import { upsertRecord } from '@/lib/store'

/**
 * PATCH /api/upsells/[id]
 * Update the sales-editable fields on an Upsell record.
 *
 * Body (all optional):
 *   - numBdc: string | null      → "Num BDC Upsell" (singleLineText)
 *   - pasDeBdc: boolean          → "Pas de BDC upsell" (checkbox)
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

    if (body.numBdc !== undefined) {
      fields['Num BDC Upsell'] = body.numBdc || null
    }
    if (body.pasDeBdc !== undefined) {
      fields['Pas de BDC upsell'] = !!body.pasDeBdc
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const updated = await updateRecord(TABLES.UPSELLS, id, fields as Record<string, string>)
    upsertRecord(TABLES.UPSELLS, { id: updated.id, fields: updated.fields as Record<string, unknown> })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating upsell:', error)
    const msg = error instanceof Error ? error.message : 'Failed to update'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
