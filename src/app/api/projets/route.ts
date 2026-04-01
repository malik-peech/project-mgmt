import { NextResponse } from 'next/server'
import { ensureStore, buildLookupMap, refreshTable } from '@/lib/store'
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

export async function GET(request: Request) {
  try {
    const store = await ensureStore()
    const { searchParams } = new URL(request.url)
    const pmFilter = searchParams.get('pm')
    const statutFilter = searchParams.get('statut')

    // Build client name lookup from store
    const clientMap = buildLookupMap(store.clients, 'Client')

    // Filter statuts
    const activeStatuts = statutFilter
      ? [statutFilter]
      : ['En cours', 'Finalisation', 'Stand-by', 'Tentative', 'Intention']

    const projets: Projet[] = []

    for (const r of store.projets.records) {
      const f = r.fields
      const statut = f['Statut'] as string | undefined
      if (!statut || !activeStatuts.includes(statut)) continue

      const pm = f['PM (manual)'] as string | undefined
      if (pmFilter && pm !== pmFilter) continue

      const clientIds = f['Client link'] as string[] | undefined
      const clientId = clientIds?.[0]

      // Agence and DA (official) are singleSelect → may be {id, name} objects
      const agenceRaw = f['Agence']
      const agence = typeof agenceRaw === 'object' && agenceRaw && 'name' in (agenceRaw as Record<string, unknown>)
        ? String((agenceRaw as Record<string, unknown>).name)
        : str(agenceRaw)
      const daOfficialRaw = f['DA (official)']
      const daOfficial = typeof daOfficialRaw === 'object' && daOfficialRaw && 'name' in (daOfficialRaw as Record<string, unknown>)
        ? String((daOfficialRaw as Record<string, unknown>).name)
        : str(daOfficialRaw)

      projets.push({
        id: r.id,
        ref: str(f['Project réf']),
        nom: str(f['Projet']) || '',
        clientId,
        clientName: clientId ? clientMap.get(clientId) || '' : '',
        agence,
        bu: str((f['BU'] as unknown[])?.[0]) || str(f['BU']),
        am: str(f['Account Manager (AM)']),
        pm,
        da: str(f['DA']),
        daOfficial,
        pc: str(f['Project Coordinator (PC)']),
        filmmaker: str(f['Filmmaker']),
        phase: str(f['Phase']) as Projet['phase'],
        statut: statut as Projet['statut'],
        typeProjet: str(f['Type de projet']) as Projet['typeProjet'],
        cogsBudget: num(f['COGS - budget (€)']),
        cogsReels: num(f['COGS - réels (€)']),
        cogsPrevus: num(f['COGS - prévus (€)']),
        cogsAEngager: num(f['COGS - à engager (€)']),
        timeCreaBudget: num(f['Time Créa - budget (h)']),
        sizing: num(f['Sizing (h)']),
        travelBudget: num(f['Travel - budget (€)']),
        offreInitiale: num(f['Offre - Valeur initiale']),
        offreFinale: num(f['Offre - Valeur finale']),
        dateFinalisationPrevue: str(f['Date de finalisation prévue']),
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
      headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=10' },
    })
  } catch (error) {
    console.error('Error fetching projets:', error)
    return NextResponse.json({ error: 'Failed to fetch projets' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, pm, daOfficial, phase } = body as { id?: string; pm?: string; daOfficial?: string; phase?: string }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const fields: Record<string, string | null> = {}
    if (pm !== undefined) fields['PM (manual)'] = pm || null
    if (daOfficial !== undefined) fields['DA (official)'] = daOfficial || null
    if (phase !== undefined) fields['Phase'] = phase || null

    await updateRecord(TABLES.PROJETS, id, fields as Record<string, string>)
    await refreshTable(TABLES.PROJETS)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating projet:', error)
    return NextResponse.json({ error: 'Failed to update projet' }, { status: 500 })
  }
}
