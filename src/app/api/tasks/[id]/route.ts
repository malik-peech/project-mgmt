import { NextResponse } from 'next/server'
import { updateRecord, TABLES } from '@/lib/airtable'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const fields: Record<string, any> = {}
    if (body.done !== undefined) fields['Done'] = body.done
    if (body.name !== undefined) fields['Name'] = body.name
    if (body.priority !== undefined) fields['Priority'] = body.priority
    if (body.type !== undefined) fields['Type'] = body.type
    if (body.dueDate !== undefined) fields['Due date'] = body.dueDate
    if (body.description !== undefined) fields['Description'] = body.description
    if (body.projetId !== undefined) fields['Projets'] = [body.projetId]

    const record = await updateRecord(TABLES.TASKS, id, fields)
    return NextResponse.json({ id: record.id, ...body })
  } catch (error) {
    console.error('Error updating task:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}
