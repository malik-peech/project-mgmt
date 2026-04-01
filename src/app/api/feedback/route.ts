import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const DATA_DIR = join('/tmp', 'peechpm-data')
const FILE = join(DATA_DIR, 'feedback.json')

export interface FeedbackItem {
  id: string
  author: string
  category: 'bug' | 'feature' | 'feedback'
  message: string
  done: boolean
  createdAt: string
}

async function readAll(): Promise<FeedbackItem[]> {
  try {
    const raw = await readFile(FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function writeAll(items: FeedbackItem[]) {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(FILE, JSON.stringify(items, null, 2))
}

export async function GET() {
  const items = await readAll()
  // Most recent first
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return NextResponse.json(items)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (!body.message?.trim() || !body.author?.trim()) {
      return NextResponse.json({ error: 'Missing message or author' }, { status: 400 })
    }

    const item: FeedbackItem = {
      id: randomUUID(),
      author: body.author,
      category: ['bug', 'feature', 'feedback'].includes(body.category) ? body.category : 'feedback',
      message: body.message.trim(),
      done: false,
      createdAt: new Date().toISOString(),
    }

    const items = await readAll()
    items.push(item)
    await writeAll(items)

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

    const items = await readAll()
    const item = items.find((i) => i.id === body.id)
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (body.done !== undefined) item.done = body.done

    await writeAll(items)
    return NextResponse.json(item)
  } catch (error) {
    console.error('Error updating feedback:', error)
    return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 })
  }
}
