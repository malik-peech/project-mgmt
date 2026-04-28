import { NextResponse } from 'next/server'
import { sanitize } from '@/lib/sanitize'
import {
  INTENTIONS_BASE_ID,
  INTENTIONS_TABLE_ID,
  INTENTIONS_MONTH_TABLE_ID,
  matchIntentionsSales,
  type Attachment,
  type Intention,
  type IntentionStatut,
} from '@/lib/intentions'

function atHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_API_KEY || ''}`,
    'Content-Type': 'application/json',
  }
}

async function fetchAll(tableId: string, params = '') {
  const records: { id: string; createdTime?: string; fields: Record<string, unknown> }[] = []
  let offset: string | undefined
  do {
    const qs = new URLSearchParams(params)
    if (offset) qs.set('offset', offset)
    const url = `https://api.airtable.com/v0/${INTENTIONS_BASE_ID}/${tableId}?${qs.toString()}`
    const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Intentions fetch ${tableId} failed: ${res.status} ${await res.text()}`)
    }
    const data = await res.json()
    records.push(...(data.records || []))
    offset = data.offset
  } while (offset)
  return records
}

function str(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') return undefined
  return String(val)
}

function num(val: unknown): number | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return val
  if (typeof val === 'object') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
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
 * GET /api/intentions[?sales=Name][&all=1]
 *
 * - With ?sales=Name: returns intentions where Sales = Name
 * - With ?all=1: returns all intentions (admin)
 * - With nothing: returns empty (force the caller to choose)
 *
 * Only Type = "Intention" records (Meeting records are excluded).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const salesQuery = searchParams.get('sales')
    const all = searchParams.get('all') === '1'

    if (!salesQuery && !all) {
      return NextResponse.json({ error: 'sales or all=1 required' }, { status: 400 })
    }

    const intentionRecords = await fetchAll(INTENTIONS_TABLE_ID)
    const monthRecords = await fetchAll(INTENTIONS_MONTH_TABLE_ID, 'fields[]=Name')
    const monthMap = new Map<string, string>()
    for (const m of monthRecords) {
      monthMap.set(m.id, str(m.fields['Name']) || '')
    }

    const matched = salesQuery ? matchIntentionsSales(salesQuery) : ''

    const intentions: Intention[] = []
    for (const r of intentionRecords) {
      const f = r.fields
      const type = sel(f['Type'])
      // Filter to Intention type only (skip Meetings)
      if (type && type !== 'Intention') continue

      const salesVal = sel(f['Sales'])
      if (!all) {
        // Filter by sales: try exact then first-name match against `salesQuery`.
        if (!salesVal) continue
        if (matched && salesVal === matched) {
          // ok
        } else if (salesVal === salesQuery) {
          // ok
        } else {
          continue
        }
      }

      const monthIds = (f['Month link'] as string[] | undefined) || []
      const monthNames = monthIds.map((id) => monthMap.get(id) || '').filter(Boolean)

      const pieces = Array.isArray(f['Pièces'])
        ? (f['Pièces'] as Attachment[]).map((a) => ({
            id: a.id,
            url: a.url,
            filename: a.filename,
            type: a.type,
            size: a.size,
          }))
        : undefined

      intentions.push({
        id: r.id,
        client: str(f['Client']),
        projet: str(f['Projet']),
        sales: salesVal,
        statut: sel(f['Statut']) as IntentionStatut | undefined,
        headcount: sel(f['Headcount']),
        origine: sel(f['Origine']),
        contexte: sel(f['Contexte']),
        type: type || 'Intention',
        monthIds,
        monthNames,
        brief: str(f['Brief']),
        pieces,
        budgetEstime: num(f['Budget estimé']),
        deadline: str(f['Deadline']),
        clientOkPourCallBrief: !!f['Client OK pour un call brief'],
        clientOkPourPresentation: !!f['Client OK pour une présentation'],
        budgetCommunique: !!f['Budget communiqué par le client'],
        onboardingOk: !!f['Onboarding OK'],
        date: str(f['Date']),
        createdTime: r.createdTime,
      })
    }

    // Sort: not-onboarded first, then by createdTime desc.
    intentions.sort((a, b) => {
      if (!!a.onboardingOk !== !!b.onboardingOk) return a.onboardingOk ? 1 : -1
      return (b.createdTime || '').localeCompare(a.createdTime || '')
    })

    const counts = {
      total: intentions.length,
      toOnboard: intentions.filter((i) => !i.onboardingOk).length,
      enProduction: intentions.filter(
        (i) => i.onboardingOk && i.statut === 'En production',
      ).length,
      attenteDecision: intentions.filter(
        (i) => i.onboardingOk && i.statut === 'Attente décision',
      ).length,
    }

    return NextResponse.json(
      sanitize({ intentions, counts, matchedSales: matched || salesQuery || '' }),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Error fetching intentions:', error)
    const msg = error instanceof Error ? error.message : 'Failed to fetch'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/intentions
 * Create a new intention. Defaults: Type = "Intention".
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const fields: Record<string, unknown> = { Type: 'Intention' }

    if (body.client?.trim()) fields['Client'] = body.client.trim()
    if (body.projet?.trim()) fields['Projet'] = body.projet.trim()
    if (body.sales) fields['Sales'] = body.sales
    if (body.statut) fields['Statut'] = body.statut
    if (body.headcount) fields['Headcount'] = body.headcount
    if (body.origine) fields['Origine'] = body.origine
    if (body.contexte) fields['Contexte'] = body.contexte
    if (Array.isArray(body.monthIds) && body.monthIds.length > 0) {
      fields['Month link'] = body.monthIds
    }
    if (body.brief?.trim()) fields['Brief'] = body.brief.trim()
    if (body.budgetEstime != null && body.budgetEstime !== '') {
      fields['Budget estimé'] = Number(body.budgetEstime)
    }
    if (body.deadline) fields['Deadline'] = body.deadline
    if (body.clientOkPourCallBrief !== undefined) {
      fields['Client OK pour un call brief'] = !!body.clientOkPourCallBrief
    }
    if (body.clientOkPourPresentation !== undefined) {
      fields['Client OK pour une présentation'] = !!body.clientOkPourPresentation
    }
    if (body.budgetCommunique !== undefined) {
      fields['Budget communiqué par le client'] = !!body.budgetCommunique
    }
    if (body.onboardingOk !== undefined) {
      fields['Onboarding OK'] = !!body.onboardingOk
    }

    const res = await fetch(
      `https://api.airtable.com/v0/${INTENTIONS_BASE_ID}/${INTENTIONS_TABLE_ID}`,
      {
        method: 'POST',
        headers: atHeaders(),
        body: JSON.stringify({ fields }),
      },
    )
    if (!res.ok) {
      const err = await res.text()
      console.error('Intentions create failed:', res.status, err)
      return NextResponse.json({ error: err }, { status: res.status })
    }
    const created = await res.json()
    return NextResponse.json({ id: created.id }, { status: 201 })
  } catch (error) {
    console.error('Error creating intention:', error)
    const msg = error instanceof Error ? error.message : 'Failed to create'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
