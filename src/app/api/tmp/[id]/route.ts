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

    const contentType = contentTypes[ext] || 'application/octet-stream'

    // Schedule cleanup after 10 minutes (give Airtable plenty of time)
    setTimeout(() => {
      unlink(filePath).catch(() => {})
    }, 10 * 60 * 1000)

    // Return raw binary with explicit Uint8Array to avoid any Buffer encoding issues
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(data.length),
        'Content-Disposition': `inline; filename="${id}"`,
        'Cache-Control': 'no-cache, no-store',
      },
    })
  } catch {
    return new Response('File not found', { status: 404 })
  }
}
