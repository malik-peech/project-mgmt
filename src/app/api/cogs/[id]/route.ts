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
    if (body.bdcEnvoye !== undefined) fields['BDC envoyé'] = body.bdcEnvoye
    if (body.commentaire !== undefined) fields['Commentaire COGS'] = body.commentaire
    if (body.numeroFacture !== undefined) fields['Numéro de facture'] = body.numeroFacture
    if (body.okPourPaiement !== undefined) fields['OK pour paiement'] = body.okPourPaiement

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
