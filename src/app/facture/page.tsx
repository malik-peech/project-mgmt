'use client'

import { useState, useRef } from 'react'
import { FileText, UploadCloud, CheckCircle2, Loader2, AlertTriangle, CreditCard, X } from 'lucide-react'

type LookupResult = {
  found: boolean
  eligible?: boolean
  reason?: 'paid' | 'cancelled'
  numeroCommande?: string
  montantHT?: number
  ressourceName?: string
  projetRef?: string
  projetName?: string
  iban?: string
  paypal?: string
  instructionsPaiement?: string
  hasFacture?: boolean
  paymentLabel?: string
}

const fmtEur = (n?: number) =>
  n != null ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : '—'

export default function FactureDropPage() {
  const [step, setStep] = useState<'lookup' | 'drop' | 'done'>('lookup')
  const [email, setEmail] = useState('')
  const [numeroCommande, setNumeroCommande] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LookupResult | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [confirmBank, setConfirmBank] = useState(false)
  const [confirmAmount, setConfirmAmount] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [doneInfo, setDoneInfo] = useState<{ paymentLabel?: string; emailSent?: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const doLookup = async () => {
    if (!email.trim() || !numeroCommande.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/facture/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), numeroCommande: numeroCommande.trim() }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'Erreur'); return }
      if (!data.found) {
        setError("Aucune commande ne correspond à cet email et ce numéro de commande. Vérifiez vos informations.")
        return
      }
      if (!data.eligible) {
        setError(
          data.reason === 'paid'
            ? "Cette commande a déjà été payée — aucun dépôt supplémentaire n'est nécessaire."
            : data.reason === 'cancelled'
              ? "Cette commande a été annulée et n'accepte pas de facture."
              : data.reason === 'has_facture'
                ? "Une facture a déjà été déposée pour cette commande. Merci de vous rapprocher de votre chef de projet."
                : "Cette commande n'accepte pas de dépôt de facture.")
        return
      }
      setResult(data as LookupResult)
      setStep('drop')
    } catch {
      setError('Erreur de connexion. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  const submitFacture = async () => {
    if (!file || !confirmBank || !confirmAmount) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('email', email.trim())
      fd.append('numeroCommande', numeroCommande.trim())
      fd.append('files', file, file.name)
      const res = await fetch('/api/facture/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'Échec du dépôt'); return }
      setDoneInfo({ paymentLabel: data.paymentLabel, emailSent: data.emailSent })
      setStep('done')
    } catch {
      setError('Erreur de connexion. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  const bankReminder = result && (result.iban || result.paypal || result.instructionsPaiement)

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-3">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Dépôt de facture</h1>
          <p className="text-sm text-gray-500 mt-1">Peech Studio — espace prestataires</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
          {/* STEP 1 — lookup */}
          {step === 'lookup' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Renseignez l'email associé à votre fiche et le numéro de commande (BDC) reçu pour accéder au dépôt de votre facture.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Numéro de commande</label>
                <input
                  type="text"
                  value={numeroCommande}
                  onChange={(e) => setNumeroCommande(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') doLookup() }}
                  placeholder="ex : 4521"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {error && <ErrorBox message={error} />}
              <button
                onClick={doLookup}
                disabled={loading || !email.trim() || !numeroCommande.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Accéder au dépôt
              </button>
            </div>
          )}

          {/* STEP 2 — drop */}
          {step === 'drop' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">Facture prête à être reçue</span>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5">
                <Row label="Commande" value={result.numeroCommande} />
                {(result.projetRef || result.projetName) && (
                  <Row label="Projet" value={[result.projetRef, result.projetName].filter(Boolean).join(' · ')} />
                )}
                <Row label="Montant indiqué" value={`${fmtEur(result.montantHT)} HT`} strong />
              </div>

              {/* Bank reminder */}
              {bankReminder && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-2">
                    <CreditCard className="w-3.5 h-3.5" /> Vos coordonnées bancaires
                  </p>
                  <div className="text-sm text-gray-700 space-y-1">
                    {result.iban && <div><span className="text-gray-500">IBAN :</span> <span className="font-mono break-all">{result.iban}</span></div>}
                    {result.paypal && <div><span className="text-gray-500">Paypal :</span> {result.paypal}</div>}
                    {result.instructionsPaiement && <div className="text-gray-600 whitespace-pre-wrap">{result.instructionsPaiement}</div>}
                  </div>
                </div>
              )}

              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false)
                  const f = e.dataTransfer.files?.[0]; if (f) setFile(f)
                }}
                className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
                  dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
                }`}
              >
                <input ref={fileRef} type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    <span className="truncate max-w-[240px]">{file.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setFile(null) }} className="text-gray-400 hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <UploadCloud className="w-7 h-7 mx-auto mb-1.5" />
                    <p className="text-sm">Glissez votre facture ici ou cliquez pour choisir</p>
                    <p className="text-[11px] mt-0.5">PDF ou image</p>
                  </div>
                )}
              </div>

              {/* Payment info */}
              <p className="text-sm text-gray-600 bg-indigo-50 rounded-lg px-3 py-2">
                💶 Le paiement sera effectué le <strong>{result.paymentLabel}</strong> (le 15 du mois suivant le dépôt).
              </p>

              {/* Confirmations */}
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={confirmBank} onChange={(e) => setConfirmBank(e.target.checked)} className="w-4 h-4 mt-0.5 rounded shrink-0" />
                  Je confirme que mes coordonnées bancaires ci-dessus sont correctes.
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={confirmAmount} onChange={(e) => setConfirmAmount(e.target.checked)} className="w-4 h-4 mt-0.5 rounded shrink-0" />
                  Je confirme que le montant de ma facture correspond au montant indiqué ({fmtEur(result.montantHT)} HT).
                </label>
              </div>

              {error && <ErrorBox message={error} />}

              <button
                onClick={submitFacture}
                disabled={loading || !file || !confirmBank || !confirmAmount}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Valider l'envoi de la facture
              </button>
            </div>
          )}

          {/* STEP 3 — done */}
          {step === 'done' && (
            <div className="text-center py-4 space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-1">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Facture bien reçue !</h2>
              <p className="text-sm text-gray-600">
                Votre facture a été enregistrée. Le paiement sera effectué le <strong>{doneInfo?.paymentLabel}</strong>.
              </p>
              {doneInfo?.emailSent
                ? <p className="text-xs text-gray-400">Un email de confirmation vous a été envoyé.</p>
                : <p className="text-xs text-gray-400">Confirmation enregistrée.</p>}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">Peech Studio · Un problème ? Contactez votre interlocuteur Peech.</p>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right ${strong ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{value || '—'}</span>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
