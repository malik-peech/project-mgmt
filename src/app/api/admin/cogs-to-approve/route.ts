import { NextResponse } from 'next/server'
import { ensureStore, buildLookupMap } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import type { Cogs } from '@/types'

const APPROUVER_STATUTS = new Set([
  'A Approuver',
  'A Approuver (CDP)',
  'A Approuver (CSM)',
])

const ATTENTION_AMOUNT_THRESHOLD = 200

function num(val: unknown): number | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return val
  if (typeof val === 'object') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

function str(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') return undefined
  return String(val)
}

function sel(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val && 'name' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).name)
  }
  return str(val)
}

/** A COGS line "needs attention" from the admin if EITHER:
 *  - its statut is one of the "A Approuver" variants, OR
 *  - its amount (HT Sales or HT Prod) is > 200 € AND no Autorisation Vanessa has been entered.
 */
function needsAttention(c: {
  statut?: string
  montantBudgeteSales?: number
  montantEngageProd?: number
  autorisationVanessa?: number
}): boolean {
  if (c.statut && APPROUVER_STATUTS.has(c.statut)) return true
  const amount = Math.max(c.montantBudgeteSales || 0, c.montantEngageProd || 0)
  if (amount > ATTENTION_AMOUNT_THRESHOLD && c.autorisationVanessa == null) return true
  return false
}

type ProjetRow = {
  id: string
  ref?: string
  nom: string
  clientName?: string
  pm?: string
  pm2?: string
  agence?: string
  statut?: string
  cogsBudget?: number
  offreInitiale?: number
  offreFinale?: number
  toApproveCount: number
  cogsList: (Cogs & { needsAttention: boolean })[]
}

/**
 * GET /api/admin/cogs-to-approve
 *
 * Returns all projects that have at least one COGS needing admin attention:
 *   - statut in "A Approuver" / "(CDP)" / "(CSM)", OR
 *   - amount > 200 € (HT sales or prod) AND no Autorisation Vanessa entered.
 *
 * For each qualifying project, returns ALL its COGS so the admin can see
 * the full picture and edit individual rows. Each COGS carries a
 * `needsAttention` flag.
 */
export async function GET() {
  try {
    const store = await ensureStore()
    const clientMap = buildLookupMap(store.clients, 'Client')
    const resMap = buildLookupMap(store.ressources, 'Name')
    const projetNameMap = buildLookupMap(store.projets, 'Projet')
    const projetRefMap = buildLookupMap(store.projets, 'Project réf')

    // First pass: extract minimal COGS info per record to identify qualifying projects.
    const allCogs: {
      record: { id: string; fields: Record<string, unknown> }
      projetId: string
      statut?: string
      montantBudgeteSales?: number
      montantEngageProd?: number
      autorisationVanessa?: number
    }[] = []

    for (const r of store.cogs.records) {
      const f = r.fields
      const projets = f['Projet'] as string[] | undefined
      const projetId = projets?.[0]
      if (!projetId) continue
      allCogs.push({
        record: r,
        projetId,
        statut: str(f['Statut de la dépense']),
        montantBudgeteSales: num(f['Montant HT budgété (sales)']),
        montantEngageProd: num(f['Montant HT engagé (prod)']),
        autorisationVanessa: num(f['Autorisation Vanessa']),
      })
    }

    const qualifyingProjets = new Set<string>()
    for (const c of allCogs) {
      if (needsAttention(c)) qualifyingProjets.add(c.projetId)
    }

    // Second pass: build rows with ALL their COGS
    const rowsById = new Map<string, ProjetRow>()
    for (const c of allCogs) {
      if (!qualifyingProjets.has(c.projetId)) continue
      const projetRecord = store.projets.byId.get(c.projetId)
      if (!projetRecord) continue

      let row = rowsById.get(c.projetId)
      if (!row) {
        const pf = projetRecord.fields
        const clientIds = pf['Client link'] as string[] | undefined
        const clientId = clientIds?.[0]
        row = {
          id: c.projetId,
          ref: str(pf['Project réf']),
          nom: str(pf['Projet']) || '',
          clientName: clientId ? clientMap.get(clientId) || '' : '',
          pm: sel(pf['PM (manual)']),
          pm2: sel(pf['PM2 (manual)']),
          agence: sel(pf['Agence']),
          statut: str(pf['Statut']),
          cogsBudget: num(pf['COGS - budget (€)']),
          offreInitiale: num(pf['Offre - Valeur initiale']),
          offreFinale: num(pf['Offre - Valeur finale']),
          toApproveCount: 0,
          cogsList: [],
        }
        rowsById.set(c.projetId, row)
      }

      const r = c.record
      const f = r.fields
      const ressourceIds = f['Ressource'] as string[] | undefined
      const ressourceId = ressourceIds?.[0]
      const flagged = needsAttention(c)

      row.cogsList.push({
        id: r.id,
        // Numéro de commande on COGS is a formula field — read-only, sourced
        // from the linked project — but we still display it here.
        numeroCommande: str(f['Numéro de commande']),
        statut: c.statut as Cogs['statut'],
        projetId: c.projetId,
        projetName: projetNameMap.get(c.projetId) || '',
        projetRef: projetRefMap.get(c.projetId) || '',
        categorie: str((f['Catégorie'] as unknown[])?.[0]),
        ressourceId,
        ressourceName: ressourceId ? resMap.get(ressourceId) || '' : '',
        montantBudgeteSales: c.montantBudgeteSales,
        montantEngageProd: c.montantEngageProd,
        tva: num(f['TVA']),
        autorisationVanessa: c.autorisationVanessa,
        commentaire: str(f['Commentaire COGS']),
        createdAt: str(f['Date de création']),
        needsAttention: flagged,
      })
      if (flagged) row.toApproveCount += 1
    }

    // Sort COGS within each project: needs-attention first, then by amount desc
    const rows = Array.from(rowsById.values()).map((r) => ({
      ...r,
      cogsList: r.cogsList.sort((a, b) => {
        if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1
        const am = a.montantBudgeteSales || a.montantEngageProd || 0
        const bm = b.montantBudgeteSales || b.montantEngageProd || 0
        return bm - am
      }),
    }))

    rows.sort((a, b) => {
      if (a.toApproveCount !== b.toApproveCount) return b.toApproveCount - a.toApproveCount
      return (a.nom || '').localeCompare(b.nom || '')
    })

    const counts = {
      projets: rows.length,
      cogs: rows.reduce((s, r) => s + r.toApproveCount, 0),
      total: rows.reduce(
        (s, r) =>
          s +
          r.cogsList.reduce(
            (c, x) =>
              c +
              (x.needsAttention ? x.montantBudgeteSales || x.montantEngageProd || 0 : 0),
            0,
          ),
        0,
      ),
    }

    return NextResponse.json(sanitize({ rows, counts }), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Error fetching COGS to approve:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
