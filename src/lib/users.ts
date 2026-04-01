/**
 * User management backed by Airtable table "App user" (tblGJI7r6LpcFbqZQ).
 * Fields: Name, Type (PM/DA/Admin), Login, Password, Matching.
 * Matching = name as it appears in Airtable PM (manual) / DA fields.
 */

export type UserRole = 'PM' | 'DA' | 'Admin'

export interface AppUser {
  id: string          // Airtable record ID
  name: string        // Display name
  login: string       // Login identifier
  password: string    // Plain text password
  role: UserRole
  matching: string    // Name as in Airtable PM (manual)
}

const baseId = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
const tableId = 'tblGJI7r6LpcFbqZQ'
const apiKey = process.env.AIRTABLE_API_KEY || ''

const headers = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
}

const atUrl = `https://api.airtable.com/v0/${baseId}/${tableId}`

function mapRecord(rec: { id: string; fields: Record<string, unknown> }): AppUser {
  const f = rec.fields
  const typeVal = f['Type']
  let role: UserRole = 'PM'
  if (typeof typeVal === 'string') {
    role = (['PM', 'DA', 'Admin'].includes(typeVal) ? typeVal : 'PM') as UserRole
  } else if (typeVal && typeof typeVal === 'object' && 'name' in (typeVal as Record<string, unknown>)) {
    const name = (typeVal as { name: string }).name
    role = (['PM', 'DA', 'Admin'].includes(name) ? name : 'PM') as UserRole
  }

  return {
    id: rec.id,
    name: (f['Name'] as string) || '',
    login: (f['Login'] as string) || (f['Name'] as string) || '',
    password: (f['Password'] as string) || '',
    role,
    matching: (f['Matching'] as string) || (f['Name'] as string) || '',
  }
}

// ── In-memory cache (refreshed every 60s) ──

let cachedUsers: AppUser[] | null = null
let lastFetch = 0
const CACHE_TTL = 60_000 // 1 minute

async function fetchAllUsers(): Promise<AppUser[]> {
  try {
    const res = await fetch(`${atUrl}?pageSize=100`, {
      headers,
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('Airtable users fetch error:', res.status)
      return cachedUsers || []
    }
    const data = await res.json()
    const users = (data.records || []).map(mapRecord)
    cachedUsers = users
    lastFetch = Date.now()
    return users
  } catch (err) {
    console.error('Error fetching users from Airtable:', err)
    return cachedUsers || []
  }
}

async function getCachedUsers(): Promise<AppUser[]> {
  if (!cachedUsers || Date.now() - lastFetch > CACHE_TTL) {
    return fetchAllUsers()
  }
  return cachedUsers
}

// Force refresh (e.g. after create/update/delete)
function invalidateCache() {
  cachedUsers = null
  lastFetch = 0
}

// ── Public API (all async now) ──

export async function getUsers(): Promise<AppUser[]> {
  return getCachedUsers()
}

export async function getUserByLogin(login: string): Promise<AppUser | undefined> {
  const users = await getCachedUsers()
  return users.find((u) => u.login.toLowerCase() === login.toLowerCase())
}

export async function getUserByName(name: string): Promise<AppUser | undefined> {
  const users = await getCachedUsers()
  return users.find((u) => u.name.toLowerCase() === name.toLowerCase())
}

export async function getUsersByRole(role: UserRole): Promise<AppUser[]> {
  const users = await getCachedUsers()
  return users.filter((u) => u.role === role)
}

export async function createUser(user: { name: string; login: string; password: string; role: UserRole; matching: string }): Promise<AppUser> {
  const res = await fetch(atUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      records: [{
        fields: {
          Name: user.name,
          Type: user.role,
          Login: user.login,
          Password: user.password,
          Matching: user.matching,
        },
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to create user: ${err}`)
  }

  const data = await res.json()
  invalidateCache()
  return mapRecord(data.records[0])
}

export async function updateUser(
  recordId: string,
  updates: { name?: string; login?: string; password?: string; role?: UserRole; matching?: string }
): Promise<AppUser> {
  const fields: Record<string, unknown> = {}
  if (updates.name !== undefined) fields['Name'] = updates.name
  if (updates.login !== undefined) fields['Login'] = updates.login
  if (updates.password) fields['Password'] = updates.password
  if (updates.role) fields['Type'] = updates.role
  if (updates.matching !== undefined) fields['Matching'] = updates.matching

  const res = await fetch(atUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      records: [{ id: recordId, fields }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to update user: ${err}`)
  }

  const data = await res.json()
  invalidateCache()
  return mapRecord(data.records[0])
}

export async function deleteUser(recordId: string): Promise<void> {
  const res = await fetch(`${atUrl}?records[]=${recordId}`, {
    method: 'DELETE',
    headers,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to delete user: ${err}`)
  }

  invalidateCache()
}
