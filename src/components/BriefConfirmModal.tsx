'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, X, Loader2, AlertTriangle, CalendarCheck } from 'lucide-react'
import DatePicker from './DatePicker'

interface Props {
  projetNom: string
  projetRef?: string
  clientName?: string
  initialDate?: string
  onConfirm: (dateBrief: string) => Promise<void> | void
  onCancel: () => void
}

function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.substring(0, 10).split('-').map(Number)
  if (parts.length < 3 || parts.some(isNaN)) return new Date(NaN)
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null
  const d = parseLocalDate(dateStr)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function todayLocalISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function BriefConfirmModal({
  projetNom,
  projetRef,
  clientName,
  initialDate,
  onConfirm,
  onCancel,
}: Props) {
  const [date, setDate] = useState(initialDate || todayLocalISO())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await onConfirm(date)
    } finally {
      setSubmitting(false)
    }
  }

  const formattedDate = formatDate(date)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-5 h-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900">Confirmer le brief client</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Cette action confirme que le brief a bien été effectué.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="shrink-0 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              {projetRef && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
                  {projetRef}
                </span>
              )}
              <span className="text-sm font-semibold text-gray-900 truncate">{projetNom}</span>
            </div>
            {clientName && (
              <p className="text-xs text-gray-500 truncate">{clientName}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Date à laquelle le brief a été effectué
            </label>
            <DatePicker
              value={date}
              onChange={(v) => setDate(v)}
              placeholder="Choisir une date…"
              clearable={false}
            />
            {formattedDate && (
              <p className="text-[11px] text-gray-500 mt-1.5">
                Brief effectué le <span className="font-medium text-gray-700">{formattedDate}</span>
              </p>
            )}
          </div>

          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              En confirmant, le projet sera marqué comme <strong>brief effectué</strong>. Cette action est
              visible par toute l&apos;équipe.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || !date}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Oui, brief effectué
          </button>
        </div>
      </div>
    </div>
  )
}
