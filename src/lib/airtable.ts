import Airtable from 'airtable'

function getBase() {
  Airtable.configure({
    apiKey: process.env.AIRTABLE_API_KEY || '',
  })
  return Airtable.base(process.env.AIRTABLE_BASE_ID || '')
}

export function base(tableName: string) {
  return getBase()(tableName)
}

export const TABLES = {
  PROJETS: 'Projets',
  TASKS: 'Tasks',
  COGS: 'COGS',
  RESSOURCES: 'Ressources',
  CLIENTS: 'Clients',
} as const

export type TableName = (typeof TABLES)[keyof typeof TABLES]

// Retry with exponential backoff for Airtable rate limits (429) and transient errors
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastError = err
      const status = err?.statusCode || err?.status || err?.code
      // Retry on rate limit (429), server errors (5xx), or network errors
      const isRetryable =
        status === 429 ||
        status === 503 ||
        status === 500 ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ENOTFOUND' ||
        err?.message?.includes('RATE_LIMIT') ||
        err?.message?.includes('rate limit')
      if (!isRetryable || attempt === maxRetries) throw lastError
      // Exponential backoff: 500ms, 1.5s, 4s
      const delay = Math.min(500 * Math.pow(3, attempt), 5000)
      console.warn(`[Airtable] Retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, err?.message || err)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

export async function getAll(
  tableName: string,
  options?: Airtable.SelectOptions<Airtable.FieldSet>
): Promise<Airtable.Record<Airtable.FieldSet>[]> {
  return withRetry(async () => {
    const records: Airtable.Record<Airtable.FieldSet>[] = []
    await base(tableName)
      .select(options ?? {})
      .eachPage((pageRecords, fetchNextPage) => {
        records.push(...pageRecords)
        fetchNextPage()
      })
    return records
  })
}

export async function getById(
  tableName: string,
  id: string
): Promise<Airtable.Record<Airtable.FieldSet>> {
  return withRetry(() => base(tableName).find(id))
}

export async function createRecord(
  tableName: string,
  fields: Airtable.FieldSet
): Promise<Airtable.Record<Airtable.FieldSet>> {
  return withRetry(() => base(tableName).create(fields))
}

export async function updateRecord(
  tableName: string,
  id: string,
  fields: Airtable.FieldSet
): Promise<Airtable.Record<Airtable.FieldSet>> {
  return withRetry(() => base(tableName).update(id, fields))
}

export async function deleteRecord(
  tableName: string,
  id: string
): Promise<Airtable.Record<Airtable.FieldSet>> {
  return withRetry(() => base(tableName).destroy(id))
}
