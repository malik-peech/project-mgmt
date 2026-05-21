'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Loader2, UploadCloud } from 'lucide-react'
import { useData } from '@/hooks/useData'

type Category = { id: string; name: string }
type Pref = 'Virement' | 'Paypal' | 'Paiement direct'

export default function AddPrestataireModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}) {
  const { data: categories } = useData<Category[]>(
    open ? '/api/prestataires/categories' : null,
    { key: 'prestataires-categories', enabled: open, staleTime: 600_000 },
  )

  const [name, setName] = useState('')
  const [preferencePaiement, setPreferencePaiement] = useState<Pref | ''>('')
  const [iban, setIban] = useState('')
  const [paypal, setPaypal] = useState('')
  const [instructionsPaiement, setInstructionsPaiement] = useState('')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [mainCategoryId, setMainCategoryId] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [ribFile, setRibFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement | null>(null)
  const ribRef = useRef<HTMLInputElement | null>(null)

  // Reset when the modal opens
  useEffect(() => {
    if (open) {
      setName('')
      setPreferencePaiement('')
      setIban('')
      setPaypal('')
      setInstructionsPaiement('')
      setTelephone('')
      setEmail('')
      setMainCategoryId('')
      setPhotoFile(null)
      setRibFile(null)
      setErrorMsg(null)
      setSubmitting(false)
    }
  }, [open])

  if (!open) return null

  const canSubmit = name.trim().length > 0 && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const fd = new FormData()
      fd.append('name', name)
      if (preferencePaiement) fd.append('preferencePaiement', preferencePaiement)
      if (preferencePaiement === 'Virement' && iban) fd.append('iban', iban)
      if (preferencePaiement === 'Paypal' && paypal) fd.append('paypal', paypal)
      if (instructionsPaiement) fd.append('instructionsPaiement', instructionsPaiement)
      if (telephone) fd.append('telephone', telephone)
      if (email) fd.append('email', email)
      if (mainCategoryId) fd.append('mainCategoryId', mainCategoryId)
      if (photoFile) fd.append('photo', photoFile)
      if (preferencePaiement === 'Virement' && ribFile) fd.append('rib', ribFile)

      const res = await fetch('/api/prestataires', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      onCreated?.()
      onClose()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">Ajouter une ressource</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <Field label="Nom" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Prénom Nom"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>

          {/* Main category */}
          <Field label="Main category">
            <select
              value={mainCategoryId}
              onChange={(e) => setMainCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">—</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@exemple.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </Field>
            <Field label="Téléphone">
              <input
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="+33…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </Field>
          </div>

          {/* Préférence de paiement */}
          <Field label="Préférence de paiement">
            <select
              value={preferencePaiement}
              onChange={(e) => setPreferencePaiement(e.target.value as Pref | '')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">—</option>
              <option value="Virement">Virement</option>
              <option value="Paypal">Paypal</option>
              <option value="Paiement direct">Paiement direct</option>
            </select>
          </Field>

          {/* Conditional: Virement → IBAN + RIB */}
          {preferencePaiement === 'Virement' && (
            <div className="space-y-3 pl-3 border-l-2 border-indigo-100">
              <Field label="IBAN">
                <input
                  type="text"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="FR76…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
              <Field label="RIB (fichier)">
                <FilePicker
                  inputRef={ribRef}
                  file={ribFile}
                  onPick={setRibFile}
                  accept="application/pdf,image/*"
                />
              </Field>
            </div>
          )}

          {/* Conditional: Paypal → email Paypal */}
          {preferencePaiement === 'Paypal' && (
            <div className="space-y-3 pl-3 border-l-2 border-indigo-100">
              <Field label="Paypal">
                <input
                  type="text"
                  value={paypal}
                  onChange={(e) => setPaypal(e.target.value)}
                  placeholder="email ou identifiant Paypal"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
            </div>
          )}

          {/* Instructions */}
          <Field label="Instructions spécifiques de paiement">
            <textarea
              value={instructionsPaiement}
              onChange={(e) => setInstructionsPaiement(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>

          {/* Photo */}
          <Field label="Photo">
            <FilePicker
              inputRef={photoRef}
              file={photoFile}
              onPick={setPhotoFile}
              accept="image/*"
            />
          </Field>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {errorMsg}
            </div>
          )}

          <p className="text-[11px] text-gray-400 leading-relaxed">
            La ressource sera créée avec le statut <span className="font-semibold">Validé</span>.
            Elle apparaîtra dans la liste après synchronisation Airtable (~quelques minutes).
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Créer
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function FilePicker({
  inputRef,
  file,
  onPick,
  accept,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  file: File | null
  onPick: (f: File | null) => void
  accept?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => onPick(e.target.files?.[0] || null)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition"
      >
        <UploadCloud className="w-3.5 h-3.5" />
        {file ? 'Changer' : 'Choisir un fichier'}
      </button>
      {file && (
        <span className="text-xs text-gray-600 truncate flex-1">{file.name}</span>
      )}
      {file && (
        <button
          type="button"
          onClick={() => onPick(null)}
          className="text-gray-400 hover:text-red-500 text-xs"
          title="Retirer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
