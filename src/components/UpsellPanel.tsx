'use client'

import { useEffect, useState, useRef } from 'react'
import { X, CheckCircle2, Upload, Loader2, Paperclip, Trash2 } from 'lucide-react'
import type { Upsell, Attachment } from '@/types'

interface Props {
  upsell: Upsell
  onClose: () => void
  onSaved: (updated: Upsell) => void
}

function formatMontant(montant?: number, currency?: string) {
  if (montant == null) return null
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 0,
    }).format(montant)
  } catch {
    return `${montant} ${currency || '€'}`
  }
}

export default function UpsellPanel({ upsell, onClose, onSaved }: Props) {
  const [numBdc, setNumBdc] = useState(upsell.numBdc || '')
  const [pasDeBdc, setPasDeBdc] = useState(!!upsell.pasDeBdc)
  const [files, setFiles] = useState<Attachment[]>(upsell.devisBdc || [])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNumBdc(upsell.numBdc || '')
    setPasDeBdc(!!upsell.pasDeBdc)
    setFiles(upsell.devisBdc || [])
  }, [upsell.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    try {
      const fd = new FormData()
      for (const f of Array.from(fileList)) fd.append('files', f)
      const res = await fetch(`/api/upsells/${upsell.id}/upload`, { method: 'POST', body: fd })
      if (res.ok) {
        const json = await res.json()
        const updated = (json.fields?.['Devis / BDC Upsell'] as Attachment[]) || []
        setFiles(updated)
      } else {
        alert(`Erreur upload: ${await res.text()}`)
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const deleteAttachment = async (att: Attachment & { id?: string }) => {
    const qs = att.id ? `attachmentId=${att.id}` : `attachmentUrl=${encodeURIComponent(att.url)}`
    const res = await fetch(`/api/upsells/${upsell.id}/upload?${qs}`, { method: 'DELETE' })
    if (res.ok) setFiles((curr) => curr.filter((a) => a.url !== att.url))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/upsells/${upsell.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numBdc: numBdc.trim() || null, pasDeBdc }),
      })
      if (res.ok) {
        const isDone = !!numBdc.trim() || pasDeBdc
        onSaved({ ...upsell, numBdc: numBdc.trim(), pasDeBdc, devisBdc: files, isDone })
      } else {
        alert(`Erreur: ${await res.text()}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const montant = formatMontant(upsell.montantHT, upsell.currency)

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-[520px] bg-gray-50 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {upsell.projetRef && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-semibold">
                  {upsell.projetRef}
                </span>
              )}
              {upsell.statut && <span className="text-xs text-gray-500">{upsell.statut}</span>}
            </div>
            <h2 className="text-lg font-bold text-gray-900 truncate">
              {upsell.description || upsell.projetNom || 'Upsell'}
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
              {upsell.clientName && <span className="truncate">{upsell.clientName}</span>}
              {montant && <span className="font-semibold text-gray-700">· {montant} HT</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {upsell.description && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Description de l&apos;upsell
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{upsell.description}</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Bon de commande
            </h3>

            {/* Num BDC Upsell */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Numéro de BDC Upsell
              </label>
              <input
                type="text"
                value={numBdc}
                onChange={(e) => setNumBdc(e.target.value)}
                disabled={pasDeBdc}
                placeholder="ex. BDC-2026-018"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
            </div>

            {/* Pas de BDC upsell */}
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pasDeBdc}
                onChange={(e) => {
                  setPasDeBdc(e.target.checked)
                  if (e.target.checked) setNumBdc('')
                }}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Pas de BDC pour cet upsell</span>
            </label>

            {/* Devis / BDC Upsell attachments */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Devis / BDC Upsell (PDF)
              </label>
              <div className="space-y-2">
                {files.length > 0 && (
                  <div className="space-y-1.5">
                    {files.map((att, i) => (
                      <div
                        key={`${att.url}-${i}`}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg"
                      >
                        <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 text-sm text-indigo-600 hover:underline truncate"
                        >
                          {att.filename}
                        </a>
                        <button
                          onClick={() => deleteAttachment(att)}
                          className="p-1 text-gray-400 hover:text-red-500"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => handleUpload(e.target.files)}
                  className="hidden"
                  id={`upsell-upload-${upsell.id}`}
                />
                <label
                  htmlFor={`upsell-upload-${upsell.id}`}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer transition"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Upload…
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" /> Ajouter un fichier
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Annuler
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
