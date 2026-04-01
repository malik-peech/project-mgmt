import { readFile, unlink, stat } from 'fs/promises'
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
      return new Response('Invalid file ID', { status: 400 })
    }

    const filePath = join(TMP_DIR, id)
    const data = await readFile(filePath)

    // Determine content type from extension
    const ext = id.split('.').pop()?.toLowerCase() || ''
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

    // Schedule cleanup after 5 minutes (let Airtable finish downloading)
    setTimeout(() => {
      unlink(filePath).catch(() => {})
    }, 5 * 60 * 1000)

    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        'Content-Length': String(data.length),
        'Cache-Control': 'no-cache',
      },
    })
  } catch {
    return new Response('File not found', { status: 404 })
  }
}
