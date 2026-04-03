import { NextResponse } from 'next/server'
import { updateRecord, deleteRecord, TABLES } from '@/lib/airtable'
import { refreshTable } from '@/lib/store'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

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
    if (body.ressourceId !== undefined) fields['Ressource'] = body.ressourceId ? [body.ressourceId] : null

    // Handle attachment deletion: remove one attachment by index
    if (body.removeAttachmentIndex !== undefined) {
      const apiKey = process.env.AIRTABLE_API_KEY
      const baseId = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
      const tableId = 'tblnrqX6xNx5EWFsC'
      // Fetch current record to get attachment ids
      const getRes = await fetch(
        `https://api.airtable.com/v0/${baseId}/${tableId}/${id}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      )
      if (getRes.ok) {
        const rec = await getRes.json()
        const existing = (rec.fields?.['Facture'] as { id: string }[]) || []
        const remaining = existing.filter((_: unknown, i: number) => i !== body.removeAttachmentIndex)
        fields['Facture'] = remaining.map((a: { id: string }) => ({ id: a.id }))
      }
    }

    const record = await updateRecord(TABLES.COGS, id, fields as any)

    // Refresh store in background
    refreshTable(TABLES.COGS).catch(() => {})

    return NextResponse.json({ id: record.id })
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

    // Refresh store in background
    refreshTable(TABLES.COGS).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting cog:', error)
    return NextResponse.json({ error: 'Failed to delete cog' }, { status: 500 })
  }
}
