import { NextResponse } from 'next/server'
import { updateRecord, TABLES } from '@/lib/airtable'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const fields: Record<string, any> = {}
    if (body.statut !== undefined) fields['Statut de la dépense'] = body.statut
    if (body.montantEngageProd !== undefined) fields['Montant HT engagé (prod)'] = body.montantEngageProd
    if (body.bdcEnvoye !== undefined) fields['BDC envoyé'] = body.bdcEnvoye
    if (body.commentaire !== undefined) fields['Commentaire COGS'] = body.commentaire
    if (body.numeroFacture !== undefined) fields['Numéro de facture'] = body.numeroFacture
    if (body.okPourPaiement !== undefined) fields['OK pour paiement'] = body.okPourPaiement

    const record = await updateRecord(TABLES.COGS, id, fields)
    return NextResponse.json({ id: record.id })
  } catch (error) {
    console.error('Error updating COGS:', error)
    return NextResponse.json({ error: 'Failed to update COGS' }, { status: 500 })
  }
}
