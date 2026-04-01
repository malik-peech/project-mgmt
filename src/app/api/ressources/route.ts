import { NextResponse } from 'next/server'
import { createRecord, TABLES } from '@/lib/airtable'
import { ensureStore, refreshTable } from '@/lib/store'
import { sanitize } from '@/lib/sanitize'
import type { Ressource } from '@/types'

export async function GET() {
  try {
    const store = await ensureStore()

    const ressources: Ressource[] = []

    for (const r of store.ressources.records) {
      const f = r.fields

      // Skip blacklisted
      if (f['Blacklist']) continue

      ressources.push({
        id: r.id,
        name: (f['Name'] as string) || '',
        email: f['Email'] as string | undefined,
        categorie: f['Catégorie'] as string[] | undefined,
        statut: f['Statut'] as string | undefined,
        telephone: f['Téléphone'] as string | undefined,
        description: f['Description'] as string | undefined,
        iban: f['IBAN'] as string | undefined,
        photo: Array.isArray(f['Photo'])
          ? (f['Photo'] as { url: string; filename: string }[]).map((a) => ({ url: a.url, filename: a.filename }))
          : undefined,
      })
    }

    // Sort by name
    ressources.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json(sanitize(ressources))
  } catch (error) {
    console.error('Error fetching ressources:', error)
    return NextResponse.json({ error: 'Failed to fetch ressources' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const fields: Record<string, unknown> = {
      'Name': body.name,
    }
    if (body.email) fields['Email'] = body.email
    if (body.categorie) fields['Catégorie'] = body.categorie
    if (body.telephone) fields['Téléphone'] = body.telephone

    const record = await createRecord(TABLES.RESSOURCES, fields as any)

    // Refresh store in background
    refreshTable(TABLES.RESSOURCES).catch(() => {})

    return NextResponse.json({ id: record.id, name: body.name })
  } catch (error) {
    console.error('Error creating ressource:', error)
    return NextResponse.json({ error: 'Failed to create ressource' }, { status: 500 })
  }
}
