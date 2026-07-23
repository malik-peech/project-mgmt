import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { TABLES } from '@/lib/airtable'
import { ensureStore, upsertRecord } from '@/lib/store'
import {
  findSourceRecordIdByNumericId,
  patchPrestataire,
  getPrestataireAttachments,
} from '@/lib/prestataires'

/**
 * PATCH /api/ressources/[id] — edit a resource (RH back-office).
 *
 * The main-base Ressources table is a READ-ONLY sync of the external
 * "Prestataires" base, so we resolve the source record (via the shared numeric
 * "ID") and write there. The mirror re-syncs within a few minutes; we also
 * patch the in-memory store optimistically so the UI reflects the change now.
 *
 * `id` is the MIRROR (main base) record id, as served by GET /api/ressources.
 */

// Map our API payload keys → source Prestataires field names.
const FIELD_MAP: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  telephone: 'Téléphone',
  contactPrincipal: 'Contact principal (si société)',
  categorie: 'Catégorie',
  pays: 'Pays',
  ville: 'Ville',
  statut: 'Statut',
  blacklist: 'Blacklist',
  iban: 'IBAN',
  paypal: 'Paypal',
  instructionsPaiement: 'Instructions spécifiques de paiement',
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: mirrorId } = await params
    const body = await request.json()

    const store = await ensureStore()
    const mirror = store.ressources.byId.get(mirrorId)
    if (!mirror) return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 })

    const numId = Number(mirror.fields['ID'])
    if (!Number.isFinite(numId)) {
      return NextResponse.json({ error: 'ID source manquant sur cette ressource' }, { status: 422 })
    }
    const sourceId = await findSourceRecordIdByNumericId(numId)
    if (!sourceId) {
      return NextResponse.json({ error: 'Enregistrement source introuvable' }, { status: 404 })
    }

    // Build the source field payload from the mapped keys present in the body.
    const sourceFields: Record<string, unknown> = {}
    const mirrorPatch: Record<string, unknown> = {}
    for (const [key, srcName] of Object.entries(FIELD_MAP)) {
      if (body[key] === undefined) continue
      if (key === 'categorie') {
        const arr = Array.isArray(body.categorie) ? body.categorie : []
        sourceFields[srcName] = arr
        mirrorPatch['Catégorie'] = arr
      } else if (key === 'blacklist') {
        sourceFields[srcName] = !!body.blacklist
        mirrorPatch['Blacklist'] = !!body.blacklist
      } else {
        const val = body[key] === '' ? null : body[key]
        sourceFields[srcName] = val
        // Mirror uses the same field names for these (synced 1:1).
        mirrorPatch[srcName] = val ?? undefined
      }
    }

    // Attachment deletion (RIB / Photo) on the source record.
    const removeField = body.removeRibIndex !== undefined ? 'RIB'
      : body.removePhotoIndex !== undefined ? 'Photo'
      : null
    if (removeField) {
      const removeIdx = removeField === 'RIB' ? body.removeRibIndex : body.removePhotoIndex
      const existing = await getPrestataireAttachments(sourceId, removeField)
      const remaining = existing.filter((_, i) => i !== removeIdx)
      sourceFields[removeField] = remaining.filter((a) => a.id).map((a) => ({ id: a.id! }))
    }

    if (Object.keys(sourceFields).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const updated = await patchPrestataire(sourceId, sourceFields)

    // Optimistic mirror-store update so the UI reflects the change immediately
    // (the real Airtable sync back into the mirror takes a few minutes).
    if (removeField && updated.fields[removeField] !== undefined) {
      mirrorPatch[removeField] = updated.fields[removeField]
    }
    const cleaned: Record<string, unknown> = { ...mirror.fields }
    for (const [k, v] of Object.entries(mirrorPatch)) {
      if (v === undefined) delete cleaned[k]
      else cleaned[k] = v
    }
    upsertRecord(TABLES.RESSOURCES, { id: mirrorId, fields: cleaned })

    return NextResponse.json({ id: mirrorId, sourceId })
  } catch (error) {
    console.error('Error updating ressource:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update ressource' }, { status: 500 })
  }
}
