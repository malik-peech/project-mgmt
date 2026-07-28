import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { ensureStore, buildLookupMap } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import { resolveTeamMember, listTimeLogs, createTimeLog, type TimeLogEntry } from '@/lib/timelog'

/** Attach projet ref / name / client to a raw time-log entry (from the store). */
async function enrich(entries: TimeLogEntry[]) {
  const store = await ensureStore()
  const nameMap = buildLookupMap(store.projets, 'Projet')
  const refMap = buildLookupMap(store.projets, 'Project réf')
  const clientMap = buildLookupMap(store.clients, 'Client')
  return entries.map((e) => {
    const p = e.projetId ? store.projets.byId.get(e.projetId) : undefined
    const clientId = (p?.fields['Client link'] as string[] | undefined)?.[0]
    return {
      ...e,
      projetRef: e.projetId ? refMap.get(e.projetId) || '' : '',
      projetName: e.projetId ? nameMap.get(e.projetId) || '' : '',
      clientName: clientId ? clientMap.get(clientId) || '' : '',
    }
  })
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const user = searchParams.get('user') || ''
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    if (!user || !from || !to) {
      return NextResponse.json({ error: 'user, from, to requis' }, { status: 400 })
    }

    const member = await resolveTeamMember(user)
    if (!member) {
      return NextResponse.json(sanitize({ linked: false, entries: [] }))
    }

    const entries = await listTimeLogs(member, from, to)
    const enriched = await enrich(entries)
    return NextResponse.json(sanitize({ linked: true, entries: enriched }), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[api/timelog GET] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { user, date, durationSeconds, projetId, description } = body
    if (!user || !date || !durationSeconds) {
      return NextResponse.json({ error: 'user, date, durationSeconds requis' }, { status: 400 })
    }
    const member = await resolveTeamMember(String(user))
    if (!member) {
      return NextResponse.json({ error: 'Compte non relié à la table Time log' }, { status: 422 })
    }
    const created = await createTimeLog(member, {
      date: String(date),
      durationSeconds: Number(durationSeconds),
      projetId: projetId || null,
      description: description || null,
    })
    const [enriched] = await enrich([created])
    return NextResponse.json(sanitize(enriched))
  } catch (error) {
    console.error('[api/timelog POST] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
