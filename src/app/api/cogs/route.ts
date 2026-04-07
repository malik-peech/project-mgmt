import { NextResponse } from 'next/server'
import { createRecord, TABLES } from '@/lib/airtable'
import { ensureStore, buildLookupMap, refreshTable } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
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
  resMap: Map<string, string>,
  projetNameMap: Map<string, string>,
  projetRefMap: Map<string, string>,
  clientMap?: Map<string, string>,
  projetsById?: Map<string, { id: string; fields: Record<string, unknown> }>
): Cogs {
  const f = r.fields
  const ressourceIds = f['Ressource'] as string[] | undefined
  const ressourceId = ressourceIds?.[0]
  const projetId = (f['Projet'] as string[])?.[0]

  // Resolve client name via the linked project's Client link field
  const projetRecord = projetId && projetsById ? projetsById.get(projetId) : undefined
  const clientIds = projetRecord?.fields['Client link'] as string[] | undefined
  const clientId = clientIds?.[0]
  const clientName = clientId && clientMap ? clientMap.get(clientId) : undefined

  return {
    id: r.id,
    numeroCommande: str(f['Numéro de commande']),
    statut: str(f['Statut de la dépense']) as Cogs['statut'],
    projetId,
    projetName: projetId ? projetNameMap.get(projetId) || '' : '',
    projetRef: projetId ? projetRefMap.get(projetId) || '' : '',
    clientName,
    categorie: str((f['Catégorie'] as unknown[])?.[0]),
    ressourceId,
    ressourceName: ressourceId ? resMap.get(ressourceId) || '' : '',
    montantBudgeteSales: num(f['Montant HT budgété (sales)']),
    montantEngageProd: num(f['Montant HT engagé (prod)']),
    tva: num(f['TVA']),
    montantTTC: num(f['Montant TTC']),
    bdcEnvoye: !!f['BDC envoyé'],
    numeroFacture: str(f['Numéro de facture']),
    facture: Array.isArray(f['Facture'])
      ? (f['Facture'] as { url: string; filename: string; type?: string; size?: number }[]).map((a) => ({
          url: a.url, filename: a.filename, type: a.type, size: a.size,
        }))
      : undefined,
    commentaire: str(f['Commentaire COGS']),
    pm: str((f['PM'] as unknown[])?.[0]),
    okPourPaiement: !!f['OK pour paiement'],
    methodePaiement: str(f['Méthode de paiement']),
    qualiteNote: num(f['Qualité (note)']),
    qualiteComment: str(f['Qualité (comment)']),
    createdAt: str(f['Date de création']),
  }
}

export async function GET(request: Request) {
  try {
    const store = await ensureStore()
    const { searchParams } = new URL(request.url)
    const pmFilter = searchParams.get('pm')
    const daFilter = searchParams.get('da')
    const statutFilter = searchParams.get('statut')
    const projetId = searchParams.get('projetId')

    // Build lookup maps from store
    const resMap = buildLookupMap(store.ressources, 'Name')
    const projetNameMap = buildLookupMap(store.projets, 'Projet')
    const projetRefMap = buildLookupMap(store.projets, 'Project réf')
    const clientMap = buildLookupMap(store.clients, 'Client')

    // Helper: extract singleSelect value (may be string or {id,name})
    const extractSelect = (raw: unknown): string | undefined => {
      if (typeof raw === 'string') return raw
      if (typeof raw === 'object' && raw && 'name' in (raw as Record<string, unknown>)) {
        return String((raw as Record<string, unknown>).name)
      }
      return undefined
    }

    // If DA filter, pre-compute the set of project IDs where DA (official) matches
    let daProjetIds: Set<string> | null = null
    if (daFilter) {
      daProjetIds = new Set<string>()
      for (const p of store.projets.records) {
        if (extractSelect(p.fields['DA (official)']) === daFilter) daProjetIds.add(p.id)
      }
    }

    // If PM filter, pre-compute the set of project IDs where PM2 (manual) matches
    // (the direct PM lookup field on COGS only reflects PM (manual), not PM2)
    let pm2ProjetIds: Set<string> | null = null
    if (pmFilter) {
      pm2ProjetIds = new Set<string>()
      for (const p of store.projets.records) {
        if (extractSelect(p.fields['PM2 (manual)']) === pmFilter) pm2ProjetIds.add(p.id)
      }
    }

    const cogs: Cogs[] = []

    for (const r of store.cogs.records) {
      const f = r.fields

      // Filter by PM (manual) — lookup field, returns array — OR by PM2 via linked project
      if (pmFilter) {
        const pms = f['PM (manual)'] as string[] | undefined
        const matchesPm = pms?.some((p) => p === pmFilter)
        const projets = f['Projet'] as string[] | undefined
        const matchesPm2 = projets?.some((pid) => pm2ProjetIds!.has(pid))
        if (!matchesPm && !matchesPm2) continue
      }

      // Filter by DA — match via linked project's DA (official)
      if (daFilter && daProjetIds) {
        const projets = f['Projet'] as string[] | undefined
        if (!projets || !projets.some((pid) => daProjetIds!.has(pid))) continue
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

      cogs.push(mapRecord(r, resMap, projetNameMap, projetRefMap, clientMap, store.projets.byId))
    }

    // Sort by creation date desc
    cogs.sort((a, b) => {
      if (!a.createdAt && !b.createdAt) return 0
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.localeCompare(a.createdAt)
    })

    return NextResponse.json(sanitize(cogs), {
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
