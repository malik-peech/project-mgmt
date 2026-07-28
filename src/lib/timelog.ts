/**
 * Helpers for the "Time log" clocking table (main base appYFl5MvR7VeL0uB,
 * table tblOQo7tk5ndkXC5U). Accessed directly via the REST API (with
 * returnFieldsByFieldId so we never depend on human field labels).
 *
 * A log = Date + Duration (seconds) + Time range (preset label) + Projets link
 * + Description, owned by a team member (User collaborator + Users link,
 * table tblMPFDPGaF5ljJI4, matched from the app session name).
 */

const API_BASE = 'https://api.airtable.com/v0'
export const TIMELOG_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
export const TIMELOG_TABLE_ID = 'tblOQo7tk5ndkXC5U'
export const TEAM_TABLE_ID = 'tblMPFDPGaF5ljJI4'

// Time log field ids
export const F = {
  date: 'fldIBtpCzhqIhQE7V',
  user: 'fldbi9SFn3POhMzqa',        // singleCollaborator
  timeRange: 'fldV7Bs3SJR3Gsza5',   // singleSelect
  duration: 'fldG42Vgm1FL3nDCs',    // duration (seconds)
  projets: 'fld4Rm7ePdoml4Vfz',     // link → Projets
  description: 'fldM2BhWtigdkX76W',
  users: 'fldYiTq6wSD5r66dV',       // link → Team table
} as const

// Team table field ids
const TEAM_NAME = 'fld9rmH5DYrY0s3Nt'
const TEAM_COLLAB = 'fldGVR5cpRZ0I2fIT'

/** Preset durations — labels MUST match the "Time range" single-select options. */
export const DURATION_PRESETS: { label: string; seconds: number }[] = [
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
  { label: '45 min', seconds: 2700 },
  { label: '1h00', seconds: 3600 },
  { label: '1h30', seconds: 5400 },
  { label: '2h00', seconds: 7200 },
  { label: '2h30', seconds: 9000 },
  { label: '3h00', seconds: 10800 },
  { label: '3h30', seconds: 12600 },
  { label: '4h00', seconds: 14400 },
  { label: '5h00', seconds: 18000 },
  { label: '6h00', seconds: 21600 },
  { label: '7h00', seconds: 25200 },
  { label: '8h00', seconds: 28800 },
]

/** Nearest preset label for a given duration in seconds (for the Time range field). */
export function labelForSeconds(seconds: number): string {
  let best = DURATION_PRESETS[0]
  let bestDiff = Infinity
  for (const p of DURATION_PRESETS) {
    const d = Math.abs(p.seconds - seconds)
    if (d < bestDiff) { bestDiff = d; best = p }
  }
  return best.label
}

function authHeader(): Record<string, string> {
  const key = process.env.AIRTABLE_API_KEY
  if (!key) throw new Error('AIRTABLE_API_KEY not set')
  return { Authorization: `Bearer ${key}` }
}

export interface TeamMember {
  recordId: string
  name: string
  collabId?: string
}

// ── Team member resolution (session name → team record) ──

let teamCache: { members: TeamMember[]; ts: number } | null = null
const TEAM_TTL = 10 * 60 * 1000

async function fetchTeam(): Promise<TeamMember[]> {
  const now = Date.now()
  if (teamCache && now - teamCache.ts < TEAM_TTL) return teamCache.members
  const members: TeamMember[] = []
  let offset: string | undefined
  do {
    const url = new URL(`${API_BASE}/${TIMELOG_BASE_ID}/${TEAM_TABLE_ID}`)
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('returnFieldsByFieldId', 'true')
    if (offset) url.searchParams.set('offset', offset)
    const res = await fetch(url.toString(), { headers: authHeader(), cache: 'no-store' })
    if (!res.ok) throw new Error(`Team fetch failed: ${res.status}`)
    const json = (await res.json()) as { records: { id: string; fields: Record<string, unknown> }[]; offset?: string }
    for (const r of json.records) {
      const name = String(r.fields[TEAM_NAME] || '').trim()
      const collab = r.fields[TEAM_COLLAB] as { id?: string } | undefined
      if (name) members.push({ recordId: r.id, name, collabId: collab?.id })
    }
    offset = json.offset
  } while (offset)
  teamCache = { members, ts: now }
  return members
}

const norm = (s: string) => s.trim().toLowerCase()

/** Match the app session name to a team record (exact, then first-token). */
export async function resolveTeamMember(sessionName: string): Promise<TeamMember | null> {
  if (!sessionName) return null
  const team = await fetchTeam()
  const want = norm(sessionName)
  const exact = team.find((m) => norm(m.name) === want)
  if (exact) return exact
  // Fallback: first name / contains either direction.
  const firstToken = want.split(/\s+/)[0]
  return (
    team.find((m) => norm(m.name).startsWith(firstToken)) ||
    team.find((m) => norm(m.name).includes(want) || want.includes(norm(m.name))) ||
    null
  )
}

// ── CRUD ──

type RawRecord = { id: string; fields: Record<string, unknown> }

export interface TimeLogEntry {
  id: string
  date: string
  durationSeconds: number
  timeRange?: string
  projetId?: string
  description?: string
}

function mapEntry(r: RawRecord): TimeLogEntry {
  const f = r.fields
  const tr = f[F.timeRange] as { name?: string } | string | undefined
  return {
    id: r.id,
    date: String(f[F.date] || ''),
    durationSeconds: typeof f[F.duration] === 'number' ? (f[F.duration] as number) : 0,
    timeRange: typeof tr === 'object' ? tr?.name : (tr as string | undefined),
    projetId: (f[F.projets] as string[] | undefined)?.[0],
    description: (f[F.description] as string | undefined) || undefined,
  }
}

/** List a member's logs within [from, to] inclusive (YYYY-MM-DD). */
export async function listTimeLogs(member: TeamMember, from: string, to: string): Promise<TimeLogEntry[]> {
  const name = member.name.replace(/"/g, '\\"')
  const formula = `AND({User}="${name}",IS_AFTER({Date},DATEADD(DATETIME_PARSE("${from}","YYYY-MM-DD"),-1,'days')),IS_BEFORE({Date},DATEADD(DATETIME_PARSE("${to}","YYYY-MM-DD"),1,'days')))`
  const entries: TimeLogEntry[] = []
  let offset: string | undefined
  do {
    const url = new URL(`${API_BASE}/${TIMELOG_BASE_ID}/${TIMELOG_TABLE_ID}`)
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('returnFieldsByFieldId', 'true')
    url.searchParams.set('filterByFormula', formula)
    if (offset) url.searchParams.set('offset', offset)
    const res = await fetch(url.toString(), { headers: authHeader(), cache: 'no-store' })
    if (!res.ok) throw new Error(`Time log fetch failed: ${res.status} ${await res.text()}`)
    const json = (await res.json()) as { records: RawRecord[]; offset?: string }
    for (const r of json.records) entries.push(mapEntry(r))
    offset = json.offset
  } while (offset)
  return entries
}

function buildFields(member: TeamMember, input: {
  date?: string
  durationSeconds?: number
  projetId?: string | null
  description?: string | null
}): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (input.date !== undefined) fields[F.date] = input.date
  if (input.durationSeconds !== undefined) {
    fields[F.duration] = input.durationSeconds
    fields[F.timeRange] = labelForSeconds(input.durationSeconds)
  }
  if (input.projetId !== undefined) fields[F.projets] = input.projetId ? [input.projetId] : []
  if (input.description !== undefined) fields[F.description] = input.description || ''
  return fields
}

export async function createTimeLog(member: TeamMember, input: {
  date: string
  durationSeconds: number
  projetId?: string | null
  description?: string | null
}): Promise<TimeLogEntry> {
  const fields = buildFields(member, input)
  fields[F.users] = [member.recordId]
  if (member.collabId) fields[F.user] = { id: member.collabId }
  const res = await fetch(`${API_BASE}/${TIMELOG_BASE_ID}/${TIMELOG_TABLE_ID}`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true, returnFieldsByFieldId: true }),
  })
  if (!res.ok) throw new Error(`Create time log failed: ${res.status} ${await res.text()}`)
  return mapEntry((await res.json()) as RawRecord)
}

export async function updateTimeLog(member: TeamMember, id: string, input: {
  date?: string
  durationSeconds?: number
  projetId?: string | null
  description?: string | null
}): Promise<TimeLogEntry> {
  const fields = buildFields(member, input)
  const res = await fetch(`${API_BASE}/${TIMELOG_BASE_ID}/${TIMELOG_TABLE_ID}/${id}`, {
    method: 'PATCH',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true, returnFieldsByFieldId: true }),
  })
  if (!res.ok) throw new Error(`Update time log failed: ${res.status} ${await res.text()}`)
  return mapEntry((await res.json()) as RawRecord)
}

export async function deleteTimeLog(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${TIMELOG_BASE_ID}/${TIMELOG_TABLE_ID}/${id}`, {
    method: 'DELETE',
    headers: authHeader(),
  })
  if (!res.ok) throw new Error(`Delete time log failed: ${res.status}`)
}
