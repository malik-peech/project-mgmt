import { NextResponse } from 'next/server'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'

const TMP_DIR = '/tmp/pm-uploads'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Sanitize - only allow UUID-like filenames
    if (!/^[a-z0-9-]+\.[a-z0-9]+$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 })
    }

    const filePath = join(TMP_DIR, id)
    const data = await readFile(filePath)

    // Determine content type from extension
    const ext = id.split('.').pop()?.toLowerCase()
    const contentTypes: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }

    // Delete after serving (one-time use)
    unlink(filePath).catch(() => {})

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentTypes[ext || ''] || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${id}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
