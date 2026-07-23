import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { TABLES } from '@/lib/airtable'
import { upsertRecord } from '@/lib/store'

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
const RESSOURCES_TABLE_ID = 'tblgwh9bP5Piz32SL'

/**
 * PATCH /api/ressources/[id] — edit a resource (RH back-office).
 * Editable: contact fields, catégorie, pays, ville, statut, blacklist, IBAN,
 * paypal, payment instructions. RIB / Photo attachments go through /upload.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AIRTABLE_API_KEY not set' }, { status: 500 })

    const fields: Record<string, unknown> = {}
    if (body.name !== undefined) fields['Name'] = body.name
    if (body.email !== undefined) fields['Email'] = body.email || null
    if (body.telephone !== undefined) fields['Téléphone'] = body.telephone || null
    if (body.contactPrincipal !== undefined) fields['Contact principal (si société)'] = body.contactPrincipal || null
    if (body.categorie !== undefined) fields['Catégorie'] = Array.isArray(body.categorie) ? body.categorie : []
    if (body.pays !== undefined) fields['Pays'] = body.pays || null
    if (body.ville !== undefined) fields['Ville'] = body.ville || null
    if (body.statut !== undefined) fields['Statut'] = body.statut || null
    if (body.blacklist !== undefined) fields['Blacklist'] = !!body.blacklist
    if (body.iban !== undefined) fields['IBAN'] = body.iban || null
    if (body.paypal !== undefined) fields['Paypal'] = body.paypal || null
    if (body.instructionsPaiement !== undefined) fields['Instructions spécifiques de paiement'] = body.instructionsPaiement || null
    if (body.description !== undefined) fields['Description'] = body.description || null
    if (body.declarationHonoraires !== undefined) fields['Déclaration honoraires'] = !!body.declarationHonoraires

    // Attachment deletion by index (RIB or Photo)
    const removeField = body.removeRibIndex !== undefined ? 'RIB'
      : body.removePhotoIndex !== undefined ? 'Photo'
      : null
    if (removeField) {
      const removeIdx = removeField === 'RIB' ? body.removeRibIndex : body.removePhotoIndex
      const getRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${RESSOURCES_TABLE_ID}/${id}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      )
      if (getRes.ok) {
        const rec = await getRes.json()
        const existing = (rec.fields?.[removeField] as { id: string }[]) || []
        fields[removeField] = existing.filter((_: unknown, i: number) => i !== removeIdx).map((a) => ({ id: a.id }))
      }
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const patchRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${RESSOURCES_TABLE_ID}/${id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, typecast: true }),
      }
    )
    const patchText = await patchRes.text()
    if (!patchRes.ok) {
      console.error('[Ressource PATCH] Airtable error:', patchRes.status, patchText)
      return NextResponse.json({ error: patchText }, { status: patchRes.status })
    }

    let updatedFields: Record<string, unknown> | null = null
    try {
      const updated = JSON.parse(patchText) as { id: string; fields: Record<string, unknown> }
      updatedFields = updated.fields
      upsertRecord(TABLES.RESSOURCES, { id: updated.id, fields: updated.fields })
    } catch (e) {
      console.error('[Ressource PATCH] failed to parse Airtable response:', e)
    }

    return NextResponse.json({ id, fields: updatedFields })
  } catch (error) {
    console.error('Error updating ressource:', error)
    return NextResponse.json({ error: 'Failed to update ressource' }, { status: 500 })
  }
}
