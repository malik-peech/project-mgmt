import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { createPrestataire, type CreatePrestataireInput } from '@/lib/prestataires'

const TMP_DIR = '/tmp/pm-uploads'

type Attachment = { url: string; filename: string }

/**
 * Stage a file in /tmp and return a publicly accessible URL (via /api/tmp/[id])
 * that Airtable's API will pull from when ingesting the attachment.
 */
async function stageFile(file: File, baseUrl: string): Promise<Attachment> {
  await mkdir(TMP_DIR, { recursive: true })
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const tmpFilename = `${randomUUID()}.${ext}`
  const tmpPath = join(TMP_DIR, tmpFilename)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(tmpPath, buffer)
  return { url: `${baseUrl}/api/tmp/${tmpFilename}`, filename: file.name }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    const baseUrl = process.env.NEXTAUTH_URL || `${url.protocol}//${url.host}`

    const fd = await request.formData()

    const name = String(fd.get('name') || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const preferencePaiementRaw = String(fd.get('preferencePaiement') || '').trim()
    const allowedPrefs = ['Virement', 'Paypal', 'Paiement direct'] as const
    type Pref = (typeof allowedPrefs)[number]
    const preferencePaiement: Pref | undefined = (allowedPrefs as readonly string[]).includes(
      preferencePaiementRaw,
    )
      ? (preferencePaiementRaw as Pref)
      : undefined

    // Stage attachments before sending to Airtable (Airtable will pull the URLs).
    const photoFiles = fd.getAll('photo').filter((f): f is File => f instanceof File && f.size > 0)
    const ribFiles = fd.getAll('rib').filter((f): f is File => f instanceof File && f.size > 0)

    const photoAttachments: Attachment[] = []
    for (const f of photoFiles) photoAttachments.push(await stageFile(f, baseUrl))

    const ribAttachments: Attachment[] = []
    if (preferencePaiement === 'Virement') {
      for (const f of ribFiles) ribAttachments.push(await stageFile(f, baseUrl))
    }

    // Small delay so the /tmp proxy is reachable when Airtable fetches.
    if (photoAttachments.length || ribAttachments.length) {
      await new Promise((r) => setTimeout(r, 500))
    }

    const input: CreatePrestataireInput = {
      name,
      preferencePaiement,
      iban: preferencePaiement === 'Virement' ? String(fd.get('iban') || '').trim() || undefined : undefined,
      ribAttachments: ribAttachments.length ? ribAttachments : undefined,
      paypal: preferencePaiement === 'Paypal' ? String(fd.get('paypal') || '').trim() || undefined : undefined,
      instructionsPaiement: String(fd.get('instructionsPaiement') || '').trim() || undefined,
      telephone: String(fd.get('telephone') || '').trim() || undefined,
      email: String(fd.get('email') || '').trim() || undefined,
      mainCategoryId: String(fd.get('mainCategoryId') || '').trim() || undefined,
      photoAttachments: photoAttachments.length ? photoAttachments : undefined,
    }

    const { id } = await createPrestataire(input)
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('[prestataires POST] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create prestataire' },
      { status: 500 },
    )
  }
}
