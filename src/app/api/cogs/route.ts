import { NextResponse } from 'next/server'
import { createRecord, TABLES } from '@/lib/airtable'
import { ensureStore, buildLookupMap, refreshTable } from '@/lib/store'
import type { Cogs } from '@/types'

function mapRecord(
  r: { id: string; fields: Record<string, unknown> },
  resMap: Map<string, string>
): Cogs {
  const f = r.fields
  const ressourceIds = f['Ressource'] as string[] | undefined
  const ressourceId = ressourceIds?.[0]
  return {
    id: r.id,
    numeroCommande: f['Numéro de commande'] as string | undefined,
    statut: f['Statut de la dépense'] as Cogs['statut'],
    projetId: (f['Projet'] as string[])?.[0],
    clientName: (f['Client'] as string[])?.[0],
    categorie: (f['Catégorie'] as string[])?.[0],
    ressourceId,
    ressourceName: ressourceId ? resMap.get(ressourceId) || '' : '',
    montantBudgeteSales: f['Montant HT budgété (sales)'] as number | undefined,
    montantEngageProd: f['Montant HT engagé (prod)'] as number | undefined,
    tva: f['TVA'] as number | undefined,
    montantTTC: f['Montant TTC'] as number | undefined,
    bdcEnvoye: !!f['BDC envoyé'],
    numeroFacture: f['Numéro de facture'] as string | undefined,
    commentaire: f['Commentaire COGS'] as string | undefined,
    pm: (f['PM'] as string[])?.[0],
    okPourPaiement: !!f['OK pour paiement'],
    methodePaiement: f['Méthode de paiement'] as string | undefined,
    createdAt: f['Date de création'] as string | undefined,
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
