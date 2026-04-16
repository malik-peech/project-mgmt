import { NextResponse } from 'next/server'
import { updateRecord, deleteRecord, TABLES } from '@/lib/airtable'
import { upsertRecord, removeRecord } from '@/lib/store'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const fields: Record<string, unknown> = {}
    if (body.done !== undefined) fields['Done'] = body.done
    if (body.name !== undefined) fields['Name'] = body.name
    if (body.priority !== undefined) fields['Priority'] = body.priority
    if (body.type !== undefined) fields['Type'] = body.type
    if (body.dueDate !== undefined) fields['Due date'] = body.dueDate
    if (body.description !== undefined) fields['Description'] = body.description
    if (body.projetId !== undefined) fields['Projets'] = [body.projetId]
    if (body.assigneManuel !== undefined) fields['Assigné'] = body.assigneManuel

    const record = await updateRecord(TABLES.TASKS, id, fields as any)

    // Patch store directly with Airtable's response — no full re-fetch.
    upsertRecord(TABLES.TASKS, { id: record.id, fields: record.fields as Record<string, unknown> })

    return NextResponse.json({ id: record.id, ...body })
  } catch (error) {
    console.error('Error updating task:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await deleteRecord(TABLES.TASKS, id)

    // Remove from store immediately — no re-fetch needed.
    removeRecord(TABLES.TASKS, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
