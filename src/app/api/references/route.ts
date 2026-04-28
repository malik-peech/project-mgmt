import { NextResponse } from 'next/server'
import {
  ensureReferencesStore,
  filterReferences,
  type ReferenceFilters,
} from '@/lib/references-store'
import { sanitize } from '@/lib/sanitize'
import type { Reference } from '@/types'

const PAGE_SIZE = 60
const FACET_LIMIT = 40

type Facet = { value: string; count: number }
type Facets = {
  industries: Facet[]
  styles: Facet[]
  formats: Facet[]
  useCases: Facet[]
  types: Facet[]
  bus: Facet[]
  moods: Facet[]
  durees: Facet[]
  years: Facet[]
}

function topFacet<K>(m: Map<K, number>, n = FACET_LIMIT): { value: string; count: number }[] {
  return Array.from(m.entries())
    .map(([value, count]) => ({ value: String(value), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

function computeFacets(refs: Reference[]): Facets {
  const industries = new Map<string, number>()
  const styles = new Map<string, number>()
  const formats = new Map<string, number>()
  const useCases = new Map<string, number>()
  const types = new Map<string, number>()
  const bus = new Map<string, number>()
  const moods = new Map<string, number>()
  const durees = new Map<string, number>()
  const years = new Map<number, number>()

  const inc = <K>(m: Map<K, number>, k: K | undefined | null) => {
    if (k == null || k === '') return
    m.set(k, (m.get(k) || 0) + 1)
  }

  for (const r of refs) {
    inc(industries, r.industry)
    for (const i of r.industries || []) inc(industries, i)
    inc(styles, r.style)
    inc(styles, r.mainStyle)
    inc(formats, r.format)
    inc(useCases, r.useCase)
    for (const u of r.useCases || []) inc(useCases, u)
    for (const t of r.typeProjet || []) inc(types, t)
    for (const b of r.bu || []) inc(bus, b)
    for (const m of r.moodTone || []) inc(moods, m)
    inc(durees, r.duree)
    if (r.year) inc(years, r.year)
  }

  return {
    industries: topFacet(industries),
    styles: topFacet(styles),
    formats: topFacet(formats),
    useCases: topFacet(useCases),
    types: topFacet(types),
    bus: topFacet(bus),
    moods: topFacet(moods),
    durees: topFacet(durees),
    years: topFacet(years).sort((a, b) => Number(b.value) - Number(a.value)),
  }
}

/**
 * GET /api/references
 * Query params: q, industry, style, format, useCase, client, typeProjet, bu,
 *               minRating, diffusableOnly=1, yearFrom, yearTo, hasVimeo=1,
 *               offset (default 0), limit (default 60).
 *
 * Always returns the full facet set (computed from the unfiltered store) so the
 * left-rail filters stay stable as the user narrows down.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const filters: ReferenceFilters = {
      q: searchParams.get('q') || undefined,
      industry: searchParams.get('industry') || undefined,
      style: searchParams.get('style') || undefined,
      format: searchParams.get('format') || undefined,
      useCase: searchParams.get('useCase') || undefined,
      client: searchParams.get('client') || undefined,
      typeProjet: searchParams.get('typeProjet') || undefined,
      bu: searchParams.get('bu') || undefined,
      minRating: searchParams.has('minRating')
        ? Number(searchParams.get('minRating'))
        : undefined,
      diffusableOnly: searchParams.get('diffusableOnly') === '1',
      yearFrom: searchParams.has('yearFrom')
        ? Number(searchParams.get('yearFrom'))
        : undefined,
      yearTo: searchParams.has('yearTo')
        ? Number(searchParams.get('yearTo'))
        : undefined,
      hasVimeo: searchParams.get('hasVimeo') === '1',
      limit: 100_000,
    }

    const offset = Math.max(0, Number(searchParams.get('offset') || '0'))
    const pageSize = Math.min(
      200,
      Math.max(1, Number(searchParams.get('limit') || PAGE_SIZE)),
    )

    const { references } = await ensureReferencesStore()
    const facets = computeFacets(references)
    const filtered = filterReferences(references, filters)
    const page = filtered.slice(offset, offset + pageSize)

    return NextResponse.json(
      sanitize({
        references: page,
        total: filtered.length,
        offset,
        limit: pageSize,
        facets,
      }),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Error fetching references:', error)
    const msg = error instanceof Error ? error.message : 'Failed to fetch'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
