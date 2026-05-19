import { NextResponse } from 'next/server'
import { ensureStore } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import { getCategoryName } from '@/lib/categories-cogs'

export async function GET() {
  try {
    const store = await ensureStore()
    const names: string[] = []
    for (const r of store.categoriesCogs.records) {
      const name = getCategoryName(r.fields)
      if (name) names.push(name)
    }
    names.sort((a, b) => a.localeCompare(b, 'fr'))
    return NextResponse.json(sanitize(names), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Error fetching categories COGS:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}
