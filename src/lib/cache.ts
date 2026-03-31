// Simple in-memory cache for server-side Airtable data
// Avoids re-fetching lookup tables (Clients, Ressources) on every request

type CacheEntry<T> = {
  data: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()

const DEFAULT_TTL = 60_000 // 1 minute

export function getCached<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.data as T
}

export function setCache<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
  store.set(key, { data, expiresAt: Date.now() + ttl })
}

export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = DEFAULT_TTL
): Promise<T> {
  const cached = getCached<T>(key)
  if (cached !== null) return cached
  const data = await fetcher()
  setCache(key, data, ttl)
  return data
}

export function invalidate(key: string): void {
  store.delete(key)
}

export function invalidateAll(): void {
  store.clear()
}
