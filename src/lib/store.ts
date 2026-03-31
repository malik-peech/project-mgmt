/**
 * In-memory data store synced with Airtable every 30s.
 *
 * Architecture:
 * - All Airtable data is cached in RAM as plain objects
 * - API routes read from memory (0ms) instead of calling Airtable
 * - Background sync refreshes every 30s
 * - Writes go to Airtable first, then trigger immediate table re-sync
 * - If Airtable is down, stale data is still served
 */

import { getAll, TABLES } from './airtable'

// ── Types ──

type RawRecord = {
  id: string
  fields: Record<string, unknown>
}

type StoreTable = {
  records: RawRecord[]
  byId: Map<string, RawRecord>
  lastSync: number
}

type Store = {
  projets: StoreTable
  tasks: StoreTable
  cogs: StoreTable
  ressources: StoreTable
  clients: StoreTable
}

// ── Singleton ──

let store: Store | null = null
let syncing = false
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let intervalId: any = null
let initPromise: Promise<void> | null = null

const SYNC_INTERVAL = 600_000 // 10 minutes

function emptyTable(): StoreTable {
  return { records: [], byId: new Map(), lastSync: 0 }
}

function buildTable(records: { id: string; fields: Record<string, unknown> }[]): StoreTable {
  const byId = new Map<string, RawRecord>()
  const mapped = records.map((r) => {
    const rec = { id: r.id, fields: r.fields as Record<string, unknown> }
    byId.set(r.id, rec)
    return rec
  })
  return { records: mapped, byId, lastSync: Date.now() }
}

// ── Sync logic ──

async function fetchTable(tableName: string): Promise<RawRecord[]> {
  try {
    const records = await getAll(tableName)
    return records.map((r) => ({
      id: r.id,
      fields: r.fields as Record<string, unknown>,
    }))
  } catch (err: unknown) {
    console.error(`[Store] Failed to fetch ${tableName}:`, err)
    return [] // Return empty on failure, keep stale data
  }
}

async function syncAll() {
  if (syncing) return
  syncing = true

  try {
    // Fetch in 2 batches to stay under Airtable rate limit (5 req/s)
    const [projets, tasks, cogs] = await Promise.all([
      fetchTable(TABLES.PROJETS),
      fetchTable(TABLES.TASKS),
      fetchTable(TABLES.COGS),
    ])

    // Small delay between batches
    await new Promise((r) => setTimeout(r, 300))

    const [ressources, clients] = await Promise.all([
      fetchTable(TABLES.RESSOURCES),
      fetchTable(TABLES.CLIENTS),
    ])

    // Only update tables that returned data (preserve stale if fetch failed)
    if (!store) {
      store = {
        projets: emptyTable(),
        tasks: emptyTable(),
        cogs: emptyTable(),
        ressources: emptyTable(),
        clients: emptyTable(),
      }
    }

    if (projets.length > 0 || !store.projets.lastSync) store.projets = buildTable(projets)
    if (tasks.length > 0 || !store.tasks.lastSync) store.tasks = buildTable(tasks)
    if (cogs.length > 0 || !store.cogs.lastSync) store.cogs = buildTable(cogs)
    if (ressources.length > 0 || !store.ressources.lastSync) store.ressources = buildTable(ressources)
    if (clients.length > 0 || !store.clients.lastSync) store.clients = buildTable(clients)

    console.log(
      `[Store] Synced: ${projets.length} projets, ${tasks.length} tasks, ${cogs.length} cogs, ${ressources.length} ressources, ${clients.length} clients`
    )
  } catch (err: unknown) {
    console.error('[Store] Sync error:', err)
  } finally {
    syncing = false
  }
}

/**
 * Force a full re-sync of all tables immediately (manual refresh).
 */
export async function refreshAll(): Promise<void> {
  await syncAll()
}

/**
 * Re-sync a single table immediately (after a write operation)
 */
export async function refreshTable(tableName: string) {
  if (!store) return
  const records = await fetchTable(tableName)
  if (records.length > 0) {
    const key = tableNameToKey(tableName)
    if (key) store[key] = buildTable(records)
  }
}

function tableNameToKey(tableName: string): keyof Store | null {
  switch (tableName) {
    case TABLES.PROJETS: return 'projets'
    case TABLES.TASKS: return 'tasks'
    case TABLES.COGS: return 'cogs'
    case TABLES.RESSOURCES: return 'ressources'
    case TABLES.CLIENTS: return 'clients'
    default: return null
  }
}

// ── Public API ──

/**
 * Initialize the store (called once, idempotent).
 * First call fetches all data from Airtable and starts the 30s sync.
 * Subsequent calls return immediately.
 */
export async function ensureStore(): Promise<Store> {
  if (store) return store

  // Deduplicate concurrent init calls
  if (!initPromise) {
    initPromise = (async () => {
      await syncAll()

      // Start background sync
      if (!intervalId) {
        intervalId = setInterval(() => {
          syncAll().catch((err: unknown) => console.error('[Store] Background sync error:', err))
        }, SYNC_INTERVAL)
      }
    })()
  }

  await initPromise
  return store!
}

/**
 * Get the store synchronously (returns null if not initialized yet).
 * Use ensureStore() for first access in API routes.
 */
export function getStore(): Store | null {
  return store
}

// ── Query helpers ──

export function getRecords(table: StoreTable): RawRecord[] {
  return table.records
}

export function getRecordById(table: StoreTable, id: string): RawRecord | undefined {
  return table.byId.get(id)
}

/**
 * Build a lookup map from a table (e.g. clients id → name)
 */
export function buildLookupMap(
  table: StoreTable,
  fieldName: string
): Map<string, string> {
  const map = new Map<string, string>()
  for (const r of table.records) {
    map.set(r.id, (r.fields[fieldName] as string) || '')
  }
  return map
}
