import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { upsertRecord } from '@/lib/store'
import { TABLES } from '@/lib/airtable'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
const RESSOURCES_TABLE_ID = 'tblgwh9bP5Piz32SL'
const TMP_DIR = '/tmp/pm-uploads'

const ALLOWED_FIELDS = new Set(['RIB', 'Photo'])

/**
 * POST /api/ressources/[id]/upload — attach files to a resource's RIB or Photo
 * field (RH back-office). Same tmp-proxy pattern as COGS uploads.
 * FormData: files[], field ("RIB" | "Photo", default "RIB").
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: recordId } = await params
    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AIRTABLE_API_KEY not set' }, { status: 500 })

    const url = new URL(request.url)
    const baseUrl = process.env.NEXTAUTH_URL || `${url.protocol}//${url.host}`

    const formData = await request.formData()
    const field = (formData.get('field') as string) || 'RIB'
    if (!ALLOWED_FIELDS.has(field)) {
      return NextResponse.json({ error: `Invalid field: ${field}` }, { status: 400 })
    }
    const files = formData.getAll('files') as File[]
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    await mkdir(TMP_DIR, { recursive: true })

    // Preserve existing attachments (reference by Airtable id)
    const getRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${RESSOURCES_TABLE_ID}/${recordId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    let existingAttachments: { id?: string; url: string }[] = []
    if (getRes.ok) {
      const record = await getRes.json()
      existingAttachments = (record.fields?.[field] as { id?: string; url: string }[]) || []
    }

    const newAttachments: { url: string; filename: string }[] = []
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const tmpFilename = `${randomUUID()}.${ext}`
      await writeFile(join(TMP_DIR, tmpFilename), buffer)
      newAttachments.push({ url: `${baseUrl}/api/tmp/${tmpFilename}`, filename: file.name })
    }

    await new Promise((r) => setTimeout(r, 500))

    const patchAttachments = [
      ...existingAttachments.filter((a) => a.id).map((a) => ({ id: a.id })),
      ...newAttachments,
    ]

    const updateRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${RESSOURCES_TABLE_ID}/${recordId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { [field]: patchAttachments } }),
      }
    )
    if (!updateRes.ok) {
      const err = await updateRes.text()
      console.error('[Ressource Upload] Airtable error:', updateRes.status, err)
      return NextResponse.json({ error: `Upload failed: ${err}` }, { status: updateRes.status })
    }

    let updatedFields: Record<string, unknown> | null = null
    try {
      const updated = await updateRes.json()
      updatedFields = updated.fields
      upsertRecord(TABLES.RESSOURCES, { id: updated.id, fields: updated.fields })
    } catch (e) {
      console.error('[Ressource Upload] failed to parse Airtable response:', e)
    }

    return NextResponse.json({ ok: true, count: newAttachments.length, fields: updatedFields })
  } catch (error) {
    console.error('Error uploading resource attachment:', error)
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
  }
}
