import { NextResponse } from 'next/server'
import { refreshTable } from '@/lib/store'
import { TABLES } from '@/lib/airtable'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
const COGS_TABLE_ID = 'tblnrqX6xNx5EWFsC'
const TMP_DIR = '/tmp/pm-uploads'

/**
 * Upload a file to Airtable's "Facture" attachment field on a COGS record.
 *
 * Strategy:
 * 1. Save the uploaded file to /tmp with a UUID filename
 * 2. Build a public URL via our /api/tmp/[id] endpoint
 * 3. PATCH the Airtable record with that URL (Airtable downloads it)
 * 4. /api/tmp/[id] auto-deletes the file after serving it once
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

    // Determine public base URL
    const url = new URL(request.url)
    const baseUrl = process.env.NEXTAUTH_URL || `${url.protocol}//${url.host}`

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Ensure tmp directory exists
    await mkdir(TMP_DIR, { recursive: true })

    // Step 1: Fetch existing attachments to avoid overwriting them
    const getRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${COGS_TABLE_ID}/${recordId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )

    let existingAttachments: { id?: string; url: string; filename?: string }[] = []
    if (getRes.ok) {
      const record = await getRes.json()
      existingAttachments = (record.fields?.['Facture'] as any[]) || []
    }

    // Step 2: Save each file to /tmp and build Airtable attachment objects
    const newAttachments: { url: string; filename: string }[] = []

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Get extension from original filename
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const tmpFilename = `${randomUUID()}.${ext}`
      const tmpPath = join(TMP_DIR, tmpFilename)

      await writeFile(tmpPath, buffer)

      const publicUrl = `${baseUrl}/api/tmp/${tmpFilename}`
      newAttachments.push({ url: publicUrl, filename: file.name })
    }

    // Step 3: PATCH the record — Airtable will download from our URLs
    const updateRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${COGS_TABLE_ID}/${recordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            'Facture': [
              // Keep existing attachments (must reference by url)
              ...existingAttachments.map((a) => ({ url: a.url })),
              // Add new ones
              ...newAttachments,
            ],
          },
        }),
      }
    )

    if (!updateRes.ok) {
      const err = await updateRes.text()
      console.error('Airtable update error:', err)
      return NextResponse.json({ error: `Upload failed: ${err}` }, { status: updateRes.status })
    }

    // Refresh store
    refreshTable(TABLES.COGS).catch(() => {})

    return NextResponse.json({ ok: true, count: newAttachments.length })
  } catch (error) {
    console.error('Error uploading attachment:', error)
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
  }
}
