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
  cogsBudget?: number
  offreInitiale?: number
  offreFinale?: number
  cogsList: Cogs[]
}

/**
 * GET /api/admin/cogs-to-approve
 *
 * Returns all projects that have at least one COGS in an "A Approuver" status,
 * grouped by project, ready for fast Admin validation.
 */
export async function GET() {
  try {
    const store = await ensureStore()
    const clientMap = buildLookupMap(store.clients, 'Client')
    const resMap = buildLookupMap(store.ressources, 'Name')
    const projetNameMap = buildLookupMap(store.projets, 'Projet')
    const projetRefMap = buildLookupMap(store.projets, 'Project réf')

    // Build a map of project rows so we can attach COGS to them.
    const rowsById = new Map<string, ProjetRow>()

    // Index COGS by project, keep only "A Approuver" ones
    for (const r of store.cogs.records) {
      const f = r.fields
      const statut = str(f['Statut de la dépense'])
      if (!statut || !APPROUVER_STATUTS.has(statut)) continue
      const projets = f['Projet'] as string[] | undefined
      const projetId = projets?.[0]
      if (!projetId) continue

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
          cogsBudget: num(pf['COGS - budget (€)']),
          offreInitiale: num(pf['Offre - Valeur initiale']),
          offreFinale: num(pf['Offre - Valeur finale']),
          cogsList: [],
        }
        rowsById.set(projetId, row)
      }

      const ressourceIds = f['Ressource'] as string[] | undefined
      const ressourceId = ressourceIds?.[0]

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
        commentaire: str(f['Commentaire COGS']),
        createdAt: str(f['Date de création']),
      }
      row.cogsList.push(cog)
    }

    // Sort COGS within each project by amount desc
    const rows = Array.from(rowsById.values()).map((r) => ({
      ...r,
      cogsList: r.cogsList.sort(
        (a, b) =>
          (b.montantBudgeteSales || b.montantEngageProd || 0) -
          (a.montantBudgeteSales || a.montantEngageProd || 0),
      ),
    }))

    // Sort projects by COGS count desc, then by name
    rows.sort((a, b) => {
      if (a.cogsList.length !== b.cogsList.length) return b.cogsList.length - a.cogsList.length
      return (a.nom || '').localeCompare(b.nom || '')
    })

    const counts = {
      projets: rows.length,
      cogs: rows.reduce((s, r) => s + r.cogsList.length, 0),
      total: rows.reduce(
        (s, r) =>
          s + r.cogsList.reduce((c, x) => c + (x.montantBudgeteSales || x.montantEngageProd || 0), 0),
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
