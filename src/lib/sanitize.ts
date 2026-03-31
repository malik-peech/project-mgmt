/**
 * Recursively sanitize data before sending as JSON response.
 *
 * Airtable formula/rollup/lookup fields sometimes return objects like:
 *   { specialValue: NaN }
 *   { specialValue: null }
 *   { specialValue: "..." }
 *
 * When React tries to render these as children, it throws error #31:
 * "Objects are not valid as a React child"
 *
 * This function recursively walks any data structure and replaces
 * non-serializable objects with null.
 */

export function sanitize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_key, value) => {
    // Null/undefined pass through
    if (value == null) return value

    // Primitives pass through
    if (typeof value !== 'object') return value

    // Arrays: recurse (handled by JSON.stringify)
    if (Array.isArray(value)) return value

    // Date objects → ISO string
    if (value instanceof Date) return value.toISOString()

    // Airtable {specialValue: ...} objects → null
    if ('specialValue' in value) return null

    // Airtable {error: ...} objects → null
    if ('error' in value && Object.keys(value).length <= 2) return null

    // Normal objects: recurse (handled by JSON.stringify)
    return value
  }))
}
