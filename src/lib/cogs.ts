import type { Cogs } from '@/types'

/**
 * A COGS in statut "A payer" is "à compléter" when any payment-required field
 * is missing. Qualité (commentaire) is intentionally optional.
 */
export function isCogsACompleter(c: Cogs): boolean {
  if (c.statut !== 'A payer') return false
  return (
    !c.montantEngageProd ||
    !c.ressourceName ||
    c.tva == null ||
    c.qualiteNote == null ||
    !c.numeroFacture ||
    !c.methodePaiement ||
    !c.facture ||
    c.facture.length === 0
  )
}
