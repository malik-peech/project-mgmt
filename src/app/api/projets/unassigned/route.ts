import { NextResponse } from 'next/server'
import { ensureStore, buildLookupMap } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'

function str(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') return undefined
  return String(val)
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
 * GET /api/projets/unassigned
 * Returns active projets (En cours / Finalisation / Stand-by / Tentative / Intention)
 * that are missing PM (manual) and/or DA (official), with counts.
 *
 * Response: { projets: [...], counts: { total, missingPM, missingDA, missingBoth } }
 */
export async function GET() {
  try {
    const store = await ensureStore()
    const clientMap = buildLookupMap(store.clients, 'Client')
    const ACTIVE = ['En cours', 'Finalisation', 'Stand-by', 'Tentative', 'Intention']

    const projets: {
      id: string
      ref?: string
      nom: string
      clientName?: string
      statut?: string
      agence?: string
      pm?: string
      daOfficial?: string
      missingPM: boolean
      missingDA: boolean
      standBy: boolean
    }[] = []

    // Counters — Stand-by projets are tracked separately and do NOT contribute
    // to the PM/DA counters (they're low-priority, not urgent to staff).
    let missingPM = 0
    let missingDA = 0
    let missingBoth = 0
    let standBy = 0

    for (const r of store.projets.records) {
      const f = r.fields
      const statut = str(f['Statut'])
      if (!statut || !ACTIVE.includes(statut)) continue

      const pm = sel(f['PM (manual)'])
      const daOfficial = sel(f['DA (official)'])
      const noPM = !pm?.trim()
      const noDA = !daOfficial?.trim()
      if (!noPM && !noDA) continue

      const clientIds = f['Client link'] as string[] | undefined
      const clientId = clientIds?.[0]
      const clientName = clientId ? clientMap.get(clientId) || '' : ''

      // Skip internal Peech projets — we don't staff them via PM/DA.
      if (clientName.trim().toLowerCase() === 'peech') continue

      const isStandBy = statut === 'Stand-by'
      if (isStandBy) {
        standBy++
      } else if (noPM && noDA) {
        missingBoth++
      } else if (noPM) {
        missingPM++
      } else {
        missingDA++
      }

      projets.push({
        id: r.id,
        ref: str(f['Project réf']),
        nom: str(f['Projet']) || '',
        clientName,
        statut,
        agence: sel(f['Agence']),
        pm,
        daOfficial,
        missingPM: noPM,
        missingDA: noDA,
        standBy: isStandBy,
      })
    }

    // Sort: non-standby both-missing → non-standby missing PM → non-standby missing DA
    // → standby, then by name within each group.
    projets.sort((a, b) => {
      const rank = (p: typeof a) => {
        if (p.standBy) return 3
        if (p.missingPM && p.missingDA) return 0
        if (p.missingPM) return 1
        return 2
      }
      const rDiff = rank(a) - rank(b)
      if (rDiff !== 0) return rDiff
      return (a.nom || '').localeCompare(b.nom || '')
    })

    // Total for the sidebar badge = urgent (non-standby) only.
    const urgentTotal = missingPM + missingDA + missingBoth

    return NextResponse.json(
      sanitize({
        projets,
        counts: {
          total: urgentTotal,
          missingPM: missingPM + missingBoth,
          missingDA: missingDA + missingBoth,
          missingBoth,
          standBy,
        },
      }),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching unassigned projets:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
