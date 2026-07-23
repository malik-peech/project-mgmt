import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { TABLES } from '@/lib/airtable'
import { ensureStore, upsertRecord } from '@/lib/store'
import {
  findSourceRecordIdByNumericId,
  patchPrestataire,
  getPrestataireAttachments,
} from '@/lib/prestataires'

const TMP_DIR = '/tmp/pm-uploads'
const ALLOWED_FIELDS = new Set(['RIB', 'Photo'])

/**
 * POST /api/ressources/[id]/upload — attach files to a resource's RIB or Photo
 * field (RH back-office). Writes to the SOURCE Prestataires base (the main-base
 * Ressources table is a read-only sync). FormData: files[], field ("RIB"|"Photo").
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: mirrorId } = await params
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

    const store = await ensureStore()
    const mirror = store.ressources.byId.get(mirrorId)
    if (!mirror) return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 })
    const numId = Number(mirror.fields['ID'])
    if (!Number.isFinite(numId)) {
      return NextResponse.json({ error: 'ID source manquant sur cette ressource' }, { status: 422 })
    }
    const sourceId = await findSourceRecordIdByNumericId(numId)
    if (!sourceId) return NextResponse.json({ error: 'Enregistrement source introuvable' }, { status: 404 })

    await mkdir(TMP_DIR, { recursive: true })

    const existing = await getPrestataireAttachments(sourceId, field)
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
      ...existing.filter((a) => a.id).map((a) => ({ id: a.id! })),
      ...newAttachments,
    ]

    const updated = await patchPrestataire(sourceId, { [field]: patchAttachments })

    // Optimistic mirror-store update for immediate UI feedback.
    const cleaned = { ...mirror.fields, [field]: updated.fields[field] }
    upsertRecord(TABLES.RESSOURCES, { id: mirrorId, fields: cleaned })

    return NextResponse.json({ ok: true, count: newAttachments.length })
  } catch (error) {
    console.error('Error uploading resource attachment:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to upload attachment' }, { status: 500 })
  }
}
