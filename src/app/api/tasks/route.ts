import { NextResponse } from 'next/server'
import { getAll, createRecord, TABLES } from '@/lib/airtable'
import type { Task } from '@/types'

function mapTask(r: any): Task {
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
    const { searchParams } = new URL(request.url)
    const pmFilter = searchParams.get('pm')
    const doneFilter = searchParams.get('done')
    const projetId = searchParams.get('projetId')

    let formula = doneFilter === 'true' ? '{Done}' : 'NOT({Done})'

    if (pmFilter) {
      formula = `AND(${formula}, FIND('${pmFilter}', ARRAYJOIN({PM})))`
    }
    if (projetId) {
      formula = `AND(${formula}, FIND('${projetId}', ARRAYJOIN(RECORD_ID({Projets}))))`
    }

    const records = await getAll(TABLES.TASKS, {
      filterByFormula: formula,
      sort: [{ field: 'Due date', direction: 'asc' }],
    })

    const tasks = records.map(mapTask)

    // Sort nulls last (Airtable puts them first with asc)
    tasks.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate.localeCompare(b.dueDate)
    })

    return NextResponse.json(tasks, {
      headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=20' },
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

    const fields: Record<string, any> = {
      'Name': body.name,
    }
    if (body.projetId) fields['Projets'] = [body.projetId]
    if (body.dueDate) fields['Due date'] = body.dueDate
    if (body.priority) fields['Priority'] = body.priority
    if (body.type) fields['Type'] = body.type
    if (body.description) fields['Description'] = body.description

    const record = await createRecord(TABLES.TASKS, fields)
    return NextResponse.json(mapTask(record), { status: 201 })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
