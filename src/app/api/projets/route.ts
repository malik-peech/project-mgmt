import { NextResponse } from 'next/server'
import { ensureStore, buildLookupMap, upsertRecord } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import { updateRecord, TABLES } from '@/lib/airtable'
import type { Projet } from '@/types'

/** Safely extract a number from an Airtable field (handles {specialValue} objects) */
function num(val: unknown): number | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return val
  if (typeof val === 'object') return undefined // {specialValue: ...}
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

/** Safely extract a string from an Airtable field */
function str(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') return undefined // {specialValue: ...}
  return String(val)
}

/** Extract singleSelect value (may be string or {id,name} object) */
function sel(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val && 'name' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).name)
  }
  return str(val)
}

export async function GET(request: Request) {
  try {
    const store = await ensureStore()
    const { searchParams } = new URL(request.url)
    const pmFilter = searchParams.get('pm')
    const daFilter = searchParams.get('da')
    const salesFilter = searchParams.get('sales')
    const statutFilter = searchParams.get('statut')
    const includeAll = searchParams.get('all') === '1'

    // Build client name lookup from store
    const clientMap = buildLookupMap(store.clients, 'Client')

    // Filter statuts
    const activeStatuts = statutFilter
      ? [statutFilter]
      : includeAll
      ? ['En cours', 'Finalisation', 'Stand-by', 'Tentative', 'Intention', 'Done']
      : ['En cours', 'Finalisation', 'Stand-by', 'Tentative', 'Intention']

    const projets: Projet[] = []

    for (const r of store.projets.records) {
      const f = r.fields
      const statut = f['Statut'] as string | undefined
      if (!statut || !activeStatuts.includes(statut)) continue

      const pm = sel(f['PM (manual)'])
      const pm2 = sel(f['PM2 (manual)'])
      const agence = sel(f['Agence'])
      const daOfficial = sel(f['DA (official)'])
      const sales = sel(f['Sales'])
      const currency = sel(f['Currency']) as Projet['currency']
      const origine = sel(f['Origine']) as Projet['origine']
      const typeDeContact = sel(f['type de contact']) as Projet['typeDeContact']
      const diffusable = sel(f['Diffusable ?']) as Projet['diffusable']
      const pointEop = sel(f['Point EOP']) as Projet['pointEop']

      // Filters
      if (pmFilter && pm !== pmFilter && pm2 !== pmFilter) continue
      if (daFilter && daOfficial !== daFilter) continue
      if (salesFilter && sales !== salesFilter) continue

      const clientIds = f['Client link'] as string[] | undefined
      const clientId = clientIds?.[0]
      const moisSignatureIds = f['Mois signature'] as string[] | undefined

      projets.push({
        id: r.id,
        ref: str(f['Project réf']),
        nom: str(f['Projet']) || '',
        clientId,
        clientName: clientId ? clientMap.get(clientId) || '' : '',
        agence,
        bu: str((f['Bu lookup'] as unknown[])?.[0]) || str((f['BU'] as unknown[])?.[0]) || str(f['BU']),
        am: str(f['Account Manager (AM)']),
        pm,
        pm2,
        da: str(f['DA']),
        daOfficial,
        pasDeDa: !!f['Pas de DA'],
        briefEffectue: !!f['Brief effectué'],
        dateBrief: str(f['Date de brief (si non)']),
        statutBrief: str(f['Statut du brief']),
        pc: str(f['Project Coordinator (PC)']),
        filmmaker: str(f['Filmmaker']),
        phase: str(f['Phase']) as Projet['phase'],
        statut: statut as Projet['statut'],
        typeProjet: str(f['Type de projet']) as Projet['typeProjet'],
        sales,
        moisSignatureIds,
        currency,
        origine,
        numeroDevis: str(f['Numéro de devis']),
        dureeContrat: num(f['Durée contrat (mois)']),
        libelleFacture: str(f['Libellé facture']),
        contactCompta: str(f['Contact compta']),
        typeDeContact,
        frameArchive: !!f['Frame archivé'],
        slackArchive: !!f['Slack archivé'],
        eopMonthIds: f['EOP month'] as string[] | undefined,
        diffusable,
        pointEop,
        datePointEop: str(f['Date point EOP']),
        cogsBudget: num(f['COGS - budget (€)']),
        cogsReels: num(f['COGS - réels (€)']),
        cogsPrevus: num(f['COGS - prévus (€)']),
        cogsAEngager: num(f['COGS - à engager (€)']),
        timeCreaBudget: num(f['Time Créa - budget (h)']),
        timeProdBudget: num(f['Time Prod - budget (h)']),
        timeDaBudget: num(f['Time DA- budget (h)']),
        sizing: num(f['Sizing (h)']),
        travelBudget: num(f['Travel - budget (€)']),
        offreInitiale: num(f['Offre - Valeur initiale']),
        offreFinale: num(f['Offre - Valeur finale']),
        dateFinalisationPrevue: str(f['Date de finalisation prévue']),
        facturable100: !!f['Facturable 100%'],
        nextTaskDate: str((f['#next_task_date'] as unknown[])?.[0]),
        nextTask: str((f['next task'] as unknown[])?.[0]),
        alerteHeures: str(f['Alerte Heures']),
        progression: str(f['Progression']),
        percentCogs: str(f['% COGS']),
        ehr: str(f['EHR']),
        devisSigne: Array.isArray(f['Devis signé'])
          ? (f['Devis signé'] as { url: string; filename: string; type?: string; size?: number }[]).map((a) => ({
              url: a.url,
              filename: a.filename,
              type: a.type,
              size: a.size,
            }))
          : undefined,
        taskIds: f['Task'] as string[] | undefined,
        cogsIds: f['Dépenses (COGS)'] as string[] | undefined,
      })
    }

    // Sort by statut then project name
    projets.sort((a, b) => {
      const si = activeStatuts.indexOf(a.statut || '')
      const sj = activeStatuts.indexOf(b.statut || '')
      if (si !== sj) return si - sj
      return (a.nom || '').localeCompare(b.nom || '')
    })

    return NextResponse.json(sanitize(projets), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Error fetching projets:', error)
    return NextResponse.json({ error: 'Failed to fetch projets' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, pm, pm2, daOfficial, pasDeDa, phase, dateFinalisationPrevue, facturable100, briefEffectue, dateBrief, cogsBudget } = body as {
      id?: string
      pm?: string
      pm2?: string
      daOfficial?: string
      pasDeDa?: boolean
      phase?: string
      dateFinalisationPrevue?: string | null
      facturable100?: boolean
      briefEffectue?: boolean
      dateBrief?: string | null
      cogsBudget?: number | null
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const fields: Record<string, string | boolean | number | null> = {}
    if (pm !== undefined) fields['PM (manual)'] = pm || null
    if (pm2 !== undefined) fields['PM2 (manual)'] = pm2 || null
    if (daOfficial !== undefined) fields['DA (official)'] = daOfficial || null
    if (pasDeDa !== undefined) fields['Pas de DA'] = !!pasDeDa
    if (phase !== undefined) fields['Phase'] = phase || null
    if (dateFinalisationPrevue !== undefined) fields['Date de finalisation prévue'] = dateFinalisationPrevue || null
    if (facturable100 !== undefined) fields['Facturable 100%'] = !!facturable100
    if (briefEffectue !== undefined) fields['Brief effectué'] = !!briefEffectue
    if (dateBrief !== undefined) fields['Date de brief (si non)'] = dateBrief || null
    if (cogsBudget !== undefined) fields['COGS - budget (€)'] = typeof cogsBudget === 'number' ? cogsBudget : null

    const updated = await updateRecord(TABLES.PROJETS, id, fields as Record<string, string>)
    // Patch store directly with Airtable's response — no full re-fetch.
    upsertRecord(TABLES.PROJETS, { id: updated.id, fields: updated.fields as Record<string, unknown> })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating projet:', error)
    return NextResponse.json({ error: 'Failed to update projet' }, { status: 500 })
  }
}
