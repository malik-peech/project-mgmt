import { NextResponse } from 'next/server'
import { ensureStore, buildLookupMap } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import { missingOnboardingFields } from '@/lib/onboarding'
import type { Projet } from '@/types'

/** Safely extract a number from an Airtable field */
function num(val: unknown): number | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return val
  if (typeof val === 'object') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

/** Safely extract a string from an Airtable field */
function str(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') return undefined
  return String(val)
}

/** Extract singleSelect value (may be string or {id,name}) */
function sel(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val && 'name' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).name)
  }
  return str(val)
}

/**
 * GET /api/onboarding[?sales=Name&view=toOnboard|archive|all]
 *
 * Returns projets where Sales = currentUser (or ?sales=) with computed
 * onboarded status. The client splits the list into two tabs.
 *
 * Admin can pass ?sales=Name to view another sales user's queue.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const salesName = searchParams.get('sales')

    if (!salesName) {
      return NextResponse.json({ error: 'sales param required' }, { status: 400 })
    }

    const store = await ensureStore()
    const clientMap = buildLookupMap(store.clients, 'Client')
    const mensuelMap = buildLookupMap(store.mensuel, 'Name')

    const projets: (Projet & { isOnboarded: boolean; missingCount: number })[] = []

    for (const r of store.projets.records) {
      const f = r.fields
      const salesVal = sel(f['Sales'])
      if (salesVal !== salesName) continue

      const statut = str(f['Statut'])
      // Skip "Archivé" statut — those are out of scope
      if (statut === 'Archivé') continue

      const clientIds = f['Client link'] as string[] | undefined
      const clientId = clientIds?.[0]
      const moisSignatureIds = (f['Mois signature'] as string[] | undefined) || undefined
      const moisSignatureNames = moisSignatureIds?.map((id) => mensuelMap.get(id) || '').filter(Boolean)

      const p: Projet = {
        id: r.id,
        ref: str(f['Project réf']),
        nom: str(f['Projet']) || '',
        clientId,
        clientName: clientId ? clientMap.get(clientId) || '' : '',
        agence: sel(f['Agence']),
        pm: sel(f['PM (manual)']),
        pm2: sel(f['PM2 (manual)']),
        da: str(f['DA']),
        daOfficial: sel(f['DA (official)']),
        phase: str(f['Phase']) as Projet['phase'],
        statut: statut as Projet['statut'],
        typeProjet: str(f['Type de projet']) as Projet['typeProjet'],
        sales: salesVal,
        moisSignatureIds,
        moisSignatureNames,
        currency: sel(f['Currency']) as Projet['currency'],
        origine: sel(f['Origine']) as Projet['origine'],
        numeroDevis: str(f['Numéro de devis']),
        dureeContrat: num(f['Durée contrat (mois)']),
        libelleFacture: str(f['Libellé facture']),
        contactCompta: str(f['Contact compta']),
        typeDeContact: sel(f['type de contact']) as Projet['typeDeContact'],
        bdc: sel(f['BDC']) as Projet['bdc'],
        numeroCommande: str(f['Numéro de commande']),
        repriseLigneDevisFacture: !!f['Reprise ligne devis sur facture'],
        briefEffectue: !!f['Brief effectué'],
        dateBrief: str(f['Date de brief (si non)']),
        bonDeCommande: Array.isArray(f['Bon de commande'])
          ? (f['Bon de commande'] as { id?: string; url: string; filename: string; type?: string; size?: number }[]).map((a) => ({
              id: a.id,
              url: a.url,
              filename: a.filename,
              type: a.type,
              size: a.size,
            }))
          : undefined,
        cogsBudget: num(f['COGS - budget (€)']),
        timeCreaBudget: num(f['Time Créa - budget (h)']),
        timeProdBudget: num(f['Time Prod - budget (h)']),
        timeDaBudget: num(f['Time DA- budget (h)']),
        travelBudget: num(f['Travel - budget (€)']),
        offreInitiale: num(f['Offre - Valeur initiale']),
        offreFinale: num(f['Offre - Valeur finale']),
        dateFinalisationPrevue: str(f['Date de finalisation prévue']),
        devisSigne: Array.isArray(f['Devis signé'])
          ? (f['Devis signé'] as { id?: string; url: string; filename: string; type?: string; size?: number }[]).map((a) => ({
              id: a.id,
              url: a.url,
              filename: a.filename,
              type: a.type,
              size: a.size,
            }))
          : undefined,
      }

      const missing = missingOnboardingFields(p)
      projets.push({ ...p, isOnboarded: missing.length === 0, missingCount: missing.length })
    }

    // Sort: not-onboarded first (by statut, then by name), then onboarded (by name)
    projets.sort((a, b) => {
      if (a.isOnboarded !== b.isOnboarded) return a.isOnboarded ? 1 : -1
      return (a.nom || '').localeCompare(b.nom || '')
    })

    const counts = {
      total: projets.length,
      toOnboard: projets.filter((p) => !p.isOnboarded).length,
      onboarded: projets.filter((p) => p.isOnboarded).length,
    }

    return NextResponse.json(
      sanitize({ projets, counts, salesName }),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching onboarding projets:', error)
    return NextResponse.json({ error: 'Failed to fetch onboarding projets' }, { status: 500 })
  }
}

