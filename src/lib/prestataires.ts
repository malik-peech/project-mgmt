/**
 * Helpers to interact with the external "Prestataires" base (appl8Xpp95PUyLB0M).
 *
 * This is a SEPARATE Airtable base from the main project base. We write to it
 * directly via the REST API (no in-memory store), reusing AIRTABLE_API_KEY.
 *
 * Records created here are eventually synced back into the main base's
 * Ressources table via an Airtable built-in sync (see "Sync back to Ressources
 * base" field on the table), so new prestataires may take a few minutes to
 * appear in the Ressources list.
 */

export const PRESTATAIRES_BASE_ID = 'appl8Xpp95PUyLB0M'
export const PRESTATAIRES_TABLE_ID = 'tblPDR3xTLcWhXwge'
export const CATEGORIES_TABLE_ID = 'tbl4M0uGRRfaROPbt'

const API_BASE = 'https://api.airtable.com/v0'

type AirtableRecord = { id: string; fields: Record<string, unknown> }

function authHeader(): Record<string, string> {
  const key = process.env.AIRTABLE_API_KEY
  if (!key) throw new Error('AIRTABLE_API_KEY not set')
  return { Authorization: `Bearer ${key}` }
}

// ── Categories (linked-record source for "Main category") ──

/** In-memory cache so we don't hit Airtable on every dropdown render. */
let categoriesCache: { items: { id: string; name: string }[]; ts: number } | null = null
const CATEGORIES_TTL_MS = 10 * 60 * 1000 // 10 minutes

export async function fetchPrestataireCategories(): Promise<{ id: string; name: string }[]> {
  const now = Date.now()
  if (categoriesCache && now - categoriesCache.ts < CATEGORIES_TTL_MS && categoriesCache.items.length > 0) {
    return categoriesCache.items
  }

  const items: { id: string; name: string }[] = []
  let offset: string | undefined
  let firstRecordLogged = false

  do {
    const url = new URL(`${API_BASE}/${PRESTATAIRES_BASE_ID}/${CATEGORIES_TABLE_ID}`)
    url.searchParams.set('pageSize', '100')
    if (offset) url.searchParams.set('offset', offset)

    const res = await fetch(url.toString(), { headers: authHeader(), cache: 'no-store' })
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Categories fetch failed: ${res.status} ${txt}`)
    }
    const json = (await res.json()) as { records: AirtableRecord[]; offset?: string }

    for (const r of json.records) {
      const f = r.fields

      // Log the first record's field names so we can debug in Coolify logs if
      // the primary field is named something unexpected.
      if (!firstRecordLogged) {
        console.log('[prestataires/categories] first record field keys:', Object.keys(f))
        firstRecordLogged = true
      }

      const name = extractPrimaryName(f)
      if (name) items.push({ id: r.id, name })
    }

    offset = json.offset
  } while (offset)

  items.sort((a, b) => a.name.localeCompare(b.name))
  // Don't cache empty results — they're almost always a misconfiguration we want
  // the next call to retry once the issue is fixed.
  if (items.length > 0) categoriesCache = { items, ts: now }
  return items
}

/**
 * Find the primary-field-like value of a record. Tries known names first,
 * then falls back to the first non-empty string field in the record so the
 * dropdown still works regardless of the table's primary-field name.
 */
function extractPrimaryName(fields: Record<string, unknown>): string {
  const candidates = ['Name', 'Catégorie', 'Categorie', 'Category', 'Title', 'Titre', 'Nom']
  for (const k of candidates) {
    const v = fields[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  for (const v of Object.values(fields)) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

// ── Create a Prestataire record ──

export type CreatePrestataireInput = {
  name: string
  preferencePaiement?: 'Virement' | 'Paypal' | 'Paiement direct'
  iban?: string
  ribAttachments?: { url: string; filename: string }[]
  paypal?: string
  instructionsPaiement?: string
  telephone?: string
  email?: string
  mainCategoryId?: string
  photoAttachments?: { url: string; filename: string }[]
}

export async function createPrestataire(input: CreatePrestataireInput): Promise<{ id: string }> {
  const fields: Record<string, unknown> = {
    Name: input.name,
    Statut: 'Validé', // hardcoded as requested
  }

  if (input.preferencePaiement) fields['Préférence de paiement'] = input.preferencePaiement
  if (input.preferencePaiement === 'Virement') {
    if (input.iban) fields['IBAN'] = input.iban
    if (input.ribAttachments?.length) fields['RIB'] = input.ribAttachments
  } else if (input.preferencePaiement === 'Paypal') {
    if (input.paypal) fields['Paypal'] = input.paypal
  }
  if (input.instructionsPaiement) fields['Instructions spécifiques de paiement'] = input.instructionsPaiement
  if (input.telephone) fields['Téléphone'] = input.telephone
  if (input.email) fields['Email'] = input.email
  if (input.mainCategoryId) fields['Main category'] = [input.mainCategoryId]
  if (input.photoAttachments?.length) fields['Photo'] = input.photoAttachments

  const res = await fetch(`${API_BASE}/${PRESTATAIRES_BASE_ID}/${PRESTATAIRES_TABLE_ID}`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Create prestataire failed: ${res.status} ${txt}`)
  }

  const record = (await res.json()) as AirtableRecord
  return { id: record.id }
}

// ── Edit an existing Prestataire (source of the synced Ressources mirror) ──

/**
 * Resolve the SOURCE record id from the numeric "ID" shared with the mirror.
 * The main-base Ressources table is a read-only sync of this base, so edits
 * must target the source record — matched by the synced autoNumber "ID".
 */
export async function findSourceRecordIdByNumericId(numId: number): Promise<string | null> {
  const url = new URL(`${API_BASE}/${PRESTATAIRES_BASE_ID}/${PRESTATAIRES_TABLE_ID}`)
  url.searchParams.set('filterByFormula', `{ID}=${numId}`)
  url.searchParams.set('maxRecords', '1')
  const res = await fetch(url.toString(), { headers: authHeader(), cache: 'no-store' })
  if (!res.ok) throw new Error(`Prestataire lookup failed: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { records: AirtableRecord[] }
  return json.records?.[0]?.id ?? null
}

/** PATCH fields on a source Prestataire record (typecast on, so selects auto-create). */
export async function patchPrestataire(recordId: string, fields: Record<string, unknown>): Promise<AirtableRecord> {
  const res = await fetch(`${API_BASE}/${PRESTATAIRES_BASE_ID}/${PRESTATAIRES_TABLE_ID}/${recordId}`, {
    method: 'PATCH',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true }),
  })
  if (!res.ok) throw new Error(`Update prestataire failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as AirtableRecord
}

/** Read current attachments of an attachment field on a source record. */
export async function getPrestataireAttachments(recordId: string, field: string): Promise<{ id?: string; url: string; filename?: string }[]> {
  const res = await fetch(`${API_BASE}/${PRESTATAIRES_BASE_ID}/${PRESTATAIRES_TABLE_ID}/${recordId}`, {
    headers: authHeader(),
    cache: 'no-store',
  })
  if (!res.ok) return []
  const rec = (await res.json()) as AirtableRecord
  return (rec.fields?.[field] as { id?: string; url: string; filename?: string }[]) || []
}
