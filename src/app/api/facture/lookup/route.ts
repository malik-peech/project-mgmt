import { NextResponse } from 'next/server'
import { findFactureTarget, paymentDateFor } from '@/lib/facture-lookup'

/**
 * POST /api/facture/lookup — public endpoint for the prestataire invoice drop.
 * Body: { email, numeroCommande }. Returns masked info about the matching COGS
 * line (never the internal record id) so the presta can confirm before dropping.
 */
export async function POST(request: Request) {
  try {
    const { email, numeroCommande } = await request.json()
    if (!email || !numeroCommande) {
      return NextResponse.json({ ok: false, error: 'Email et numéro de commande requis' }, { status: 400 })
    }

    const target = await findFactureTarget(String(email), String(numeroCommande))
    if (!target) {
      return NextResponse.json({ ok: true, found: false })
    }

    const { label: paymentLabel } = paymentDateFor(new Date())

    return NextResponse.json({
      ok: true,
      found: true,
      eligible: target.eligible,
      reason: target.reason,
      numeroCommande: target.numeroCommande,
      montantHT: target.montantHT,
      statut: target.statut,
      ressourceName: target.ressourceName,
      methodePaiement: target.methodePaiement,
      projetRef: target.projetRef,
      projetName: target.projetName,
      iban: target.iban,
      paypal: target.paypal,
      instructionsPaiement: target.instructionsPaiement,
      hasFacture: target.hasFacture,
      paymentLabel,
    })
  } catch (error) {
    console.error('[facture/lookup] error:', error)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
