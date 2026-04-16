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
 * GET /api/a-briefer?pm=Name
 *
 * Returns active projets where "Brief effectué" is unchecked. Scoped to the
 * PM (via PM manual / PM2 manual) unless pm=__all. Admins pass __all.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const pmName = searchParams.get('pm')
    if (!pmName) return NextResponse.json({ error: 'pm param required' }, { status: 400 })

    const store = await ensureStore()
    const clientMap = buildLookupMap(store.clients, 'Client')
    const ACTIVE = ['En cours', 'Finalisation', 'Stand-by', 'Tentative', 'Intention']
    const all = pmName === '__all'

    const projets: {
      id: string
      ref?: string
      nom: string
      clientName?: string
      statut?: string
      agence?: string
      pm?: string
      pm2?: string
      daOfficial?: string
      phase?: string
      briefEffectue: boolean
      dateBrief?: string
      statutBrief?: string
      dateFinalisationPrevue?: string
    }[] = []

    for (const r of store.projets.records) {
      const f = r.fields
      const statut = str(f['Statut'])
      if (!statut || !ACTIVE.includes(statut)) continue

      const briefEffectue = !!f['Brief effectué']
      if (briefEffectue) continue

      const pm = sel(f['PM (manual)'])
      const pm2 = sel(f['PM2 (manual)'])
      if (!all && pm !== pmName && pm2 !== pmName) continue

      const clientIds = f['Client link'] as string[] | undefined
      const clientId = clientIds?.[0]

      projets.push({
        id: r.id,
        ref: str(f['Project réf']),
        nom: str(f['Projet']) || '',
        clientName: clientId ? clientMap.get(clientId) || '' : '',
        statut,
        agence: sel(f['Agence']),
        pm,
        pm2,
        daOfficial: sel(f['DA (official)']),
        phase: str(f['Phase']),
        briefEffectue,
        dateBrief: str(f['Date de brief (si non)']),
        statutBrief: str(f['Statut du brief']),
        dateFinalisationPrevue: str(f['Date de finalisation prévue']),
      })
    }

    // Sort: items with a planned brief date first (ascending), then the rest.
    projets.sort((a, b) => {
      const ad = a.dateBrief || ''
      const bd = b.dateBrief || ''
      if (ad && !bd) return -1
      if (!ad && bd) return 1
      if (ad && bd) return ad.localeCompare(bd)
      return (a.nom || '').localeCompare(b.nom || '')
    })

    return NextResponse.json(sanitize({ projets }), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Error fetching à briefer:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
