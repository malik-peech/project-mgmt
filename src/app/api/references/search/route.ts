import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { ensureReferencesStore, filterReferences, type ReferenceFilters } from '@/lib/references-store'
import { sanitize } from '@/lib/sanitize'

/**
 * GET /api/references/search
 *
 * Query params (all optional):
 *   q                   free text (titre, client, mood, industries, use cases)
 *   industry            case-insensitive contains on Industry + Main Industries
 *   style               matches Style + Main style
 *   format
 *   useCase
 *   client
 *   typeProjet          "3D" | "Live" | "Motion" | ...
 *   bu
 *   minRating           number (1..5)
 *   minCreativeQuality  number (1..5)
 *   diffusableOnly      "1" | "true" → keep only diffusable = OK
 *   yearFrom, yearTo    number
 *   hasVimeo            "1" | "true" → keep only refs with a Vimeo link
 *   limit               number (default 50, max 200)
 *
 * Response: { count: number, total: number, references: Reference[] }
 */
export async function GET(request: Request) {
  try {
    // Any logged-in user can search (Sales + Admin + PM + DA). Middleware gates auth.
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    const asNum = (key: string): number | undefined => {
      const v = searchParams.get(key)
      if (v == null || v === '') return undefined
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    const asBool = (key: string): boolean | undefined => {
      const v = searchParams.get(key)
      if (v == null) return undefined
      return v === '1' || v.toLowerCase() === 'true'
    }
    const asStr = (key: string): string | undefined => {
      const v = searchParams.get(key)
      return v ? v.trim() : undefined
    }

    const rawLimit = asNum('limit')
    const limit = Math.min(Math.max(rawLimit ?? 50, 1), 200)

    const filters: ReferenceFilters = {
      q: asStr('q'),
      industry: asStr('industry'),
      style: asStr('style'),
      format: asStr('format'),
      useCase: asStr('useCase'),
      client: asStr('client'),
      typeProjet: asStr('typeProjet'),
      bu: asStr('bu'),
      minRating: asNum('minRating'),
      minCreativeQuality: asNum('minCreativeQuality'),
      diffusableOnly: asBool('diffusableOnly'),
      yearFrom: asNum('yearFrom'),
      yearTo: asNum('yearTo'),
      hasVimeo: asBool('hasVimeo'),
      limit,
    }

    const store = await ensureReferencesStore()
    const refs = filterReferences(store.references, filters)

    return NextResponse.json(
      sanitize({
        count: refs.length,
        total: store.references.length,
        lastSync: store.lastSync,
        references: refs,
      }),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[api/references/search] error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to search references'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
