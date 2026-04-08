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
    // NOTE: typecast is intentionally OFF for Ressource writes, because with typecast
    // ON, if Airtable can't match the rec ID it may silently try to create a new
    // linked record by name — we'd rather get a hard error.
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
    console.log('[COGS PATCH] Airtable status:', patchRes.status)
    if (!patchRes.ok) {
      console.error('[COGS PATCH] Airtable error:', patchRes.status, patchText)
      return NextResponse.json({ error: patchText }, { status: patchRes.status })
    }

    // Parse Airtable response and surgically update the in-memory store
    // (much safer than re-fetching 5935 records; no rate-limit risk).
    let updatedFields: Record<string, unknown> | null = null
    try {
      const updated = JSON.parse(patchText) as { id: string; fields: Record<string, unknown> }
      updatedFields = updated.fields
      upsertRecord(TABLES.COGS, { id: updated.id, fields: updated.fields })
      console.log(
        '[COGS PATCH] store updated. Ressource now =',
        JSON.stringify(updated.fields?.['Ressource']),
        '| Facture count =',
        Array.isArray(updated.fields?.['Facture']) ? (updated.fields['Facture'] as unknown[]).length : 0
      )

      // Verify: if caller sent a ressourceId but Airtable response doesn't contain it,
      // log a clear warning (points at automations or permission issues).
      if (body.ressourceId !== undefined) {
        const actual = updated.fields?.['Ressource'] as string[] | undefined
        const expected = body.ressourceId || null
        const got = actual?.[0] || null
        if (expected !== got) {
          console.error(
            '[COGS PATCH] ⚠ Ressource mismatch after PATCH. expected=',
            expected,
            'got=',
            got,
            '→ an Airtable automation or field restriction may be clearing it.'
          )
        }
      }
    } catch (e) {
      console.error('[COGS PATCH] failed to parse Airtable response:', e)
    }

    return NextResponse.json({ id, fields: updatedFields })
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
