import { NextResponse } from 'next/server'
import { ensureStore, buildLookupMap } from '@/lib/store'
import type { Projet } from '@/types'

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

      projets.push({
        id: r.id,
        ref: f['Project réf'] as string | undefined,
        nom: (f['Projet'] as string) || '',
        clientId,
        clientName: clientId ? clientMap.get(clientId) || '' : '',
        am: f['Account Manager (AM)'] as string | undefined,
        pm,
        da: f['DA'] as string | undefined,
        pc: f['Project Coordinator (PC)'] as string | undefined,
        filmmaker: f['Filmmaker'] as string | undefined,
        phase: f['Phase'] as Projet['phase'],
        statut: statut as Projet['statut'],
        typeProjet: f['Type de projet'] as Projet['typeProjet'],
        cogsBudget: f['COGS - budget (€)'] as number | undefined,
        cogsReels: f['COGS - réels (€)'] as number | undefined,
        cogsPrevus: f['COGS - prévus (€)'] as number | undefined,
        cogsAEngager: f['COGS - à engager (€)'] as number | undefined,
        timeCreaBudget: f['Time Créa - budget (h)'] as number | undefined,
        sizing: f['Sizing (h)'] as number | undefined,
        travelBudget: f['Travel - budget (€)'] as number | undefined,
        offreInitiale: f['Offre - Valeur initiale'] as number | undefined,
        offreFinale: f['Offre - Valeur finale'] as number | undefined,
        dateFinalisationPrevue: f['Date de finalisation prévue'] as string | undefined,
        nextTaskDate: (f['#next_task_date'] as string[] | undefined)?.[0],
        nextTask: (f['next task'] as string[] | undefined)?.[0],
        alerteHeures: f['Alerte Heures'] as string | undefined,
        progression: f['Progression'] as string | undefined,
        percentCogs: f['% COGS'] as string | undefined,
        ehr: f['EHR'] as string | undefined,
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

    return NextResponse.json(projets, {
      headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=10' },
    })
  } catch (error) {
    console.error('Error fetching projets:', error)
    return NextResponse.json({ error: 'Failed to fetch projets' }, { status: 500 })
  }
}
