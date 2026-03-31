import { NextResponse } from 'next/server'
import { refreshTable } from '@/lib/store'
import { TABLES } from '@/lib/airtable'

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
const FIELD_NAME = 'Facture'

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

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Upload each file to Airtable Content API
    const results = []
    for (const file of files) {
      const fileFormData = new FormData()
      fileFormData.append('file', file, file.name)
      fileFormData.append('filename', file.name)
      fileFormData.append('contentType', file.type || 'application/octet-stream')

      const res = await fetch(
        `https://content.airtable.com/v0/${BASE_ID}/${recordId}/${FIELD_NAME}/uploadAttachment`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: fileFormData,
        }
      )

      if (!res.ok) {
        const err = await res.text()
        console.error('Airtable upload error:', err)
        return NextResponse.json({ error: `Upload failed: ${err}` }, { status: res.status })
      }

      const data = await res.json()
      results.push(data)
    }

    // Refresh store
    refreshTable(TABLES.COGS).catch(() => {})

    return NextResponse.json({ ok: true, count: results.length })
  } catch (error) {
    console.error('Error uploading attachment:', error)
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 })
  }
}
