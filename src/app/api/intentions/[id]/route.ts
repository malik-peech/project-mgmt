import { NextResponse } from 'next/server'
import { INTENTIONS_BASE_ID, INTENTIONS_TABLE_ID } from '@/lib/intentions'

function atHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_API_KEY || ''}`,
    'Content-Type': 'application/json',
  }
}

/**
 * PATCH /api/intentions/[id]
 * Update any field on an intention.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const body = await request.json()
    const fields: Record<string, unknown> = {}

    if (body.client !== undefined) fields['Client'] = body.client || null
    if (body.projet !== undefined) fields['Projet'] = body.projet || null
    if (body.sales !== undefined) fields['Sales'] = body.sales || null
    if (body.statut !== undefined) fields['Statut'] = body.statut || null
    if (body.headcount !== undefined) fields['Headcount'] = body.headcount || null
    if (body.origine !== undefined) fields['Origine'] = body.origine || null
    if (body.contexte !== undefined) fields['Contexte'] = body.contexte || null
    if (body.monthIds !== undefined) {
      fields['Month link'] = Array.isArray(body.monthIds) ? body.monthIds : []
    }
    if (body.brief !== undefined) fields['Brief'] = body.brief || null
    if (body.budgetEstime !== undefined) {
      fields['Budget estimé'] =
        body.budgetEstime === null || body.budgetEstime === ''
          ? null
          : Number(body.budgetEstime)
    }
    if (body.deadline !== undefined) fields['Deadline'] = body.deadline || null
    if (body.clientOkPourCallBrief !== undefined) {
      fields['Client OK pour un call brief'] = !!body.clientOkPourCallBrief
    }
    if (body.clientOkPourPresentation !== undefined) {
      fields['Client OK pour une présentation'] = !!body.clientOkPourPresentation
    }
    if (body.budgetCommunique !== undefined) {
      fields['Budget communiqué par le client'] = !!body.budgetCommunique
    }
    if (body.onboardingOk !== undefined) {
      fields['Onboarding OK'] = !!body.onboardingOk
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const res = await fetch(
      `https://api.airtable.com/v0/${INTENTIONS_BASE_ID}/${INTENTIONS_TABLE_ID}/${id}`,
      {
        method: 'PATCH',
        headers: atHeaders(),
        body: JSON.stringify({ fields }),
      },
    )
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating intention:', error)
    const msg = error instanceof Error ? error.message : 'Failed to update'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * DELETE /api/intentions/[id]
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const res = await fetch(
      `https://api.airtable.com/v0/${INTENTIONS_BASE_ID}/${INTENTIONS_TABLE_ID}/${id}`,
      { method: 'DELETE', headers: atHeaders() },
    )
    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: res.status })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting intention:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
