import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { INTENTIONS_BASE_ID, INTENTIONS_TABLE_ID } from '@/lib/intentions'

const TMP_DIR = '/tmp/pm-uploads'
const FIELD_NAME = 'Pièces'

/**
 * POST /api/intentions/[id]/upload
 * Append uploaded files to the "Pièces" attachment field.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: recordId } = await params
    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AIRTABLE_API_KEY not set' }, { status: 500 })
    }

    const url = new URL(request.url)
    const baseUrl = process.env.NEXTAUTH_URL || `${url.protocol}//${url.host}`

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    await mkdir(TMP_DIR, { recursive: true })

    const getRes = await fetch(
      `https://api.airtable.com/v0/${INTENTIONS_BASE_ID}/${INTENTIONS_TABLE_ID}/${recordId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )
    let existing: { id?: string; url: string; filename?: string }[] = []
    if (getRes.ok) {
      const rec = await getRes.json()
      existing =
        (rec.fields?.[FIELD_NAME] as { id?: string; url: string; filename?: string }[]) || []
    }

    const newAttachments: { url: string; filename: string }[] = []
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer())
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const tmpName = `${randomUUID()}.${ext}`
      await writeFile(join(TMP_DIR, tmpName), buf)
      newAttachments.push({ url: `${baseUrl}/api/tmp/${tmpName}`, filename: file.name })
    }

    await new Promise((r) => setTimeout(r, 500))

    const patchAttachments = [
      ...existing.filter((a) => a.id).map((a) => ({ id: a.id })),
      ...newAttachments,
    ]

    const updateRes = await fetch(
      `https://api.airtable.com/v0/${INTENTIONS_BASE_ID}/${INTENTIONS_TABLE_ID}/${recordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: { [FIELD_NAME]: patchAttachments } }),
      },
    )
    if (!updateRes.ok) {
      const err = await updateRes.text()
      return NextResponse.json({ error: `Upload failed: ${err}` }, { status: updateRes.status })
    }
    const updated = await updateRes.json()
    return NextResponse.json({ ok: true, count: newAttachments.length, fields: updated.fields })
  } catch (error) {
    console.error('Error uploading intention attachment:', error)
    return NextResponse.json({ error: 'Failed to upload' }, { status: 500 })
  }
}

/**
 * DELETE /api/intentions/[id]/upload?attachmentId=xxx
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: recordId } = await params
    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AIRTABLE_API_KEY not set' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const attachmentId = searchParams.get('attachmentId')
    if (!attachmentId) {
      return NextResponse.json({ error: 'attachmentId required' }, { status: 400 })
    }

    const getRes = await fetch(
      `https://api.airtable.com/v0/${INTENTIONS_BASE_ID}/${INTENTIONS_TABLE_ID}/${recordId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )
    if (!getRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch record' }, { status: 500 })
    }
    const rec = await getRes.json()
    const existing = (rec.fields?.[FIELD_NAME] as { id: string }[]) || []
    const filtered = existing.filter((a) => a.id !== attachmentId).map((a) => ({ id: a.id }))

    const updateRes = await fetch(
      `https://api.airtable.com/v0/${INTENTIONS_BASE_ID}/${INTENTIONS_TABLE_ID}/${recordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: { [FIELD_NAME]: filtered } }),
      },
    )
    if (!updateRes.ok) {
      return NextResponse.json({ error: await updateRes.text() }, { status: updateRes.status })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting intention attachment:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
