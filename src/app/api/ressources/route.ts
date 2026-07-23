import { NextResponse } from 'next/server'
import { createRecord, TABLES } from '@/lib/airtable'
import { ensureStore, upsertRecord, buildLookupMap } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import type { Ressource, RessourceComment } from '@/types'

/** Safely extract a number from an Airtable field (handles {specialValue} objects) */
function num(val: unknown): number | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return val
  if (Array.isArray(val)) return num(val[0])
  if (typeof val === 'object') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

function str(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (Array.isArray(val)) return str(val[0])
  if (typeof val === 'object') return undefined
  return String(val)
}

export async function GET(request: Request) {
  try {
    const store = await ensureStore()
    const { searchParams } = new URL(request.url)
    // RH/Admin back-office asks for every resource (incl. blacklisted / non-validé)
    const includeAll = searchParams.get('all') === '1'

    const projetRefMap = buildLookupMap(store.projets, 'Project réf')

    // Aggregate quality comments per resource from the COGS table.
    // Each COGS row may carry a "Qualité (comment)" + "Qualité (note)" filled by the PM.
    const commentsByRessource = new Map<string, RessourceComment[]>()
    for (const c of store.cogs.records) {
      const f = c.fields
      const comment = str(f['Qualité (comment)'])
      const note = num(f['Qualité (note)'])
      if (!comment && note == null) continue
      const ressourceId = (f['Ressource'] as string[] | undefined)?.[0]
      if (!ressourceId) continue
      const projetId = (f['Projet'] as string[] | undefined)?.[0]
      const projetRef = projetId ? projetRefMap.get(projetId) || undefined : undefined
      const list = commentsByRessource.get(ressourceId) ?? []
      list.push({ comment: comment || undefined, note, projetRef })
      commentsByRessource.set(ressourceId, list)
    }

    const ressources: Ressource[] = []

    for (const r of store.ressources.records) {
      const f = r.fields

      const blacklist = !!f['Blacklist']
      // Default (PM/COGS) view hides blacklisted resources; RH view keeps them.
      if (blacklist && !includeAll) continue

      const comments = commentsByRessource.get(r.id) ?? []

      ressources.push({
        id: r.id,
        name: (f['Name'] as string) || '',
        email: f['Email'] as string | undefined,
        categorie: f['Catégorie'] as string[] | undefined,
        statut: f['Statut'] as string | undefined,
        pays: f['Pays'] as string | undefined,
        ville: f['Ville'] as string | undefined,
        telephone: f['Téléphone'] as string | undefined,
        description: f['Description'] as string | undefined,
        iban: f['IBAN'] as string | undefined,
        paypal: f['Paypal'] as string | undefined,
        instructionsPaiement: f['Instructions spécifiques de paiement'] as string | undefined,
        contactPrincipal: f['Contact principal (si société)'] as string | undefined,
        declarationHonoraires: !!f['Déclaration honoraires'],
        blacklist,
        rating: num(f['Rating']),
        comments: comments.length > 0 ? comments : undefined,
        rib: Array.isArray(f['RIB'])
          ? (f['RIB'] as { url: string; filename: string }[]).map((a) => ({ url: a.url, filename: a.filename }))
          : undefined,
        photo: Array.isArray(f['Photo'])
          ? (f['Photo'] as { url: string; filename: string }[]).map((a) => ({ url: a.url, filename: a.filename }))
          : undefined,
      })
    }

    // Sort by name
    ressources.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json(sanitize(ressources))
  } catch (error) {
    console.error('Error fetching ressources:', error)
    return NextResponse.json({ error: 'Failed to fetch ressources' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const fields: Record<string, unknown> = {
      'Name': body.name,
    }
    if (body.email) fields['Email'] = body.email
    if (body.categorie) fields['Catégorie'] = body.categorie
    if (body.telephone) fields['Téléphone'] = body.telephone
    if (body.pays) fields['Pays'] = body.pays
    if (body.ville) fields['Ville'] = body.ville
    if (body.statut) fields['Statut'] = body.statut
    if (body.iban) fields['IBAN'] = body.iban

    const record = await createRecord(TABLES.RESSOURCES, fields as any)

    // Patch store directly with Airtable's response — no full re-fetch.
    upsertRecord(TABLES.RESSOURCES, { id: record.id, fields: record.fields as Record<string, unknown> })

    return NextResponse.json({ id: record.id, name: body.name })
  } catch (error) {
    console.error('Error creating ressource:', error)
    return NextResponse.json({ error: 'Failed to create ressource' }, { status: 500 })
  }
}
