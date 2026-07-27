import { ensureStore, buildLookupMap } from '@/lib/store'

const NON_ELIGIBLE_STATUTS = new Set(['Payée', 'Annulée'])

export interface FactureTarget {
  cogId: string
  numeroCommande: string
  montantHT?: number
  statut?: string
  ressourceId: string
  ressourceName: string
  ressourceEmail: string
  methodePaiement?: string
  iban?: string
  paypal?: string
  instructionsPaiement?: string
  projetRef?: string
  projetName?: string
  hasFacture: boolean
  eligible: boolean
  reason?: 'paid' | 'cancelled' | 'has_facture'
}

function s(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (Array.isArray(val)) return s(val[0])
  return ''
}
function n(val: unknown): number | undefined {
  if (typeof val === 'number') return val
  if (typeof val === 'string' && val.trim() !== '') { const x = Number(val); return isNaN(x) ? undefined : x }
  return undefined
}
const norm = (v: string) => v.trim().toLowerCase()

/**
 * Find the COGS line a prestataire can drop an invoice on.
 *
 * Matching is primarily on the numéro de commande — so a presta can deposit as
 * soon as the amount is validated, WITHOUT waiting for a Ressource to be
 * assigned. When a Ressource *with an email* is already assigned, that email
 * must match the one entered (kept as a light security check); otherwise the
 * command number alone is enough. Returns null if no line carries the number;
 * otherwise a target with `eligible` reflecting the COGS status (already-paid /
 * cancelled lines are returned but flagged non-eligible).
 */
export async function findFactureTarget(
  email: string,
  numeroCommande: string,
): Promise<FactureTarget | null> {
  const store = await ensureStore()
  const wantEmail = norm(email)
  const wantCmd = numeroCommande.trim()
  if (!wantEmail || !wantCmd) return null

  const projetNameMap = buildLookupMap(store.projets, 'Projet')
  const projetRefMap = buildLookupMap(store.projets, 'Project réf')

  const matches: FactureTarget[] = []

  for (const c of store.cogs.records) {
    const f = c.fields
    if (s(f['Numéro de commande']).trim() !== wantCmd) continue

    const ressourceId = (f['Ressource'] as string[] | undefined)?.[0]
    const res = ressourceId ? store.ressources.byId.get(ressourceId) : undefined
    const resEmail = res ? s(res.fields['Email']) : ''
    // If a resource with an email is already assigned, keep the email check.
    // If not (no resource yet), the numéro de commande alone is enough.
    if (resEmail && norm(resEmail) !== wantEmail) continue

    const statut = s(f['Statut de la dépense']) || undefined
    const projetId = (f['Projet'] as string[] | undefined)?.[0]
    const facture = f['Facture']
    const hasFacture = Array.isArray(facture) && facture.length > 0
    const statutEligible = !statut || !NON_ELIGIBLE_STATUTS.has(statut)
    // A line that already carries an invoice can no longer be dropped on —
    // the presta must reach out to the project manager.
    const eligible = statutEligible && !hasFacture

    matches.push({
      cogId: c.id,
      numeroCommande: wantCmd,
      montantHT: n(f['Montant HT engagé (prod)']),
      statut,
      ressourceId: ressourceId || '',
      ressourceName: res ? s(res.fields['Name']) : '',
      // Use the resource email when known, else the email the presta entered
      // (so the confirmation email still reaches them).
      ressourceEmail: resEmail || wantEmail,
      methodePaiement: s(f['Méthode de paiement']) || undefined,
      iban: res ? s(res.fields['IBAN']) || undefined : undefined,
      paypal: res ? s(res.fields['Paypal']) || undefined : undefined,
      instructionsPaiement: res ? s(res.fields['Instructions spécifiques de paiement']) || undefined : undefined,
      projetRef: projetId ? projetRefMap.get(projetId) || undefined : undefined,
      projetName: projetId ? projetNameMap.get(projetId) || undefined : undefined,
      hasFacture,
      eligible,
      reason: statut === 'Payée' ? 'paid' : statut === 'Annulée' ? 'cancelled' : hasFacture ? 'has_facture' : undefined,
    })
  }

  if (matches.length === 0) return null
  // Prefer an eligible line if several share the command number.
  return matches.find((m) => m.eligible) ?? matches[0]
}

/** Payment date = the 15th of the month following the deposit. */
export function paymentDateFor(deposit: Date): { iso: string; label: string } {
  const y = deposit.getFullYear()
  const m = deposit.getMonth()
  const d = new Date(y, m + 1, 15)
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`
  const label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return { iso, label }
}
