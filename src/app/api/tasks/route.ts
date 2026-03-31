import { NextResponse } from 'next/server'
import { createRecord, TABLES } from '@/lib/airtable'
import { ensureStore, refreshTable } from '@/lib/store'
import type { Task } from '@/types'

function mapRecord(r: { id: string; fields: Record<string, unknown> }): Task {
  const f = r.fields
  const assignee = f['Assignee'] as { id?: string; email?: string; name?: string } | undefined
  return {
    id: r.id,
    name: (f['Name'] as string) || '',
    done: !!f['Done'],
    clientName: (f['Client'] as string[])?.[0],
    priority: f['Priority'] as Task['priority'],
    projetId: (f['Projets'] as string[])?.[0],
    projetName: (f['Projet'] as string[])?.[0],
    assigneeId: assignee?.id,
    assigneeName: assignee?.name,
    dueDate: f['Due date'] as string | undefined,
    pm: (f['PM'] as string[])?.[0],
    type: f['Type'] as Task['type'],
    description: f['Description'] as string | undefined,
    phase: (f['Phase'] as string[])?.[0],
    createdAt: f['Create date & time'] as string | undefined,
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

    const tasks: Task[] = []

    for (const r of store.tasks.records) {
      const f = r.fields
      const isDone = !!f['Done']

      // Filter done/not done
      if (wantDone !== isDone) continue

      // Filter by PM
      if (pmFilter) {
        const pms = f['PM'] as string[] | undefined
        if (!pms || !pms.some((p) => p === pmFilter)) continue
      }

      // Filter by project
      if (projetId) {
        const projets = f['Projets'] as string[] | undefined
        if (!projets || !projets.includes(projetId)) continue
      }

      tasks.push(mapRecord(r))
    }

    // Sort by due date (nulls last)
    tasks.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate.localeCompare(b.dueDate)
    })

    return NextResponse.json(tasks, {
      headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=10' },
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

    const record = await createRecord(TABLES.TASKS, fields as any)

    // Refresh store in background
    refreshTable(TABLES.TASKS).catch(() => {})

    return NextResponse.json(mapRecord({ id: record.id, fields: record.fields as Record<string, unknown> }), { status: 201 })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
