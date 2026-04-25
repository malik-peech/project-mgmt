import { NextResponse } from 'next/server'
import { ensureStore, buildLookupMap } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import type { Cogs } from '@/types'

const APPROUVER_STATUTS = new Set([
  'A Approuver',
  'A Approuver (CDP)',
  'A Approuver (CSM)',
])

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

type ProjetRow = {
  id: string
  ref?: string
  nom: string
  clientName?: string
  pm?: string
  pm2?: string
  agence?: string
  statut?: string
  bdc?: string
  numeroCommande?: string
  cogsBudget?: number
  offreInitiale?: number
  offreFinale?: number
  toApproveCount: number
  cogsList: Cogs[]
}

/**
 * GET /api/admin/cogs-to-approve
 *
 * Returns all projects that have at least one COGS in an "A Approuver" status.
 * For each such project, returns ALL its COGS (any status) so the admin can
 * see the full picture and edit individual rows.
 */
export async function GET() {
  try {
    const store = await ensureStore()
    const clientMap = buildLookupMap(store.clients, 'Client')
    const resMap = buildLookupMap(store.ressources, 'Name')
    const projetNameMap = buildLookupMap(store.projets, 'Projet')
    const projetRefMap = buildLookupMap(store.projets, 'Project réf')

    // First pass: identify projects with at least 1 "A Approuver" COGS
    const projetsWithToApprove = new Set<string>()
    for (const r of store.cogs.records) {
      const statut = str(r.fields['Statut de la dépense'])
      if (!statut || !APPROUVER_STATUTS.has(statut)) continue
      const projets = r.fields['Projet'] as string[] | undefined
      const projetId = projets?.[0]
      if (projetId) projetsWithToApprove.add(projetId)
    }

    // Second pass: build rows with ALL their COGS
    const rowsById = new Map<string, ProjetRow>()
    for (const r of store.cogs.records) {
      const f = r.fields
      const projets = f['Projet'] as string[] | undefined
      const projetId = projets?.[0]
      if (!projetId || !projetsWithToApprove.has(projetId)) continue

      const projetRecord = store.projets.byId.get(projetId)
      if (!projetRecord) continue

      let row = rowsById.get(projetId)
      if (!row) {
        const pf = projetRecord.fields
        const clientIds = pf['Client link'] as string[] | undefined
        const clientId = clientIds?.[0]
        row = {
          id: projetId,
          ref: str(pf['Project réf']),
          nom: str(pf['Projet']) || '',
          clientName: clientId ? clientMap.get(clientId) || '' : '',
          pm: sel(pf['PM (manual)']),
          pm2: sel(pf['PM2 (manual)']),
          agence: sel(pf['Agence']),
          statut: str(pf['Statut']),
          bdc: sel(pf['BDC']),
          numeroCommande: str(pf['Numéro de commande']),
          cogsBudget: num(pf['COGS - budget (€)']),
          offreInitiale: num(pf['Offre - Valeur initiale']),
          offreFinale: num(pf['Offre - Valeur finale']),
          toApproveCount: 0,
          cogsList: [],
        }
        rowsById.set(projetId, row)
      }

      const ressourceIds = f['Ressource'] as string[] | undefined
      const ressourceId = ressourceIds?.[0]
      const statut = str(f['Statut de la dépense'])

      const cog: Cogs = {
        id: r.id,
        numeroCommande: str(f['Numéro de commande']),
        statut: statut as Cogs['statut'],
        projetId,
        projetName: projetNameMap.get(projetId) || '',
        projetRef: projetRefMap.get(projetId) || '',
        categorie: str((f['Catégorie'] as unknown[])?.[0]),
        ressourceId,
        ressourceName: ressourceId ? resMap.get(ressourceId) || '' : '',
        montantBudgeteSales: num(f['Montant HT budgété (sales)']),
        montantEngageProd: num(f['Montant HT engagé (prod)']),
        tva: num(f['TVA']),
        autorisationVanessa: num(f['Autorisation Vanessa']),
        commentaire: str(f['Commentaire COGS']),
        createdAt: str(f['Date de création']),
      }
      row.cogsList.push(cog)
      if (statut && APPROUVER_STATUTS.has(statut)) row.toApproveCount += 1
    }

    // Sort COGS within each project: "A Approuver" first, then by amount desc
    const rows = Array.from(rowsById.values()).map((r) => ({
      ...r,
      cogsList: r.cogsList.sort((a, b) => {
        const aTo = a.statut && APPROUVER_STATUTS.has(a.statut) ? 0 : 1
        const bTo = b.statut && APPROUVER_STATUTS.has(b.statut) ? 0 : 1
        if (aTo !== bTo) return aTo - bTo
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
              (x.statut && APPROUVER_STATUTS.has(x.statut)
                ? x.montantBudgeteSales || x.montantEngageProd || 0
                : 0),
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
