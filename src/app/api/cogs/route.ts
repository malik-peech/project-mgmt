import { NextResponse } from 'next/server'
import { getAll, createRecord, TABLES } from '@/lib/airtable'
import type { Cogs } from '@/types'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const pmFilter = searchParams.get('pm')
    const statutFilter = searchParams.get('statut')
    const projetId = searchParams.get('projetId')

    // Fetch resources for name resolution
    const resRecords = await getAll(TABLES.RESSOURCES)
    const resMap = new Map<string, string>()
    for (const r of resRecords) {
      resMap.set(r.id, (r.fields['Name'] as string) || '')
    }

    let formula = ''
    const conditions: string[] = []
    if (pmFilter) {
      conditions.push(`FIND('${pmFilter}', ARRAYJOIN({PM}))`)
    }
    if (statutFilter) {
      conditions.push(`{Statut de la dépense} = '${statutFilter}'`)
    }
    if (projetId) {
      conditions.push(`FIND('${projetId}', ARRAYJOIN(RECORD_ID({Projet})))`)
    }
    if (conditions.length > 0) {
      formula = conditions.length === 1 ? conditions[0] : `AND(${conditions.join(',')})`
    }

    const options: Record<string, unknown> = {
      sort: [{ field: 'Date de création', direction: 'desc' }],
    }
    if (formula) options.filterByFormula = formula

    const records = await getAll(TABLES.COGS, options as any)

    const cogs: Cogs[] = records.map((r) => {
      const f = r.fields
      const ressourceIds = f['Ressource'] as string[] | undefined
      const ressourceId = ressourceIds?.[0]
      return {
        id: r.id,
        numeroCommande: f['Numéro de commande'] as string | undefined,
        statut: f['Statut de la dépense'] as Cogs['statut'],
        projetId: (f['Projet'] as string[])?.[0],
        clientName: (f['Client'] as string[])?.[0],
        categorie: (f['Catégorie'] as string[])?.[0],
        ressourceId,
        ressourceName: ressourceId ? resMap.get(ressourceId) || '' : '',
        montantBudgeteSales: f['Montant HT budgété (sales)'] as number | undefined,
        montantEngageProd: f['Montant HT engagé (prod)'] as number | undefined,
        tva: f['TVA'] as number | undefined,
        montantTTC: f['Montant TTC'] as number | undefined,
        bdcEnvoye: !!f['BDC envoyé'],
        numeroFacture: f['Numéro de facture'] as string | undefined,
        commentaire: f['Commentaire COGS'] as string | undefined,
        pm: (f['PM'] as string[])?.[0],
        okPourPaiement: !!f['OK pour paiement'],
        methodePaiement: f['Méthode de paiement'] as string | undefined,
        createdAt: f['Date de création'] as string | undefined,
      }
    })

    return NextResponse.json(cogs)
  } catch (error) {
    console.error('Error fetching COGS:', error)
    return NextResponse.json({ error: 'Failed to fetch COGS' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const fields: Record<string, any> = {
      'Projet': body.projetId ? [body.projetId] : undefined,
      'Ressource': body.ressourceId ? [body.ressourceId] : undefined,
      'Montant HT engagé (prod)': body.montantEngageProd,
      'Statut de la dépense': body.statut || 'A Approuver (CDP)',
    }
    if (body.commentaire) fields['Commentaire COGS'] = body.commentaire

    Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k])

    const record = await createRecord(TABLES.COGS, fields)
    return NextResponse.json({ id: record.id })
  } catch (error) {
    console.error('Error creating COGS:', error)
    return NextResponse.json({ error: 'Failed to create COGS' }, { status: 500 })
  }
}
