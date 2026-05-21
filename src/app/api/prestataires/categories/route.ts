import { NextResponse } from 'next/server'
import { fetchPrestataireCategories } from '@/lib/prestataires'

export async function GET() {
  try {
    const items = await fetchPrestataireCategories()
    return NextResponse.json(items, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[prestataires/categories] fetch failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch categories' },
      { status: 500 },
    )
  }
}
