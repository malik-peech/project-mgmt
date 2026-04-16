import { NextResponse } from 'next/server'
import { ensureStore, buildLookupMap } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'

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

/**
 * GET /api/pm-dashboard?pm=Name
 *
 * Returns a PM's "welcome" dashboard: four lists of active projets (En cours /
 * Finalisation) that need attention, owned by the PM via PM (manual) or
 * PM2 (manual):
 *   - unplannedBriefs : Brief effectué = false AND no Date de brief
 *   - overdueTasks    : projets with at least one open task (Done=false) due before today
 *   - noTasks         : no #next_task_date AND Statut = En cours
 *   - pastDeadline    : Date de finalisation prévue < today AND statut != Done
 *
 * Each entry includes the info needed to update it directly from the modal.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const pmName = searchParams.get('pm')
    if (!pmName) return NextResponse.json({ error: 'pm param required' }, { status: 400 })

    const store = await ensureStore()
    const clientMap = buildLookupMap(store.clients, 'Client')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    // Build a quick projetId → open-overdue-task count map from the tasks table.
    const overdueByProjet = new Map<string, number>()
    const tasksTable = store.tasks
    for (const t of tasksTable.records) {
      const tf = t.fields
      const done = !!tf['Done']
      if (done) continue
      const due = str(tf['Due date'])
      if (!due) continue
      if (due >= todayStr) continue
      const projetIds = tf['Projets'] as string[] | undefined
      if (!projetIds || projetIds.length === 0) continue
      for (const pid of projetIds) {
        overdueByProjet.set(pid, (overdueByProjet.get(pid) || 0) + 1)
      }
    }

    type Entry = {
      id: string
      ref?: string
      nom: string
      clientName?: string
      statut?: string
      agence?: string
      phase?: string
      briefEffectue?: boolean
      dateBrief?: string
      dateFinalisationPrevue?: string
      overdueTaskCount?: number
      nextTaskDate?: string
    }

    const unplannedBriefs: Entry[] = []
    const overdueTasks: Entry[] = []
    const noTasks: Entry[] = []
    const pastDeadline: Entry[] = []

    const ACTIVE = ['En cours', 'Finalisation']

    for (const r of store.projets.records) {
      const f = r.fields
      const statut = str(f['Statut'])
      if (!statut || !ACTIVE.includes(statut)) continue

      const pm = sel(f['PM (manual)'])
      const pm2 = sel(f['PM2 (manual)'])
      if (pm !== pmName && pm2 !== pmName) continue

      const clientIds = f['Client link'] as string[] | undefined
      const clientId = clientIds?.[0]

      const base: Entry = {
        id: r.id,
        ref: str(f['Project réf']),
        nom: str(f['Projet']) || '',
        clientName: clientId ? clientMap.get(clientId) || '' : '',
        statut,
        agence: sel(f['Agence']),
        phase: str(f['Phase']),
        briefEffectue: !!f['Brief effectué'],
        dateBrief: str(f['Date de brief (si non)']),
        dateFinalisationPrevue: str(f['Date de finalisation prévue']),
        nextTaskDate: str((f['#next_task_date'] as unknown[])?.[0]),
      }

      // Unplanned briefs: brief not done AND no planned date
      if (!base.briefEffectue && !base.dateBrief) {
        unplannedBriefs.push(base)
      }

      // Overdue tasks: at least one open task overdue
      const overdueCount = overdueByProjet.get(r.id) || 0
      if (overdueCount > 0) {
        overdueTasks.push({ ...base, overdueTaskCount: overdueCount })
      }

      // No tasks: no next task date (rollup is empty)
      if (statut === 'En cours' && !base.nextTaskDate) {
        noTasks.push(base)
      }

      // Past deadline: dateFinalisationPrevue < today AND statut != Done (already filtered)
      if (base.dateFinalisationPrevue && base.dateFinalisationPrevue < todayStr) {
        pastDeadline.push(base)
      }
    }

    const byName = (a: Entry, b: Entry) => (a.nom || '').localeCompare(b.nom || '')
    unplannedBriefs.sort(byName)
    overdueTasks.sort((a, b) => (b.overdueTaskCount || 0) - (a.overdueTaskCount || 0) || byName(a, b))
    noTasks.sort(byName)
    pastDeadline.sort((a, b) => (a.dateFinalisationPrevue || '').localeCompare(b.dateFinalisationPrevue || '') || byName(a, b))

    return NextResponse.json(
      sanitize({
        unplannedBriefs,
        overdueTasks,
        noTasks,
        pastDeadline,
        counts: {
          unplannedBriefs: unplannedBriefs.length,
          overdueTasks: overdueTasks.length,
          noTasks: noTasks.length,
          pastDeadline: pastDeadline.length,
        },
      }),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching PM dashboard:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
