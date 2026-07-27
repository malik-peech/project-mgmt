import { NextResponse } from 'next/server'
import { getAll } from '@/lib/airtable'
import { sanitize } from '@/lib/sanitize'

const FACTURES_TABLE_ID = 'tblW6wuEOQFvuh0aH'

function num(val: unknown): number | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return val
  if (typeof val === 'object') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

function str(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (Array.isArray(val)) return str(val[0])
  if (typeof val === 'object' && 'name' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).name)
  }
  return undefined
}

/**
 * GET /api/factures?ref=<Project réf>
 *
 * Read-only list of a project's invoices from the "Factures" table
 * (tblW6wuEOQFvuh0aH), matched via its linked "Projets" field (whose display
 * value is the Project réf). Not cached in the store — the table has 5000+ rows,
 * so we query Airtable directly, filtered to the one project.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const ref = (searchParams.get('ref') || '').trim()
    if (!ref) {
      return NextResponse.json({ error: 'ref param required' }, { status: 400 })
    }

    // Match the ref against the (possibly multi-value) linked Projets field.
    // Wrap both sides with commas so "190" doesn't match "1904".
    const safeRef = ref.replace(/"/g, '')
    const filterByFormula = `FIND(",${safeRef},", "," & ARRAYJOIN({Projets}, ",") & ",") > 0`

    const records = await getAll(FACTURES_TABLE_ID, {
      filterByFormula,
      fields: [
        'Numéro de facture',
        'Date de facturation',
        'Montant HT',
        'Montant TTC',
        'Solde dû (TTC)',
        'Règlement',
        'Numéro de commande - Facture',
        'Type de facture',
      ],
      // Most recent first.
      sort: [{ field: 'Date de facturation', direction: 'desc' }],
      maxRecords: 200,
    })

    const factures = records.map((r) => {
      const f = r.fields as Record<string, unknown>
      return {
        id: r.id,
        numero: str(f['Numéro de facture']),
        dateEmission: str(f['Date de facturation']),
        montantHT: num(f['Montant HT']),
        montantTTC: num(f['Montant TTC']),
        reglement: num(f['Règlement']),
        soldeDu: num(f['Solde dû (TTC)']),
        numeroBdc: str(f['Numéro de commande - Facture']),
        type: str(f['Type de facture']),
      }
    })

    const totals = {
      montantHT: factures.reduce((s, f) => s + (f.montantHT || 0), 0),
      montantTTC: factures.reduce((s, f) => s + (f.montantTTC || 0), 0),
      reglement: factures.reduce((s, f) => s + (f.reglement || 0), 0),
      soldeDu: factures.reduce((s, f) => s + (f.soldeDu || 0), 0),
    }

    return NextResponse.json(sanitize({ factures, totals, count: factures.length }), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Error fetching factures:', error)
    return NextResponse.json({ error: 'Failed to fetch factures' }, { status: 500 })
  }
}
