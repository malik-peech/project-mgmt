import { NextResponse } from 'next/server'

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
const PROJETS_TABLE_ID = 'tbl0Pij0JqZFD9Ijr'

type AirtableComment = {
  id: string
  text: string
  createdTime: string
  lastUpdatedTime?: string
  author?: { id?: string; name?: string; email?: string }
}

/**
 * GET comments for a Projet record via Airtable Comments API.
 * https://airtable.com/developers/web/api/list-comments
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AIRTABLE_API_KEY not set' }, { status: 500 })

    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJETS_TABLE_ID}/${id}/comments?pageSize=100`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' },
    )
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }
    const data = (await res.json()) as { comments: AirtableComment[] }
    // Return oldest-first so the UI can append new comments at the bottom.
    const comments = [...(data.comments || [])].sort(
      (a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime(),
    )
    return NextResponse.json({ comments })
  } catch (error) {
    console.error('Error fetching comments:', error)
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
  }
}

/**
 * POST a new comment on a Projet record.
 * Body: { text: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AIRTABLE_API_KEY not set' }, { status: 500 })

    const body = await request.json()
    const text = (body?.text ?? '').toString().trim()
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJETS_TABLE_ID}/${id}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      },
    )
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }
    const comment = (await res.json()) as AirtableComment
    return NextResponse.json({ comment })
  } catch (error) {
    console.error('Error creating comment:', error)
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}
