import { NextResponse } from 'next/server'
import { upsertRecord } from '@/lib/store'
import { TABLES } from '@/lib/airtable'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
const PROJETS_TABLE_ID = 'tbl0Pij0JqZFD9Ijr'
const TMP_DIR = '/tmp/pm-uploads'

/**
 * Upload a file to Airtable's "Devis signé" attachment field on a Projet record.
 * Mirrors /api/cogs/[id]/upload but for the projets "Devis signé" field.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
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

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    await mkdir(TMP_DIR, { recursive: true })

    // Fetch existing attachments to preserve them
    const getRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJETS_TABLE_ID}/${recordId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )

    let existingAttachments: { id?: string; url: string; filename?: string }[] = []
    if (getRes.ok) {
      const record = await getRes.json()
      existingAttachments = (record.fields?.['Devis signé'] as { id?: string; url: string; filename?: string }[]) || []
    }

    const newAttachments: { url: string; filename: string }[] = []
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const tmpFilename = `${randomUUID()}.${ext}`
      const tmpPath = join(TMP_DIR, tmpFilename)
      await writeFile(tmpPath, buffer)
      const publicUrl = `${baseUrl}/api/tmp/${tmpFilename}`
      newAttachments.push({ url: publicUrl, filename: file.name })
    }

    await new Promise((r) => setTimeout(r, 500))

    const patchAttachments = [
      ...existingAttachments.filter((a) => a.id).map((a) => ({ id: a.id })),
      ...newAttachments,
    ]

    const updateRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJETS_TABLE_ID}/${recordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: { 'Devis signé': patchAttachments } }),
      }
    )

    if (!updateRes.ok) {
      const err = await updateRes.text()
      console.error('[Devis upload] Airtable error:', updateRes.status, err)
      return NextResponse.json({ error: `Upload failed: ${err}` }, { status: updateRes.status })
    }

    let updatedFields: Record<string, unknown> | null = null
    try {
      const updated = await updateRes.json()
      updatedFields = updated.fields
      upsertRecord(TABLES.PROJETS, { id: updated.id, fields: updated.fields })
    } catch (e) {
      console.error('[Devis upload] failed to parse response:', e)
    }

    return NextResponse.json({ ok: true, count: newAttachments.length, fields: updatedFields })
  } catch (error) {
    console.error('Error uploading devis signé:', error)
    return NextResponse.json({ error: 'Failed to upload' }, { status: 500 })
  }
}

/**
 * DELETE /api/onboarding/[id]/upload?attachmentId=xxx
 * Remove a single attachment from the Devis signé field.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recordId } = await params
    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AIRTABLE_API_KEY not set' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const attachmentId = searchParams.get('attachmentId')
    const attachmentUrl = searchParams.get('attachmentUrl')
    if (!attachmentId && !attachmentUrl) {
      return NextResponse.json({ error: 'attachmentId or attachmentUrl required' }, { status: 400 })
    }

    const getRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJETS_TABLE_ID}/${recordId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!getRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch record' }, { status: 500 })
    }
    const record = await getRes.json()
    const existing = (record.fields?.['Devis signé'] as { id: string; url?: string }[]) || []
    const filtered = existing
      .filter((a) => (attachmentId ? a.id !== attachmentId : a.url !== attachmentUrl))
      .map((a) => ({ id: a.id }))

    const updateRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJETS_TABLE_ID}/${recordId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'Devis signé': filtered } }),
      }
    )

    if (!updateRes.ok) {
      return NextResponse.json({ error: await updateRes.text() }, { status: updateRes.status })
    }

    const updated = await updateRes.json()
    upsertRecord(TABLES.PROJETS, { id: updated.id, fields: updated.fields })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting devis attachment:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
