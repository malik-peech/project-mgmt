import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { upsertRecord } from '@/lib/store'
import { TABLES } from '@/lib/airtable'
import { findFactureTarget, paymentDateFor } from '@/lib/facture-lookup'
import { sendEmail } from '@/lib/email'

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appYFl5MvR7VeL0uB'
const COGS_TABLE_ID = 'tblnrqX6xNx5EWFsC'
const TMP_DIR = '/tmp/pm-uploads'

const fmtEur = (n?: number) =>
  n != null ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : '—'

/**
 * POST /api/facture/upload — public prestataire invoice drop.
 * FormData: email, numeroCommande, files[]. Re-validates the (email + commande)
 * match server-side (never trusts a client-supplied record id), attaches the
 * file(s) to the COGS "Facture" field, then emails a receipt confirmation.
 */
export async function POST(request: Request) {
  try {
    const apiKey = process.env.AIRTABLE_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'Configuration serveur manquante' }, { status: 500 })

    const url = new URL(request.url)
    const baseUrl = process.env.NEXTAUTH_URL || `${url.protocol}//${url.host}`

    const formData = await request.formData()
    const email = String(formData.get('email') || '')
    const numeroCommande = String(formData.get('numeroCommande') || '')
    const files = formData.getAll('files') as File[]

    if (!email || !numeroCommande) {
      return NextResponse.json({ ok: false, error: 'Email et numéro de commande requis' }, { status: 400 })
    }
    if (!files || files.length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucun fichier fourni' }, { status: 400 })
    }

    // Re-validate the match server-side.
    const target = await findFactureTarget(email, numeroCommande)
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Aucune commande ne correspond à ces informations' }, { status: 404 })
    }
    if (!target.eligible) {
      const msg = target.reason === 'has_facture'
        ? 'Une facture a déjà été déposée pour cette commande. Merci de vous rapprocher de votre chef de projet.'
        : 'Cette commande n\'accepte plus de dépôt de facture.'
      return NextResponse.json({ ok: false, error: msg }, { status: 409 })
    }

    await mkdir(TMP_DIR, { recursive: true })

    // Preserve existing attachments (reference by id)
    const getRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${COGS_TABLE_ID}/${target.cogId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    let existing: { id?: string; url: string }[] = []
    if (getRes.ok) {
      const rec = await getRes.json()
      existing = (rec.fields?.['Facture'] as { id?: string; url: string }[]) || []
    }

    const newAttachments: { url: string; filename: string }[] = []
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const tmpFilename = `${randomUUID()}.${ext}`
      await writeFile(join(TMP_DIR, tmpFilename), buffer)
      newAttachments.push({ url: `${baseUrl}/api/tmp/${tmpFilename}`, filename: file.name })
    }

    await new Promise((r) => setTimeout(r, 500))

    const patchAttachments = [
      ...existing.filter((a) => a.id).map((a) => ({ id: a.id })),
      ...newAttachments,
    ]

    const updateRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${COGS_TABLE_ID}/${target.cogId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'Facture': patchAttachments } }),
      }
    )
    if (!updateRes.ok) {
      const err = await updateRes.text()
      console.error('[facture/upload] Airtable error:', updateRes.status, err)
      return NextResponse.json({ ok: false, error: 'Échec de l\'enregistrement de la facture' }, { status: 502 })
    }

    try {
      const updated = await updateRes.json()
      upsertRecord(TABLES.COGS, { id: updated.id, fields: updated.fields })
    } catch { /* store refresh is best-effort */ }

    const { label: paymentLabel } = paymentDateFor(new Date())

    // Confirmation email (best-effort — never blocks the success response).
    const emailResult = await sendEmail({
      to: target.ressourceEmail,
      subject: `Facture bien reçue — commande ${target.numeroCommande}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:520px">
          <h2 style="color:#4f46e5;margin-bottom:4px">Facture bien reçue ✅</h2>
          <p>Bonjour ${target.ressourceName || ''},</p>
          <p>Nous confirmons la bonne réception de votre facture pour la commande
             <strong>${target.numeroCommande}</strong>${target.projetRef ? ` (projet ${target.projetRef})` : ''}.</p>
          <p>Montant attendu&nbsp;: <strong>${fmtEur(target.montantHT)} HT</strong></p>
          <p>Le paiement sera effectué le <strong>${paymentLabel}</strong>.</p>
          <p style="color:#6b7280;font-size:13px;margin-top:24px">
            Merci de vérifier que vos coordonnées bancaires transmises sont à jour.<br/>
            Peech Studio
          </p>
        </div>`,
    })

    return NextResponse.json({
      ok: true,
      paymentLabel,
      montantHT: target.montantHT,
      emailSent: emailResult.sent,
    })
  } catch (error) {
    console.error('[facture/upload] error:', error)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
