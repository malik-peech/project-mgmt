import { NextResponse } from 'next/server'
import { deleteRecord, TABLES } from '@/lib/airtable'
import { upsertRecord, removeRecord } from '@/lib/store'

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
const COGS_TABLE_ID = 'tblnrqX6xNx5EWFsC'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AIRTABLE_API_KEY not set' }, { status: 500 })

    const fields: Record<string, unknown> = {}
    if (body.statut !== undefined) fields['Statut de la dépense'] = body.statut
    if (body.montantEngageProd !== undefined) fields['Montant HT engagé (prod)'] = body.montantEngageProd
    if (body.tva !== undefined) fields['TVA'] = body.tva
    if (body.qualiteNote !== undefined) fields['Qualité (note)'] = body.qualiteNote
    if (body.qualiteComment !== undefined) fields['Qualité (comment)'] = body.qualiteComment
    if (body.bdcEnvoye !== undefined) fields['BDC envoyé'] = body.bdcEnvoye
    if (body.commentaire !== undefined) fields['Commentaire COGS'] = body.commentaire
    if (body.numeroFacture !== undefined) fields['Numéro de facture'] = body.numeroFacture
    if (body.okPourPaiement !== undefined) fields['OK pour paiement'] = body.okPourPaiement
    if (body.ressourceId !== undefined) {
      fields['Ressource'] = body.ressourceId ? [body.ressourceId] : []
    }
    if (body.autorisationVanessa !== undefined) {
      const v = body.autorisationVanessa
      fields['Autorisation Vanessa'] = typeof v === 'number' && !isNaN(v) ? v : null
    }

    // Handle attachment deletion: remove one attachment by index
    if (body.removeAttachmentIndex !== undefined) {
      const getRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${COGS_TABLE_ID}/${id}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      )
      if (getRes.ok) {
        const rec = await getRes.json()
        const existing = (rec.fields?.['Facture'] as { id: string }[]) || []
        const remaining = existing.filter((_: unknown, i: number) => i !== body.removeAttachmentIndex)
        fields['Facture'] = remaining.map((a: { id: string }) => ({ id: a.id }))
      }
    }

    console.log('[COGS PATCH]', id, 'payload fields:', JSON.stringify(fields))

    // Direct fetch to Airtable so we surface any 422/field errors to the client.
    const patchRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${COGS_TABLE_ID}/${id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields, typecast: true }),
      }
    )
    const patchText = await patchRes.text()
    if (!patchRes.ok) {
      console.error('[COGS PATCH] Airtable error:', patchRes.status, patchText)
      return NextResponse.json({ error: patchText }, { status: patchRes.status })
    }

    // Parse Airtable response and surgically update the in-memory store
    // (much safer than re-fetching 5935 records; no rate-limit risk).
    try {
      const updated = JSON.parse(patchText) as { id: string; fields: Record<string, unknown> }
      upsertRecord(TABLES.COGS, { id: updated.id, fields: updated.fields })
      console.log('[COGS PATCH] store updated, new Ressource:', updated.fields?.['Ressource'])
    } catch (e) {
      console.error('[COGS PATCH] failed to parse Airtable response:', e)
    }

    return NextResponse.json({ id })
  } catch (error) {
    console.error('Error updating COGS:', error)
    return NextResponse.json({ error: 'Failed to update COGS' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await deleteRecord(TABLES.COGS, id)
    removeRecord(TABLES.COGS, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting cog:', error)
    return NextResponse.json({ error: 'Failed to delete cog' }, { status: 500 })
  }
}
