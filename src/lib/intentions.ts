/**
 * Intentions live in a SEPARATE Airtable base from the main PM base.
 * - Base: app6K1rgFNjgEMVdP
 * - Table: tblgfHSuhwyuZzmGf (named "Réponse" — semantically the intentions table)
 * - Linked Month table: tbli5G34nrlIjODU3
 *
 * Auth uses the same AIRTABLE_API_KEY (it has access to both bases).
 */

export const INTENTIONS_BASE_ID =
  process.env.AIRTABLE_INTENTIONS_BASE_ID || 'app6K1rgFNjgEMVdP'
export const INTENTIONS_TABLE_ID = 'tblgfHSuhwyuZzmGf'
export const INTENTIONS_MONTH_TABLE_ID = 'tbli5G34nrlIjODU3'

export const INTENTIONS_STATUTS = [
  'En production',
  'Attente décision',
  'Perdu',
  'Gagné',
  'Abandonné',
  'Ready to send / present',
] as const
export type IntentionStatut = (typeof INTENTIONS_STATUTS)[number]

export const INTENTIONS_HEADCOUNTS = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5001-10000',
  '+10000',
] as const

export const INTENTIONS_ORIGINES = ['Client existant', 'Nouveau client'] as const

export const INTENTIONS_CONTEXTES = [
  'Proposé par les sales',
  'Reco solo sales',
  'Demandé aux sales ',
  'Invité à répondre à un AO',
  'Listing',
] as const

export const INTENTIONS_SALES = [
  'Malik',
  'Sophie',
  'Rodolphe',
  'Camille Buffa',
  'Camille Choteau',
  'Mélida',
  'Mazarine',
  'Mazarine Alessandra',
  'Louis',
  'Julie',
  'Alice',
  'Tiphaine',
  'David',
  'Laurine',
  'Solene',
] as const

export type Attachment = {
  id?: string
  url: string
  filename: string
  type?: string
  size?: number
}

export type Intention = {
  id: string
  client?: string
  projet?: string
  sales?: string
  statut?: IntentionStatut
  headcount?: string
  origine?: string
  contexte?: string
  type?: string
  monthIds?: string[]
  monthNames?: string[]
  brief?: string
  pieces?: Attachment[]
  budgetEstime?: number
  deadline?: string
  clientOkPourCallBrief?: boolean
  clientOkPourPresentation?: boolean
  budgetCommunique?: boolean
  onboardingOk?: boolean
  date?: string
  createdTime?: string
}

export type IntentionMonth = {
  id: string
  name: string
}

/**
 * Resolve an app userName to a value that matches Intentions.Sales.
 * Intentions table uses first-name only for most users (e.g. "Malik" instead
 * of "Malik Goulamhoussen"). Try exact match first, then first-name fallback.
 */
export function matchIntentionsSales(userName: string): string {
  if (!userName) return ''
  const exact = INTENTIONS_SALES.find((s) => s === userName)
  if (exact) return exact
  const firstName = userName.split(' ')[0]
  const byFirst = INTENTIONS_SALES.find(
    (s) => s.split(' ')[0].toLowerCase() === firstName.toLowerCase(),
  )
  return byFirst || ''
}
