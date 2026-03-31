import { NextResponse } from 'next/server'
import { getAll, TABLES } from '@/lib/airtable'
import { getOrFetch } from '@/lib/cache'
import type { Projet } from '@/types'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const pmFilter = searchParams.get('pm')
    const statutFilter = searchParams.get('statut')

    // Fetch clients for name resolution (cached 2 min)
    const clientMap = await getOrFetch<Map<string, string>>(
      'clients-map',
      async () => {
        const clientRecords = await getAll(TABLES.CLIENTS)
        const map = new Map<string, string>()
        for (const r of clientRecords) {
          map.set(r.id, r.fields['Client'] as string || '')
        }
        return map
      },
      120_000
    )

    // Build filter formula
    const activeStatuts = statutFilter
      ? [statutFilter]
      : ['En cours', 'Finalisation', 'Stand-by', 'Tentative', 'Intention']

    const statutFormula = activeStatuts.length === 1
      ? `{Statut} = '${activeStatuts[0]}'`
      : `OR(${activeStatuts.map(s => `{Statut} = '${s}'`).join(',')})`

    let formula = statutFormula
    if (pmFilter) {
      formula = `AND(${statutFormula}, {PM (manual)} = '${pmFilter}')`
    }

    const records = await getAll(TABLES.PROJETS, {
      filterByFormula: formula,
      sort: [
        { field: 'Statut', direction: 'asc' },
        { field: 'Projet', direction: 'asc' },
      ],
    })

    const projets: Projet[] = records.map((r) => {
      const f = r.fields
      const clientIds = f['Client link'] as string[] | undefined
      const clientId = clientIds?.[0]
      return {
        id: r.id,
        ref: f['Project réf'] as string | undefined,
        nom: (f['Projet'] as string) || '',
        clientId,
        clientName: clientId ? clientMap.get(clientId) || '' : '',
        am: f['Account Manager (AM)'] as string | undefined,
        pm: f['PM (manual)'] as string | undefined,
        da: f['DA'] as string | undefined,
        pc: f['Project Coordinator (PC)'] as string | undefined,
        filmmaker: f['Filmmaker'] as string | undefined,
        phase: f['Phase'] as Projet['phase'],
        statut: f['Statut'] as Projet['statut'],
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
      }
    })

    return NextResponse.json(projets, {
      headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=30' },
    })
  } catch (error) {
    console.error('Error fetching projets:', error)
    return NextResponse.json({ error: 'Failed to fetch projets' }, { status: 500 })
  }
}
