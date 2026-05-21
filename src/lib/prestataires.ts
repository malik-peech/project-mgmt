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
  if (categoriesCache && now - categoriesCache.ts < CATEGORIES_TTL_MS) {
    return categoriesCache.items
  }

  const items: { id: string; name: string }[] = []
  let offset: string | undefined

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
      // Primary field on the Categories table — try common candidates.
      const f = r.fields
      const name =
        (typeof f['Name'] === 'string' && f['Name']) ||
        (typeof f['Catégorie'] === 'string' && f['Catégorie']) ||
        (typeof f['Categorie'] === 'string' && f['Categorie']) ||
        (typeof f['Title'] === 'string' && f['Title']) ||
        ''
      if (name) items.push({ id: r.id, name: String(name) })
    }

    offset = json.offset
  } while (offset)

  items.sort((a, b) => a.name.localeCompare(b.name))
  categoriesCache = { items, ts: now }
  return items
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
