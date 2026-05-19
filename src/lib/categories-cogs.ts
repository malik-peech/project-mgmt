type StoreLike = { categoriesCogs: { records: { id: string; fields: Record<string, unknown> }[] } }

const PRIMARY_FIELD_CANDIDATES = ['Catégorie', 'Categorie', 'Name', 'Nom', 'Title', 'Titre']

export function getCategoryName(fields: Record<string, unknown>): string | undefined {
  for (const k of PRIMARY_FIELD_CANDIDATES) {
    const v = fields[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  for (const v of Object.values(fields)) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

export function buildCategoriesCogsMaps(store: StoreLike): {
  idToName: Map<string, string>
  nameToId: Map<string, string>
} {
  const idToName = new Map<string, string>()
  const nameToId = new Map<string, string>()
  for (const r of store.categoriesCogs.records) {
    const name = getCategoryName(r.fields)
    if (!name) continue
    idToName.set(r.id, name)
    nameToId.set(name.toLowerCase(), r.id)
  }
  return { idToName, nameToId }
}

/** Resolve a stored COGS Catégorie raw value (record ID or legacy string) to a display name. */
export function resolveCategorieName(
  raw: unknown,
  idToName: Map<string, string>,
): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('rec') && trimmed.length === 17) {
    return idToName.get(trimmed) || trimmed
  }
  return trimmed
}

/** Resolve a user-supplied category name to a record ID for writing the link field. */
export function resolveCategorieId(
  name: string,
  nameToId: Map<string, string>,
): string | undefined {
  return nameToId.get(name.trim().toLowerCase())
}
