import { NextResponse } from 'next/server'
import { sanitize } from '@/lib/sanitize'

/**
 * Belle base lives in a separate Airtable base (appEVRkaM6cM2EeDs).
 * - table "Base" (tblm0ysiZEAPk37vt): the livrables catalog.
 *     Fields used here: "Titre", "Projets" (link → Belle's Projets table),
 *     "Vimeo link".
 * - table "Projets" (tblgUxrDmnxa8TxB5): sync'd from PM base; primary field
 *     "Project réf" is the multiline text used to match.
 *
 * Auth uses the same AIRTABLE_API_KEY (it has access to both bases).
 */

const BELLE_BASE_ID = 'appEVRkaM6cM2EeDs'
const BELLE_BASE_TABLE = 'tblm0ysiZEAPk37vt'   // "Base" (livrables)
const BELLE_PROJETS_TABLE = 'tblgUxrDmnxa8TxB5' // sync'd Projets

function atHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_API_KEY || ''}`,
    'Content-Type': 'application/json',
  }
}

/** Fetch all records from a Belle base table with pagination. */
async function fetchAll(tableId: string, params = '') {
  const records: { id: string; fields: Record<string, unknown> }[] = []
  let offset: string | undefined
  do {
    const qs = new URLSearchParams(params)
    if (offset) qs.set('offset', offset)
    const url = `https://api.airtable.com/v0/${BELLE_BASE_ID}/${tableId}?${qs.toString()}`
    const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Belle base fetch ${tableId} failed: ${res.status} ${await res.text()}`)
    }
    const data = await res.json()
    records.push(...(data.records || []))
    offset = data.offset
  } while (offset)
  return records
}

/**
 * Find the Belle-base "Projets" sync'd record ID for a given PM Project réf.
 * Returns null if no match (the sync may not have caught up yet).
 */
async function findBelleProjetId(projetRef: string): Promise<string | null> {
  const safeRef = projetRef.replace(/'/g, "\\'")
  const formula = `{Project réf}='${safeRef}'`
  const url = `https://api.airtable.com/v0/${BELLE_BASE_ID}/${BELLE_PROJETS_TABLE}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`
  const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  return data.records?.[0]?.id || null
}

/**
 * GET /api/belle-base?projetRef=XXX
 * Returns all Belle-base entries linked to this projet.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projetRef = searchParams.get('projetRef')
    if (!projetRef) {
      return NextResponse.json({ error: 'projetRef required' }, { status: 400 })
    }

    const belleProjetId = await findBelleProjetId(projetRef)
    if (!belleProjetId) {
      // Projet not synced yet in Belle base → no entries possible.
      return NextResponse.json({ entries: [], belleProjetId: null })
    }

    // Filter entries that link to this Belle projet
    const formula = `FIND('${belleProjetId}', ARRAYJOIN({Projets}))`
    const params = `filterByFormula=${encodeURIComponent(formula)}&fields[]=Titre&fields[]=Vimeo%20link&fields[]=Projets`
    const records = await fetchAll(BELLE_BASE_TABLE, params)

    const entries = records.map((r) => ({
      id: r.id,
      titre: (r.fields['Titre'] as string) || '',
      vimeoLink: (r.fields['Vimeo link'] as string) || '',
      projetIds: (r.fields['Projets'] as string[]) || [],
    }))

    return NextResponse.json(sanitize({ entries, belleProjetId }), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Error fetching belle base:', error)
    const msg = error instanceof Error ? error.message : 'Failed to fetch'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/belle-base
 * Body: { projetRef: string, titre: string, vimeoLink?: string }
 * Creates a new livrable in Belle base linked to the Belle projet matching projetRef.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { projetRef, titre, vimeoLink } = body as {
      projetRef?: string
      titre?: string
      vimeoLink?: string
    }
    if (!projetRef || !titre?.trim()) {
      return NextResponse.json({ error: 'projetRef and titre required' }, { status: 400 })
    }

    const belleProjetId = await findBelleProjetId(projetRef)
    if (!belleProjetId) {
      return NextResponse.json(
        { error: `Projet ${projetRef} not synced yet in Belle base` },
        { status: 404 }
      )
    }

    const fields: Record<string, unknown> = {
      Titre: titre.trim(),
      Projets: [belleProjetId],
    }
    if (vimeoLink?.trim()) fields['Vimeo link'] = vimeoLink.trim()

    const res = await fetch(
      `https://api.airtable.com/v0/${BELLE_BASE_ID}/${BELLE_BASE_TABLE}`,
      {
        method: 'POST',
        headers: atHeaders(),
        body: JSON.stringify({ fields }),
      }
    )
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }
    const created = await res.json()
    return NextResponse.json({
      id: created.id,
      titre: created.fields?.Titre || '',
      vimeoLink: created.fields?.['Vimeo link'] || '',
      projetIds: created.fields?.Projets || [],
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating belle base entry:', error)
    const msg = error instanceof Error ? error.message : 'Failed to create'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * DELETE /api/belle-base?id=recXXX
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const res = await fetch(
      `https://api.airtable.com/v0/${BELLE_BASE_ID}/${BELLE_BASE_TABLE}/${id}`,
      { method: 'DELETE', headers: atHeaders() }
    )
    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: res.status })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting belle base entry:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
