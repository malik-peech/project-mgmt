import { NextResponse } from 'next/server'
import { createRecord, TABLES } from '@/lib/airtable'
import { ensureStore, upsertRecord, buildLookupMap } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import type { Task } from '@/types'

/** Safely extract a string from an Airtable field (handles {specialValue} objects) */
function str(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') return undefined
  return String(val)
}

function mapRecord(
  r: { id: string; fields: Record<string, unknown> },
  refMap?: Map<string, string>,
  clientMap?: Map<string, string>,
  projetsById?: Map<string, { id: string; fields: Record<string, unknown> }>
): Task {
  const f = r.fields
  const assignee = f['Assignee'] as { id?: string; email?: string; name?: string } | undefined
  const projetId = (f['Projets'] as string[])?.[0]

  // Resolve client name via the linked project's Client link field
  const projetRecord = projetId && projetsById ? projetsById.get(projetId) : undefined
  const clientIds = projetRecord?.fields['Client link'] as string[] | undefined
  const clientId = clientIds?.[0]
  const clientName = clientId && clientMap ? clientMap.get(clientId) : undefined

  return {
    id: r.id,
    name: str(f['Name']) || '',
    done: !!f['Done'],
    clientName,
    priority: str(f['Priority']) as Task['priority'],
    projetId,
    projetName: str((f['Projet'] as unknown[])?.[0]),
    projetRef: projetId && refMap ? refMap.get(projetId) : undefined,
    assigneeId: assignee?.id,
    assigneeName: str(assignee?.name),
    assigneManuel: str(f['Assigné']),
    dueDate: str(f['Due date']),
    pm: str((f['PM'] as unknown[])?.[0]),
    type: str(f['Type']) as Task['type'],
    description: str(f['Description']),
    phase: str((f['Phase'] as unknown[])?.[0]),
    createdAt: str(f['Create date & time']),
  }
}

export async function GET(request: Request) {
  try {
    const store = await ensureStore()
    const { searchParams } = new URL(request.url)
    const pmFilter = searchParams.get('pm')
    const doneFilter = searchParams.get('done')
    const projetId = searchParams.get('projetId')

    const wantDone = doneFilter === 'true'

    // Build lookup maps
    const refMap = buildLookupMap(store.projets, 'Project réf')
    const clientMap = buildLookupMap(store.clients, 'Client')

    const tasks: Task[] = []

    for (const r of store.tasks.records) {
      const f = r.fields
      const isDone = !!f['Done']

      // Filter done/not done
      if (wantDone !== isDone) continue

      // Filter by PM (project PM or PM2) OR DA (official) on linked project OR assigné manuel
      if (pmFilter) {
        const pms = f['PM'] as string[] | undefined
        const assigneManuel = str(f['Assigné'])
        const projetIds = f['Projets'] as string[] | undefined
        const matchesPm = pms?.some((p) => p === pmFilter)
        const matchesAssignee = assigneManuel === pmFilter
        const matchesProjectRole = projetIds?.some((pid) => {
          const proj = store.projets.byId.get(pid)
          if (!proj) return false
          const pf = proj.fields
          // Check DA (official), PM (manual), PM2 (manual) — all may be singleSelect {id,name}
          const fieldMatches = (key: string) => {
            const raw = pf[key]
            if (typeof raw === 'string') return raw === pmFilter
            if (typeof raw === 'object' && raw && 'name' in (raw as Record<string, unknown>)) {
              return String((raw as Record<string, unknown>).name) === pmFilter
            }
            return false
          }
          return fieldMatches('DA (official)') || fieldMatches('PM (manual)') || fieldMatches('PM2 (manual)')
        })
        if (!matchesPm && !matchesAssignee && !matchesProjectRole) continue
      }

      // Filter by project
      if (projetId) {
        const projets = f['Projets'] as string[] | undefined
        if (!projets || !projets.includes(projetId)) continue
      }

      tasks.push(mapRecord(r, refMap, clientMap, store.projets.byId))
    }

    // Sort by due date (nulls last)
    tasks.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate.localeCompare(b.dueDate)
    })

    return NextResponse.json(sanitize(tasks), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Error fetching tasks:', error)
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body.name) {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
    }

    const fields: Record<string, unknown> = {
      'Name': body.name,
    }
    if (body.projetId) fields['Projets'] = [body.projetId]
    if (body.dueDate) fields['Due date'] = body.dueDate
    if (body.priority) fields['Priority'] = body.priority
    if (body.type) fields['Type'] = body.type
    if (body.description) fields['Description'] = body.description
    if (body.assigneManuel) fields['Assigné'] = body.assigneManuel

    const record = await createRecord(TABLES.TASKS, fields as any)

    // Patch store directly with Airtable's response — no full re-fetch.
    upsertRecord(TABLES.TASKS, { id: record.id, fields: record.fields as Record<string, unknown> })

    return NextResponse.json(sanitize(mapRecord({ id: record.id, fields: record.fields as Record<string, unknown> }, undefined, undefined, undefined)), { status: 201 })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
