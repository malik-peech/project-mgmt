import { NextResponse } from 'next/server'

const baseId = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
const tableId = 'tbl9xr21gRYnG9XtC'
const apiKey = process.env.AIRTABLE_API_KEY || ''

const headers = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
}

const atUrl = `https://api.airtable.com/v0/${baseId}/${tableId}`

export interface FeedbackItem {
  id: string
  author: string
  category: 'bug' | 'feature' | 'feedback'
  message: string
  done: boolean
  createdAt: string
}

function mapRecord(rec: { id: string; fields: Record<string, unknown>; createdTime?: string }): FeedbackItem {
  const f = rec.fields
  return {
    id: rec.id,
    author: (f['User'] as string) || '',
    category: (['bug', 'feature', 'feedback'].includes((f['Type'] as string)?.toLowerCase?.() || '')
      ? (f['Type'] as string).toLowerCase()
      : 'feedback') as FeedbackItem['category'],
    message: (f['Description'] as string) || '',
    done: !!(f['Done']),
    createdAt: rec.createdTime || new Date().toISOString(),
  }
}

export async function GET() {
  try {
    const res = await fetch(`${atUrl}?sort%5B0%5D%5Bfield%5D=Created&sort%5B0%5D%5Bdirection%5D=desc&pageSize=100`, {
      headers,
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('Airtable GET feedback error:', res.status, await res.text())
      return NextResponse.json([])
    }
    const data = await res.json()
    const items = (data.records || []).map(mapRecord)
    // Sort by createdAt desc (fallback if Airtable sort doesn't work)
    items.sort((a: FeedbackItem, b: FeedbackItem) => b.createdAt.localeCompare(a.createdAt))
    return NextResponse.json(items)
  } catch (error) {
    console.error('Error fetching feedback:', error)
    return NextResponse.json([])
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (!body.message?.trim() || !body.author?.trim()) {
      return NextResponse.json({ error: 'Missing message or author' }, { status: 400 })
    }

    const category = ['Bug', 'Feature', 'Feedback'].find(
      (c) => c.toLowerCase() === body.category?.toLowerCase()
    ) || 'Feedback'

    const res = await fetch(atUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        records: [{
          fields: {
            Name: `${category} - ${body.author}`,
            User: body.author,
            Type: category,
            Description: body.message.trim(),
          },
        }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Airtable POST feedback error:', res.status, errText)
      return NextResponse.json({ error: 'Failed to create feedback' }, { status: 500 })
    }

    const data = await res.json()
    const item = mapRecord(data.records[0])
    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Error creating feedback:', error)
    return NextResponse.json({ error: 'Failed to create feedback' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    if (!body.id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const res = await fetch(atUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        records: [{
          id: body.id,
          fields: {
            Done: !!body.done,
          },
        }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Airtable PATCH feedback error:', res.status, errText)
      return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 })
    }

    const data = await res.json()
    const item = mapRecord(data.records[0])
    return NextResponse.json(item)
  } catch (error) {
    console.error('Error updating feedback:', error)
    return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 })
  }
}
