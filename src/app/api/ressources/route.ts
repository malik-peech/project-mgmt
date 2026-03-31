import { NextResponse } from 'next/server'
import { getAll, createRecord, TABLES } from '@/lib/airtable'
import type { Ressource } from '@/types'

export async function GET() {
  try {
    const records = await getAll(TABLES.RESSOURCES, {
      filterByFormula: 'NOT({Blacklist})',
      sort: [{ field: 'Name', direction: 'asc' }],
    })

    const ressources: Ressource[] = records.map((r) => ({
      id: r.id,
      name: (r.fields['Name'] as string) || '',
      email: r.fields['Email'] as string | undefined,
      categorie: r.fields['Catégorie'] as string[] | undefined,
      statut: r.fields['Statut'] as string | undefined,
      telephone: r.fields['Téléphone'] as string | undefined,
    }))

    return NextResponse.json(ressources)
  } catch (error) {
    console.error('Error fetching ressources:', error)
    return NextResponse.json({ error: 'Failed to fetch ressources' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const fields: Record<string, any> = {
      'Name': body.name,
    }
    if (body.email) fields['Email'] = body.email
    if (body.categorie) fields['Catégorie'] = body.categorie
    if (body.telephone) fields['Téléphone'] = body.telephone

    const record = await createRecord(TABLES.RESSOURCES, fields)
    return NextResponse.json({ id: record.id, name: body.name })
  } catch (error) {
    console.error('Error creating ressource:', error)
    return NextResponse.json({ error: 'Failed to create ressource' }, { status: 500 })
  }
}
