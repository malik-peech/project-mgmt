import { NextResponse } from 'next/server'
import { createRecord, TABLES } from '@/lib/airtable'
import { ensureStore, buildLookupMap, refreshTable } from '@/lib/store'
import type { Cogs } from '@/types'

/** Safely extract a number from an Airtable field (handles {specialValue} objects) */
function num(val: unknown): number | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return val
  if (typeof val === 'object') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

/** Safely extract a string from an Airtable field */
function str(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') return undefined
  return String(val)
}

function mapRecord(
  r: { id: string; fields: Record<string, unknown> },
  resMap: Map<string, string>
): Cogs {
  const f = r.fields
  const ressourceIds = f['Ressource'] as string[] | undefined
  const ressourceId = ressourceIds?.[0]
  return {
    id: r.id,
    numeroCommande: str(f['Numéro de commande']),
    statut: str(f['Statut de la dépense']) as Cogs['statut'],
    projetId: (f['Projet'] as string[])?.[0],
    clientName: str((f['Client'] as unknown[])?.[0]),
    categorie: str((f['Catégorie'] as unknown[])?.[0]),
    ressourceId,
    ressourceName: ressourceId ? resMap.get(ressourceId) || '' : '',
    montantBudgeteSales: num(f['Montant HT budgété (sales)']),
    montantEngageProd: num(f['Montant HT engagé (prod)']),
    tva: num(f['TVA']),
    montantTTC: num(f['Montant TTC']),
    bdcEnvoye: !!f['BDC envoyé'],
    numeroFacture: str(f['Numéro de facture']),
    commentaire: str(f['Commentaire COGS']),
    pm: str((f['PM'] as unknown[])?.[0]),
    okPourPaiement: !!f['OK pour paiement'],
    methodePaiement: str(f['Méthode de paiement']),
    createdAt: str(f['Date de création']),
  }
}

export async function GET(request: Request) {
  try {
    const store = await ensureStore()
    const { searchParams } = new URL(request.url)
    const pmFilter = searchParams.get('pm')
    const statutFilter = searchParams.get('statut')
    const projetId = searchParams.get('projetId')

    // Build resource name lookup from store
    const resMap = buildLookupMap(store.ressources, 'Name')

    const cogs: Cogs[] = []

    for (const r of store.cogs.records) {
      const f = r.fields

      // Filter by PM
      if (pmFilter) {
        const pms = f['PM'] as string[] | undefined
        if (!pms || !pms.some((p) => p === pmFilter)) continue
      }

      // Filter by statut
      if (statutFilter) {
        const statut = f['Statut de la dépense'] as string | undefined
        if (statut !== statutFilter) continue
      }

      // Filter by project
      if (projetId) {
        const projets = f['Projet'] as string[] | undefined
        if (!projets || !projets.includes(projetId)) continue
      }

      cogs.push(mapRecord(r, resMap))
    }

    // Sort by creation date desc
    cogs.sort((a, b) => {
      if (!a.createdAt && !b.createdAt) return 0
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.localeCompare(a.createdAt)
    })

    return NextResponse.json(cogs, {
      headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=10' },
    })
  } catch (error) {
    console.error('Error fetching COGS:', error)
    return NextResponse.json({ error: 'Failed to fetch COGS' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const fields: Record<string, unknown> = {
      'Projet': body.projetId ? [body.projetId] : undefined,
      'Ressource': body.ressourceId ? [body.ressourceId] : undefined,
      'Montant HT engagé (prod)': body.montantEngageProd,
      'Statut de la dépense': body.statut || 'A Approuver (CDP)',
    }
    if (body.commentaire) fields['Commentaire COGS'] = body.commentaire

    Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k])

    const record = await createRecord(TABLES.COGS, fields as any)

    // Refresh store in background
    refreshTable(TABLES.COGS).catch(() => {})

    return NextResponse.json({ id: record.id })
  } catch (error) {
    console.error('Error creating COGS:', error)
    return NextResponse.json({ error: 'Failed to create COGS' }, { status: 500 })
  }
}
