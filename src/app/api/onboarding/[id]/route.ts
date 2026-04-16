import { NextResponse } from 'next/server'
import { TABLES, updateRecord } from '@/lib/airtable'
import { refreshTable } from '@/lib/store'

/**
 * PATCH /api/onboarding/[id]
 * Update any onboarding-related field on a Projet record.
 *
 * Body (all optional):
 *   - moisSignatureIds: string[]   → Mois signature (multipleRecordLinks → Mensuel)
 *   - currency: 'EUR' | 'USD' | 'CHF'
 *   - clientId: string             → Client link (multipleRecordLinks → Clients)
 *   - origine: 'Client existant' | 'Nouveau client'
 *   - agence: string
 *   - numeroDevis: string
 *   - cogsBudget: number
 *   - timeCreaBudget: number
 *   - travelBudget: number
 *   - timeProdBudget: number
 *   - timeDaBudget: number
 *   - dateFinalisationPrevue: string (YYYY-MM-DD) | null
 *   - dureeContrat: number
 *   - libelleFacture: string
 *   - contactCompta: string
 *   - typeDeContact: 'Compta' | 'Client'
 *   - pm: string                   → PM (manual) singleSelect
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

    if (body.moisSignatureIds !== undefined) {
      fields['Mois signature'] = Array.isArray(body.moisSignatureIds) ? body.moisSignatureIds : []
    }
    if (body.currency !== undefined) {
      fields['Currency'] = body.currency || null
    }
    if (body.clientId !== undefined) {
      fields['Client link'] = body.clientId ? [body.clientId] : []
    }
    if (body.origine !== undefined) {
      fields['Origine'] = body.origine || null
    }
    if (body.agence !== undefined) {
      fields['Agence'] = body.agence || null
    }
    if (body.numeroDevis !== undefined) {
      fields['Numéro de devis'] = body.numeroDevis || null
    }
    if (body.cogsBudget !== undefined) {
      fields['COGS - budget (€)'] = body.cogsBudget === null || body.cogsBudget === '' ? null : Number(body.cogsBudget)
    }
    if (body.timeCreaBudget !== undefined) {
      fields['Time Créa - budget (h)'] = body.timeCreaBudget === null || body.timeCreaBudget === '' ? null : Number(body.timeCreaBudget)
    }
    if (body.travelBudget !== undefined) {
      fields['Travel - budget (€)'] = body.travelBudget === null || body.travelBudget === '' ? null : Number(body.travelBudget)
    }
    if (body.timeProdBudget !== undefined) {
      fields['Time Prod - budget (h)'] = body.timeProdBudget === null || body.timeProdBudget === '' ? null : Number(body.timeProdBudget)
    }
    if (body.timeDaBudget !== undefined) {
      fields['Time DA- budget (h)'] = body.timeDaBudget === null || body.timeDaBudget === '' ? null : Number(body.timeDaBudget)
    }
    if (body.dateFinalisationPrevue !== undefined) {
      fields['Date de finalisation prévue'] = body.dateFinalisationPrevue || null
    }
    if (body.dureeContrat !== undefined) {
      fields['Durée contrat (mois)'] = body.dureeContrat === null || body.dureeContrat === '' ? null : Number(body.dureeContrat)
    }
    if (body.libelleFacture !== undefined) {
      fields['Libellé facture'] = body.libelleFacture || null
    }
    if (body.contactCompta !== undefined) {
      fields['Contact compta'] = body.contactCompta || null
    }
    if (body.typeDeContact !== undefined) {
      fields['type de contact'] = body.typeDeContact || null
    }
    if (body.pm !== undefined) {
      fields['PM (manual)'] = body.pm || null
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    await updateRecord(TABLES.PROJETS, id, fields as Record<string, string>)
    await refreshTable(TABLES.PROJETS)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating onboarding fields:', error)
    const msg = error instanceof Error ? error.message : 'Failed to update'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
