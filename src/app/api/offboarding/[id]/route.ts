import { NextResponse } from 'next/server'
import { TABLES, updateRecord } from '@/lib/airtable'
import { upsertRecord } from '@/lib/store'

/**
 * PATCH /api/offboarding/[id]
 * Update offboarding fields on a Projet record.
 *
 * Body (all optional):
 *   - frameArchive: boolean
 *   - slackArchive: boolean
 *   - eopMonthIds: string[]     (linked → Mensuel)
 *   - diffusable: 'OK pour diffusion' | 'Diffusion interdite' | 'En attente'
 *   - pointEop: 'Prévu' | 'Done' | 'No need (vu avec sales)'
 *   - datePointEop: string (YYYY-MM-DD) | null
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const body = await request.json()
    const fields: Record<string, unknown> = {}

    if (body.frameArchive !== undefined) fields['Frame archivé'] = !!body.frameArchive
    if (body.slackArchive !== undefined) fields['Slack archivé'] = !!body.slackArchive
    if (body.eopMonthIds !== undefined) {
      fields['EOP month'] = Array.isArray(body.eopMonthIds) ? body.eopMonthIds : []
    }
    if (body.diffusable !== undefined) fields['Diffusable ?'] = body.diffusable || null
    if (body.pointEop !== undefined) fields['Point EOP'] = body.pointEop || null
    if (body.datePointEop !== undefined) fields['Date point EOP'] = body.datePointEop || null

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const updated = await updateRecord(TABLES.PROJETS, id, fields as Record<string, string>)
    upsertRecord(TABLES.PROJETS, { id: updated.id, fields: updated.fields as Record<string, unknown> })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating offboarding fields:', error)
    const msg = error instanceof Error ? error.message : 'Failed to update'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
