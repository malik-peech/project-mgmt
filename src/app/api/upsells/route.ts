import { NextResponse } from 'next/server'
import { ensureStore, buildLookupMap } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import type { Upsell, Attachment } from '@/types'

/** Only upsells created strictly after this date are in scope (matches the Airtable view filter). */
const UPSELL_SINCE = '2026-01-01'

function num(val: unknown): number | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return val
  if (typeof val === 'object') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

function str(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') return undefined
  return String(val)
}

/** Extract singleSelect value (string or {id,name}) */
function sel(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val && 'name' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).name)
  }
  return str(val)
}

/** First value of a lookup/array field, coerced to string */
function firstStr(val: unknown): string | undefined {
  if (Array.isArray(val)) {
    const first = val[0]
    if (first == null) return undefined
    if (typeof first === 'object' && 'name' in (first as Record<string, unknown>)) {
      return String((first as Record<string, unknown>).name)
    }
    return String(first)
  }
  return str(val)
}

function attachments(val: unknown): Attachment[] | undefined {
  if (!Array.isArray(val)) return undefined
  return (val as { id?: string; url: string; filename: string; type?: string; size?: number }[]).map((a) => ({
    id: a.id,
    url: a.url,
    filename: a.filename,
    type: a.type,
    size: a.size,
  }))
}

/**
 * GET /api/upsells?sales=Name
 *
 * Returns upsells (table "Upsell & Contracts") for the given Sales, created
 * after 2025-12-31, so the logged-in sales can fill "Num BDC Upsell" and
 * attach the "Devis / BDC Upsell".
 *
 * - toComplete: matches the Airtable view (Pas de BDC upsell = false AND Num BDC Upsell empty)
 * - completed:  Num BDC Upsell filled OR Pas de BDC upsell checked (archive)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const salesName = searchParams.get('sales')
    if (!salesName) {
      return NextResponse.json({ error: 'sales param required' }, { status: 400 })
    }

    const store = await ensureStore()
    // Resolve linked Projet record → Project réf / Projet name from the projets store.
    const projetRefMap = buildLookupMap(store.projets, 'Project réf')
    const projetNomMap = buildLookupMap(store.projets, 'Projet')

    const upsells: Upsell[] = []

    for (const r of store.upsells.records) {
      const f = r.fields
      if (sel(f['Sales']) !== salesName) continue

      const createdAt = str(f['create'])
      if (!createdAt || createdAt.slice(0, 10) < UPSELL_SINCE) continue

      const projetIds = (f['Projet'] as string[] | undefined) || []
      const projetId = projetIds[0]
      const projetRef = projetId ? projetRefMap.get(projetId) || undefined : undefined
      const projetNom = projetId ? projetNomMap.get(projetId) || undefined : undefined

      const numBdc = str(f['Num BDC Upsell'])
      const pasDeBdc = !!f['Pas de BDC upsell']
      const isDone = !!(numBdc && numBdc.trim()) || pasDeBdc

      upsells.push({
        id: r.id,
        projetRef,
        projetNom,
        clientName: firstStr(f['Client (from Projet)']),
        montantHT: num(f['Montant HT']),
        currency: firstStr(f['CCY']),
        description: str(f["Description de l'upsell"]),
        statut: sel(f['Statut']),
        agence: sel(f['Agence']),
        sales: sel(f['Sales']),
        createdAt,
        numBdc,
        pasDeBdc,
        devisBdc: attachments(f['Devis / BDC Upsell']),
        isDone,
      })
    }

    // Not-done first, then by most recent creation.
    upsells.sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1
      return (b.createdAt || '').localeCompare(a.createdAt || '')
    })

    const counts = {
      total: upsells.length,
      toComplete: upsells.filter((u) => !u.isDone).length,
      completed: upsells.filter((u) => u.isDone).length,
    }

    return NextResponse.json(
      sanitize({ upsells, counts, salesName }),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching upsells:', error)
    return NextResponse.json({ error: 'Failed to fetch upsells' }, { status: 500 })
  }
}
