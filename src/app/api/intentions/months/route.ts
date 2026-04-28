import { NextResponse } from 'next/server'
import { sanitize } from '@/lib/sanitize'
import { INTENTIONS_BASE_ID, INTENTIONS_MONTH_TABLE_ID } from '@/lib/intentions'

/**
 * GET /api/intentions/months
 * Returns the Month (Mois) options from the external Intentions base, used to
 * populate the "Month link" picker in the new-intention form.
 */
export async function GET() {
  try {
    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AIRTABLE_API_KEY not set' }, { status: 500 })
    }

    const records: { id: string; fields: Record<string, unknown> }[] = []
    let offset: string | undefined
    do {
      const qs = new URLSearchParams('fields[]=Name')
      if (offset) qs.set('offset', offset)
      const res = await fetch(
        `https://api.airtable.com/v0/${INTENTIONS_BASE_ID}/${INTENTIONS_MONTH_TABLE_ID}?${qs.toString()}`,
        { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' },
      )
      if (!res.ok) {
        return NextResponse.json({ error: await res.text() }, { status: res.status })
      }
      const data = await res.json()
      records.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    const months = records
      .map((r) => ({ id: r.id, name: String(r.fields['Name'] || '') }))
      .filter((m) => m.name)
      .sort((a, b) => b.name.localeCompare(a.name))

    return NextResponse.json(sanitize({ months }), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Error fetching intention months:', error)
    return NextResponse.json({ error: 'Failed to fetch months' }, { status: 500 })
  }
}
