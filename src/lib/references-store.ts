/**
 * In-memory RAM cache for the Belle Base (Airtable base `appEVRkaM6cM2EeDs`).
 *
 * Same pattern as `src/lib/store.ts` but targets a different Airtable base
 * (Belle Base lives in its own workspace). This store powers the AI sales
 * assistant: it exposes a denormalized, flat `Reference[]` ready for filtering
 * + LLM tool-calling without re-reading Airtable on every query.
 *
 * Architecture:
 * - Fetches 2 tables: "Base" (livrables) + "Projets" (sync'd projects)
 * - Joins client/project metadata onto each livrable (flat denormalized shape)
 * - Background sync every 10 minutes
 * - Readers call `ensureReferencesStore()` (lazy init + deduped concurrent calls)
 */

import type { Reference } from '@/types'

// ── Config ──

const BELLE_BASE_ID = 'appEVRkaM6cM2EeDs'
const BELLE_LIVRABLES_TABLE = 'tblm0ysiZEAPk37vt' // "Base"
const BELLE_PROJETS_TABLE = 'tblgUxrDmnxa8TxB5'   // sync'd Projets

const SYNC_INTERVAL = 600_000 // 10 minutes

// ── Low-level Airtable helpers (scoped to Belle base) ──

type RawRecord = {
  id: string
  fields: Record<string, unknown>
}

function atHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_API_KEY || ''}`,
    'Content-Type': 'application/json',
  }
}

async function fetchAll(tableId: string, params = ''): Promise<RawRecord[]> {
  const records: RawRecord[] = []
  let offset: string | undefined
  do {
    const qs = new URLSearchParams(params)
    if (offset) qs.set('offset', offset)
    const url = `https://api.airtable.com/v0/${BELLE_BASE_ID}/${tableId}?${qs.toString()}`
    const res = await fetch(url, { headers: atHeaders(), cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Belle base fetch ${tableId} failed: ${res.status} ${await res.text()}`)
    }
    const data = await res.json()
    records.push(...((data.records as RawRecord[]) || []))
    offset = data.offset
  } while (offset)
  return records
}

// ── Store state ──

type ReferencesStore = {
  references: Reference[]
  byId: Map<string, Reference>
  lastSync: number
}

let store: ReferencesStore | null = null
let syncing = false
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let intervalId: any = null
let initPromise: Promise<void> | null = null

// ── Field mapping helpers ──

function str(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v || undefined
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) {
    const first = v[0]
    if (typeof first === 'string') return first || undefined
    if (typeof first === 'number') return String(first)
  }
  return undefined
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }
  if (Array.isArray(v) && v.length > 0) return num(v[0])
  return undefined
}

function arrStr(v: unknown): string[] | undefined {
  if (v == null) return undefined
  if (Array.isArray(v)) {
    const out = v
      .map((x) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : null))
      .filter((x): x is string => !!x && x.length > 0)
    return out.length > 0 ? Array.from(new Set(out)) : undefined
  }
  if (typeof v === 'string' && v) return [v]
  return undefined
}

function mergeArrs(...arrs: (string[] | undefined)[]): string[] | undefined {
  const merged = new Set<string>()
  for (const a of arrs) if (a) for (const s of a) merged.add(s)
  return merged.size > 0 ? Array.from(merged) : undefined
}

// ── Mapping: Belle-base "Projets" → lookup map (id → {projetRef, clientName}) ──

type ProjetMeta = {
  projetRef?: string
  clientName?: string
  typeProjet?: string[]
  bu?: string[]
  industries?: string[]
}

function mapProjets(records: RawRecord[]): Map<string, ProjetMeta> {
  const map = new Map<string, ProjetMeta>()
  for (const r of records) {
    const f = r.fields
    map.set(r.id, {
      projetRef: str(f['Project réf']),
      clientName: str(f['Client link']),
      typeProjet: arrStr(f['Type de projet']),
      bu: arrStr(f['BU lookup']),
      industries: arrStr(f['Main Industries (from Industry Link)']),
    })
  }
  return map
}

// ── Mapping: Belle-base "Base" record → Reference ──

function mapLivrable(r: RawRecord, projetsMap: Map<string, ProjetMeta>): Reference | null {
  const f = r.fields
  const titre = str(f['Titre'])
  if (!titre) return null // skip nameless entries

  // Resolve projet meta via first linked projet
  const projetLinks = arrStr(f['Projets']) || []
  const projet = projetLinks.length > 0 ? projetsMap.get(projetLinks[0]) : undefined

  // Industry: primary singleSelect + merge of lookups
  const industry = str(f['Industry'])
  const industries = mergeArrs(
    arrStr(f['Main Industries']),
    arrStr(f['Industry (New)']),
    industry ? [industry] : undefined,
    projet?.industries,
  )

  // Use case: primary singleSelect + merge of lookups
  const useCase = str(f['Use case'])
  const useCases = mergeArrs(
    arrStr(f['Use case (new)']),
    arrStr(f['Use case 2']),
    useCase ? [useCase] : undefined,
  )

  return {
    id: r.id,
    titre,
    vimeoUrl: str(f['Vimeo link']),
    clientName: str(f['Client lookup']) || projet?.clientName,
    projetRef: projet?.projetRef,
    year: num(f['Year']),
    industry,
    industries,
    useCase,
    useCases,
    style: str(f['Style']),
    mainStyle: str(f['Main style']),
    format: str(f['Format']),
    duree: str(f['Durée']),
    narration: str(f['Narration']),
    moodTone: arrStr(f['Mood & Tone']),
    langue: arrStr(f['Langue']),
    bu: mergeArrs(arrStr(f['BU']), arrStr(f['Business Unit']), projet?.bu),
    product: mergeArrs(arrStr(f['Product']), arrStr(f['Product Unit'])),
    typeProjet: mergeArrs(arrStr(f['Type de projet']), projet?.typeProjet),
    rating: num(f['Rating']),
    creativeQuality: num(f['Creative quality']),
    diffusable: str(f['Diffusable ?']),
    createdAt: str(f['create']),
  }
}

// ── Sync logic ──

async function syncAll() {
  if (syncing) return
  syncing = true

  try {
    const [livrables, projets] = await Promise.all([
      fetchAll(BELLE_LIVRABLES_TABLE),
      fetchAll(BELLE_PROJETS_TABLE, 'fields%5B%5D=Project%20r%C3%A9f&fields%5B%5D=Client%20link&fields%5B%5D=Type%20de%20projet&fields%5B%5D=BU%20lookup&fields%5B%5D=Main%20Industries%20(from%20Industry%20Link)'),
    ])

    const projetsMap = mapProjets(projets)

    const references: Reference[] = []
    const byId = new Map<string, Reference>()
    for (const r of livrables) {
      const ref = mapLivrable(r, projetsMap)
      if (!ref) continue
      references.push(ref)
      byId.set(ref.id, ref)
    }

    // Only swap in the new data if we actually got something — preserve stale
    // data on fetch failures.
    if (references.length > 0 || !store) {
      store = { references, byId, lastSync: Date.now() }
    }

    console.log(
      `[ReferencesStore] Synced: ${references.length} references (from ${livrables.length} livrables, ${projets.length} projets)`,
    )
  } catch (err) {
    console.error('[ReferencesStore] Sync error:', err)
  } finally {
    syncing = false
  }
}

// ── Public API ──

export async function ensureReferencesStore(): Promise<ReferencesStore> {
  if (store) return store

  if (!initPromise) {
    initPromise = (async () => {
      await syncAll()

      if (!intervalId) {
        intervalId = setInterval(() => {
          syncAll().catch((err) => console.error('[ReferencesStore] Background sync error:', err))
        }, SYNC_INTERVAL)
      }
    })()
  }

  await initPromise
  return store!
}

export function getReferencesStore(): ReferencesStore | null {
  return store
}

export async function refreshReferences(): Promise<void> {
  await syncAll()
}

// ── Query helpers ──

export interface ReferenceFilters {
  q?: string                 // free text → matches titre, clientName, moodTone
  industry?: string          // case-insensitive contains; matches industry + industries[]
  style?: string             // matches style + mainStyle
  format?: string
  useCase?: string           // matches useCase + useCases[]
  client?: string            // contains on clientName
  typeProjet?: string        // matches typeProjet[] (e.g. "3D", "Live")
  bu?: string
  minRating?: number         // filter rating >= n
  minCreativeQuality?: number
  diffusableOnly?: boolean   // keep only entries with diffusable starting with "OK"
  yearFrom?: number
  yearTo?: number
  hasVimeo?: boolean         // keep only entries with a Vimeo link
  limit?: number             // default 50
}

function matchStr(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function matchAny(hay: (string | undefined)[], needle: string): boolean {
  const n = needle.toLowerCase()
  return hay.some((s) => !!s && s.toLowerCase().includes(n))
}

function matchArr(arr: string[] | undefined, needle: string): boolean {
  if (!arr) return false
  const n = needle.toLowerCase()
  return arr.some((s) => s.toLowerCase().includes(n))
}

/**
 * Rank score used to sort filtered results. Higher = better.
 * Prioritizes refs that are (a) diffusable, (b) highly rated, (c) have a vimeo link.
 */
function score(r: Reference): number {
  let s = 0
  if (r.diffusable && r.diffusable.toLowerCase().startsWith('ok')) s += 50
  if (r.vimeoUrl) s += 20
  s += (r.rating || 0) * 5
  s += (r.creativeQuality || 0) * 3
  if (r.year) s += Math.min(r.year - 2020, 5) // recent = better (cap at +5)
  return s
}

export function filterReferences(all: Reference[], filters: ReferenceFilters): Reference[] {
  const limit = filters.limit ?? 50

  const out = all.filter((r) => {
    if (filters.q) {
      const q = filters.q
      if (
        !matchStr(r.titre, q) &&
        !matchStr(r.clientName, q) &&
        !matchArr(r.moodTone, q) &&
        !matchArr(r.industries, q) &&
        !matchArr(r.useCases, q) &&
        !matchArr(r.typeProjet, q)
      ) {
        return false
      }
    }
    if (filters.industry) {
      if (!matchAny([r.industry], filters.industry) && !matchArr(r.industries, filters.industry)) {
        return false
      }
    }
    if (filters.style) {
      if (!matchAny([r.style, r.mainStyle], filters.style)) return false
    }
    if (filters.format) {
      if (!matchStr(r.format, filters.format)) return false
    }
    if (filters.useCase) {
      if (!matchAny([r.useCase], filters.useCase) && !matchArr(r.useCases, filters.useCase)) {
        return false
      }
    }
    if (filters.client) {
      if (!matchStr(r.clientName, filters.client)) return false
    }
    if (filters.typeProjet) {
      if (!matchArr(r.typeProjet, filters.typeProjet)) return false
    }
    if (filters.bu) {
      if (!matchArr(r.bu, filters.bu)) return false
    }
    if (filters.minRating != null) {
      if ((r.rating ?? 0) < filters.minRating) return false
    }
    if (filters.minCreativeQuality != null) {
      if ((r.creativeQuality ?? 0) < filters.minCreativeQuality) return false
    }
    if (filters.diffusableOnly) {
      if (!r.diffusable || !r.diffusable.toLowerCase().startsWith('ok')) return false
    }
    if (filters.yearFrom != null) {
      if (!r.year || r.year < filters.yearFrom) return false
    }
    if (filters.yearTo != null) {
      if (!r.year || r.year > filters.yearTo) return false
    }
    if (filters.hasVimeo) {
      if (!r.vimeoUrl) return false
    }
    return true
  })

  out.sort((a, b) => score(b) - score(a))
  return out.slice(0, limit)
}
