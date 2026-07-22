import { NextResponse } from 'next/server'
import { TABLES } from '@/lib/airtable'
import { ensureStore, buildLookupMap, upsertRecord } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import { buildCategoriesCogsMaps, resolveCategorieName, resolveCategorieId } from '@/lib/categories-cogs'
import type { Cogs } from '@/types'

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
const COGS_TABLE_ID = 'tblnrqX6xNx5EWFsC'

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
  clientMap: Map<string, string> | undefined,
  projetsById: Map<string, { id: string; fields: Record<string, unknown> }> | undefined,
  categorieIdToName: Map<string, string>,
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
    categorie: resolveCategorieName((f['Catégorie officielle'] as unknown[])?.[0], categorieIdToName),
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
    autorisationVanessa: num(f['Autorisation Vanessa']),
    createdAt: str(f['Date de création']),
  }
}

export async function GET(request: Request) {
  try {
    const store = await ensureStore()
    const { searchParams } = new URL(request.url)
    const pmFilter = searchParams.get('pm')
    const daFilter = searchParams.get('da')
    const salesFilter = searchParams.get('sales')
    const statutFilter = searchParams.get('statut')
    const projetId = searchParams.get('projetId')
    // "Intentions" mode: return only COGS linked to the generic "Intention"
    // project (réf 1789), ignoring PM/DA scoping. Used by the dedicated
    // "COGS intentions" block on the COGS page.
    const intentionsOnly = searchParams.get('intentions') === '1'

    // Build lookup maps from store
    const resMap = buildLookupMap(store.ressources, 'Name')
    const projetNameMap = buildLookupMap(store.projets, 'Projet')
    const projetRefMap = buildLookupMap(store.projets, 'Project réf')
    const clientMap = buildLookupMap(store.clients, 'Client')
    const { idToName: categorieIdToName } = buildCategoriesCogsMaps(store)

    // Project IDs of the generic "Intention" project (réf 1789). COGS linked to
    // these are surfaced in a separate block, not in the scoped PM/DA lists.
    const INTENTIONS_REF = '1789'
    const intentionProjetIds = new Set<string>()
    for (const [pid, ref] of projetRefMap) {
      if (String(ref).trim() === INTENTIONS_REF) intentionProjetIds.add(pid)
    }

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

    // If Sales filter, pre-compute the set of project IDs where Sales matches.
    // (Sales is a field on Projets, not on COGS — we match via the linked project.)
    let salesProjetIds: Set<string> | null = null
    if (salesFilter) {
      salesProjetIds = new Set<string>()
      for (const p of store.projets.records) {
        if (extractSelect(p.fields['Sales']) === salesFilter) salesProjetIds.add(p.id)
      }
    }

    const cogs: Cogs[] = []

    for (const r of store.cogs.records) {
      const f = r.fields

      const projetsOfCog = f['Projet'] as string[] | undefined
      const isIntention = !!projetsOfCog && projetsOfCog.some((pid) => intentionProjetIds.has(pid))

      // Intentions mode: keep only COGS on the "Intention" project, no scoping.
      if (intentionsOnly) {
        if (!isIntention) continue
        cogs.push(mapRecord(r, resMap, projetNameMap, projetRefMap, clientMap, store.projets.byId, categorieIdToName))
        continue
      }

      // Outside intentions mode, keep intention COGS out of the PM/DA scoped
      // lists — they live in the dedicated "COGS intentions" block instead.
      if ((pmFilter || daFilter) && isIntention) continue

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

      // Filter by Sales — match via linked project's Sales
      if (salesFilter && salesProjetIds) {
        const projets = f['Projet'] as string[] | undefined
        if (!projets || !projets.some((pid) => salesProjetIds!.has(pid))) continue
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

      cogs.push(mapRecord(r, resMap, projetNameMap, projetRefMap, clientMap, store.projets.byId, categorieIdToName))
    }

    // Sort by creation date desc
    cogs.sort((a, b) => {
      if (!a.createdAt && !b.createdAt) return 0
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.localeCompare(a.createdAt)
    })

    return NextResponse.json(sanitize(cogs), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Error fetching COGS:', error)
    return NextResponse.json({ error: 'Failed to fetch COGS' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Auto-statut when caller doesn't pass one explicitly:
    // - sales entry (montantBudgeteSales present): >200 → "A Approuver", else "Estimée"
    // - PM entry: always "A Approuver"
    let statut: string = body.statut
    if (!statut) {
      const salesAmt = typeof body.montantBudgeteSales === 'number' ? body.montantBudgeteSales : null
      statut = salesAmt != null && salesAmt <= 200 ? 'Estimée' : 'A Approuver'
    }

    const fields: Record<string, unknown> = {
      'Projet': body.projetId ? [body.projetId] : undefined,
      'Ressource': body.ressourceId ? [body.ressourceId] : undefined,
      'Montant HT engagé (prod)': body.montantEngageProd,
      'Montant HT budgété (sales)': body.montantBudgeteSales,
      'Statut de la dépense': statut,
    }

    // Catégorie is a link field → resolve the human-readable name from the form
    // to the actual record ID in the linked Catégories COGS table.
    if (body.categorie) {
      const store = await ensureStore()
      const { nameToId } = buildCategoriesCogsMaps(store)
      const recId = resolveCategorieId(String(body.categorie), nameToId)
      if (recId) {
        fields['Catégorie officielle'] = [recId]
      } else {
        console.warn('[COGS POST] No Catégorie record matches', JSON.stringify(body.categorie), '— COGS will be created without category')
      }
    }
    if (body.commentaire) fields['Commentaire COGS'] = body.commentaire

    Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k])

    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AIRTABLE_API_KEY not set' }, { status: 500 })

    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${COGS_TABLE_ID}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields, typecast: true }),
    })

    if (!res.ok) {
      const errTxt = await res.text()
      console.error('[COGS POST] Airtable error:', res.status, errTxt)
      return NextResponse.json({ error: errTxt }, { status: res.status })
    }

    const record = await res.json() as { id: string; fields: Record<string, unknown> }
    upsertRecord(TABLES.COGS, { id: record.id, fields: record.fields })

    return NextResponse.json({ id: record.id })
  } catch (error) {
    console.error('Error creating COGS:', error)
    return NextResponse.json({ error: 'Failed to create COGS' }, { status: 500 })
  }
}
