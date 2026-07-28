import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { ensureStore, buildLookupMap } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import { updateTimeLog, deleteTimeLog, type TimeLogEntry } from '@/lib/timelog'

async function enrichOne(e: TimeLogEntry) {
  const store = await ensureStore()
  const nameMap = buildLookupMap(store.projets, 'Projet')
  const refMap = buildLookupMap(store.projets, 'Project réf')
  const clientMap = buildLookupMap(store.clients, 'Client')
  const p = e.projetId ? store.projets.byId.get(e.projetId) : undefined
  const clientId = (p?.fields['Client link'] as string[] | undefined)?.[0]
  return {
    ...e,
    projetRef: e.projetId ? refMap.get(e.projetId) || '' : '',
    projetName: e.projetId ? nameMap.get(e.projetId) || '' : '',
    clientName: clientId ? clientMap.get(clientId) || '' : '',
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const updated = await updateTimeLog(id, {
      date: body.date,
      durationSeconds: body.durationSeconds,
      projetId: body.projetId,
      description: body.description,
    })
    return NextResponse.json(sanitize(await enrichOne(updated)))
  } catch (error) {
    console.error('[api/timelog PATCH] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    await deleteTimeLog(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/timelog DELETE] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
