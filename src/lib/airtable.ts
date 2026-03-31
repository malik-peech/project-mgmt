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

export async function getAll(
  tableName: string,
  options?: Airtable.SelectOptions<Airtable.FieldSet>
): Promise<Airtable.Record<Airtable.FieldSet>[]> {
  const records: Airtable.Record<Airtable.FieldSet>[] = []
  await base(tableName)
    .select(options ?? {})
    .eachPage((pageRecords, fetchNextPage) => {
      records.push(...pageRecords)
      fetchNextPage()
    })
  return records
}

export async function getById(
  tableName: string,
  id: string
): Promise<Airtable.Record<Airtable.FieldSet>> {
  return base(tableName).find(id)
}

export async function createRecord(
  tableName: string,
  fields: Airtable.FieldSet
): Promise<Airtable.Record<Airtable.FieldSet>> {
  return base(tableName).create(fields)
}

export async function updateRecord(
  tableName: string,
  id: string,
  fields: Airtable.FieldSet
): Promise<Airtable.Record<Airtable.FieldSet>> {
  return base(tableName).update(id, fields)
}

export async function deleteRecord(
  tableName: string,
  id: string
): Promise<Airtable.Record<Airtable.FieldSet>> {
  return base(tableName).destroy(id)
}
