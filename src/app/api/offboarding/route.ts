import { NextResponse } from 'next/server'
import { ensureStore, buildLookupMap } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import { missingOffboardingFields } from '@/lib/offboarding'
import type { Projet } from '@/types'

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
function sel(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val && 'name' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).name)
  }
  return str(val)
}

/**
 * GET /api/offboarding?pm=Name
 *
 * Returns projets that:
 *   - have Statut = "Done"
 *   - are owned by `pm` via `PM (manual)` OR `PM2 (manual)` (or all if pm=__all)
 *
 * Each projet includes its offboarding status (isOffboarded + missingCount).
 * A projet is considered offboarded once Point EOP = "Done" or "No need".
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const pmName = searchParams.get('pm')

    if (!pmName) {
      return NextResponse.json({ error: 'pm param required' }, { status: 400 })
    }

    const store = await ensureStore()
    const clientMap = buildLookupMap(store.clients, 'Client')
    const mensuelMap = buildLookupMap(store.mensuel, 'Name')

    const projets: (Projet & { isOffboarded: boolean; missingCount: number })[] = []
    const all = pmName === '__all'

    for (const r of store.projets.records) {
      const f = r.fields
      const statut = str(f['Statut'])
      if (statut !== 'Done') continue

      const pm = sel(f['PM (manual)'])
      const pm2 = sel(f['PM2 (manual)'])
      if (!all && pm !== pmName && pm2 !== pmName) continue

      const clientIds = f['Client link'] as string[] | undefined
      const clientId = clientIds?.[0]
      const eopMonthIds = (f['EOP month'] as string[] | undefined) || undefined
      const eopMonthNames = eopMonthIds?.map((id) => mensuelMap.get(id) || '').filter(Boolean)

      const p: Projet = {
        id: r.id,
        ref: str(f['Project réf']),
        nom: str(f['Projet']) || '',
        clientId,
        clientName: clientId ? clientMap.get(clientId) || '' : '',
        agence: sel(f['Agence']),
        pm,
        pm2,
        da: str(f['DA']),
        daOfficial: sel(f['DA (official)']),
        phase: str(f['Phase']) as Projet['phase'],
        statut: statut as Projet['statut'],
        typeProjet: str(f['Type de projet']) as Projet['typeProjet'],
        sales: sel(f['Sales']),
        frameArchive: !!f['Frame archivé'],
        slackArchive: !!f['Slack archivé'],
        eopMonthIds,
        eopMonthNames,
        diffusable: sel(f['Diffusable ?']) as Projet['diffusable'],
        pointEop: sel(f['Point EOP']) as Projet['pointEop'],
        datePointEop: str(f['Date point EOP']),
        dateFinalisationPrevue: str(f['Date de finalisation prévue']),
        cogsBudget: num(f['COGS - budget (€)']),
        offreFinale: num(f['Offre - Valeur finale']),
      }

      const missing = missingOffboardingFields(p)
      projets.push({ ...p, isOffboarded: missing.length === 0, missingCount: missing.length })
    }

    projets.sort((a, b) => {
      if (a.isOffboarded !== b.isOffboarded) return a.isOffboarded ? 1 : -1
      return (a.nom || '').localeCompare(b.nom || '')
    })

    const counts = {
      total: projets.length,
      toOffboard: projets.filter((p) => !p.isOffboarded).length,
      offboarded: projets.filter((p) => p.isOffboarded).length,
    }

    return NextResponse.json(
      sanitize({ projets, counts, pmName }),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching offboarding projets:', error)
    return NextResponse.json({ error: 'Failed to fetch offboarding projets' }, { status: 500 })
  }
}
