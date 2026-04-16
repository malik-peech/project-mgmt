'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle2, Circle, Loader2, Plus, Trash2, ExternalLink, Video } from 'lucide-react'
import ComboSelect from './ComboSelect'
import DatePicker from './DatePicker'
import type { Projet } from '@/types'
import { missingOffboardingFields, OFFBOARDING_FIELD_LABELS } from '@/lib/offboarding'

interface Mensuel { id: string; name: string }
interface BelleEntry { id: string; titre: string; vimeoLink?: string }

interface Props {
  projet: Projet
  onClose: () => void
  onSaved: (updated: Projet) => void
  mensuels: Mensuel[]
}

const DIFFUSABLE_OPTIONS = ['OK pour diffusion', 'Diffusion interdite', 'En attente']
const POINT_EOP_OPTIONS = ['Prévu', 'Done', 'No need (vu avec sales)']

type FormState = {
  frameArchive: boolean
  slackArchive: boolean
  eopMonthIds: string[]
  diffusable: string
  pointEop: string
  datePointEop: string
}

function initForm(p: Projet): FormState {
  return {
    frameArchive: !!p.frameArchive,
    slackArchive: !!p.slackArchive,
    eopMonthIds: p.eopMonthIds || [],
    diffusable: p.diffusable || '',
    pointEop: p.pointEop || '',
    datePointEop: p.datePointEop || '',
  }
}

export default function OffboardingPanel({ projet, onClose, onSaved, mensuels }: Props) {
  const [form, setForm] = useState<FormState>(() => initForm(projet))
  const [saving, setSaving] = useState(false)
  const [showMoisPicker, setShowMoisPicker] = useState(false)

  // Belle base state
  const [belleEntries, setBelleEntries] = useState<BelleEntry[]>([])
  const [belleLoading, setBelleLoading] = useState(true)
  const [newBelleTitre, setNewBelleTitre] = useState('')
  const [newBelleVimeo, setNewBelleVimeo] = useState('')
  const [creatingBelle, setCreatingBelle] = useState(false)
  const [belleError, setBelleError] = useState<string | null>(null)

  useEffect(() => {
    setForm(initForm(projet))
  }, [projet.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load Belle base entries for this projet
  useEffect(() => {
    if (!projet.ref) {
      setBelleLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setBelleLoading(true)
      setBelleError(null)
      try {
        const res = await fetch(`/api/belle-base?projetRef=${encodeURIComponent(projet.ref!)}`)
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setBelleEntries(data.entries || [])
            if (!data.belleProjetId) setBelleError('Projet pas encore synchronisé dans la Belle Base')
          }
        } else {
          if (!cancelled) setBelleError('Erreur de chargement Belle Base')
        }
      } catch {
        if (!cancelled) setBelleError('Erreur réseau')
      } finally {
        if (!cancelled) setBelleLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projet.ref])

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const previewProjet: Projet = {
    ...projet,
    frameArchive: form.frameArchive,
    slackArchive: form.slackArchive,
    eopMonthIds: form.eopMonthIds,
    diffusable: form.diffusable as Projet['diffusable'],
    pointEop: form.pointEop as Projet['pointEop'],
    datePointEop: form.datePointEop,
  }
  const missing = missingOffboardingFields(previewProjet)
  const total = 5
  const filled = total - missing.length
  const pct = Math.round((filled / total) * 100)

  const pointEopPrevu = form.pointEop === 'Prévu'

  const sortedMensuels = [...mensuels].sort((a, b) => b.name.localeCompare(a.name))
  const selectedMoisNames = form.eopMonthIds
    .map((id) => mensuels.find((m) => m.id === id)?.name)
    .filter(Boolean)

  const addBelleEntry = async () => {
    if (!newBelleTitre.trim() || !projet.ref) return
    setCreatingBelle(true)
    setBelleError(null)
    try {
      const res = await fetch('/api/belle-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projetRef: projet.ref,
          titre: newBelleTitre.trim(),
          vimeoLink: newBelleVimeo.trim() || undefined,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setBelleEntries((prev) => [...prev, created])
        setNewBelleTitre('')
        setNewBelleVimeo('')
      } else {
        const data = await res.json().catch(() => ({}))
        setBelleError(data.error || 'Erreur à la création')
      }
    } finally {
      setCreatingBelle(false)
    }
  }

  const removeBelleEntry = async (id: string) => {
    if (!confirm('Supprimer cette entrée de la Belle Base ?')) return
    const res = await fetch(`/api/belle-base?id=${id}`, { method: 'DELETE' })
    if (res.ok) setBelleEntries((prev) => prev.filter((e) => e.id !== id))
  }

  const save = async () => {
    setSaving(true)
    try {
      const body = {
        frameArchive: form.frameArchive,
        slackArchive: form.slackArchive,
        eopMonthIds: form.eopMonthIds,
        diffusable: form.diffusable || null,
        pointEop: form.pointEop || null,
        // Clear datePointEop if pointEop is not "Prévu"
        datePointEop: pointEopPrevu ? (form.datePointEop || null) : null,
      }
      const res = await fetch(`/api/offboarding/${projet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        onSaved(previewProjet)
      } else {
        const err = await res.text()
        alert(`Erreur: ${err}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const diffusableOptions = DIFFUSABLE_OPTIONS.map((v) => ({ value: v, label: v }))
  const pointEopOptions = POINT_EOP_OPTIONS.map((v) => ({ value: v, label: v }))

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />

      <div className="w-full max-w-[640px] bg-gray-50 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {projet.ref && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs font-semibold">
                  {projet.ref}
                </span>
              )}
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium">
                Done
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-900 truncate">{projet.nom}</h2>
            {projet.clientName && <p className="text-sm text-gray-500 truncate">{projet.clientName}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-gray-700">Progression offboarding</span>
            <span className="text-gray-500">{filled}/{total} étapes · {pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Archivage */}
          <Section title="Archivage">
            <label className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-indigo-300 transition">
              <input
                type="checkbox"
                checked={form.frameArchive}
                onChange={(e) => update('frameArchive', e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm text-gray-800 flex-1 font-medium">Frame archivé</span>
              {form.frameArchive && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            </label>
            <label className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-indigo-300 transition">
              <input
                type="checkbox"
                checked={form.slackArchive}
                onChange={(e) => update('slackArchive', e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm text-gray-800 flex-1 font-medium">Slack archivé</span>
              {form.slackArchive && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            </label>
          </Section>

          {/* EOP month */}
          <Section title="Fin de projet">
            <Field label="EOP month" required missing={missing.includes('eopMonth')}>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMoisPicker((s) => !s)}
                  className="w-full flex items-center justify-between gap-2 border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm text-left hover:border-gray-300"
                >
                  <span className={selectedMoisNames.length > 0 ? 'text-gray-900' : 'text-gray-400'}>
                    {selectedMoisNames.length > 0 ? selectedMoisNames.join(', ') : 'Choisir un mois…'}
                  </span>
                </button>
                {showMoisPicker && (
                  <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
                    {sortedMensuels.length === 0 ? (
                      <p className="p-3 text-sm text-gray-400 text-center">Aucun mois</p>
                    ) : (
                      sortedMensuels.map((m) => {
                        const selected = form.eopMonthIds.includes(m.id)
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              update(
                                'eopMonthIds',
                                selected
                                  ? form.eopMonthIds.filter((id) => id !== m.id)
                                  : [...form.eopMonthIds, m.id]
                              )
                            }}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                              selected ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-gray-50'
                            }`}
                          >
                            <span>{m.name}</span>
                            {selected && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                        )
                      })
                    )}
                    <div className="sticky bottom-0 p-2 bg-white border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setShowMoisPicker(false)}
                        className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-700"
                      >
                        Fermer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Field>

            <Field label="Point EOP" required missing={missing.includes('pointEop')}>
              <ComboSelect
                options={pointEopOptions}
                value={form.pointEop}
                onChange={(v) => update('pointEop', v)}
                placeholder="Prévu / Done / No need…"
                clearable
              />
            </Field>

            {pointEopPrevu && (
              <Field label="Date point EOP" required>
                <DatePicker
                  value={form.datePointEop}
                  onChange={(v) => update('datePointEop', v)}
                  placeholder="Choisir une date…"
                  clearable
                />
              </Field>
            )}
          </Section>

          {/* Diffusable */}
          <Section title="Diffusion">
            <Field label="Diffusable ?" required missing={missing.includes('diffusable')}>
              <ComboSelect
                options={diffusableOptions}
                value={form.diffusable}
                onChange={(v) => update('diffusable', v)}
                placeholder="Statut de diffusion…"
                clearable
              />
            </Field>
          </Section>

          {/* Belle base */}
          <Section title={`Belle Base (${belleEntries.length} livrable${belleEntries.length > 1 ? 's' : ''})`}>
            {belleError && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
                {belleError}
              </div>
            )}

            {belleLoading ? (
              <div className="flex items-center justify-center py-3 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : belleEntries.length > 0 ? (
              <div className="space-y-2">
                {belleEntries.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                    <Video className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 font-medium truncate">{e.titre}</p>
                      {e.vimeoLink && (
                        <a
                          href={e.vimeoLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-indigo-600 hover:underline truncate flex items-center gap-1"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          {e.vimeoLink}
                        </a>
                      )}
                    </div>
                    <button
                      onClick={() => removeBelleEntry(e.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Add new entry */}
            <div className="p-3 bg-white border border-dashed border-gray-300 rounded-lg space-y-2">
              <input
                type="text"
                value={newBelleTitre}
                onChange={(e) => setNewBelleTitre(e.target.value)}
                placeholder="Titre du livrable"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="url"
                value={newBelleVimeo}
                onChange={(e) => setNewBelleVimeo(e.target.value)}
                placeholder="Vimeo link (optionnel)"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={addBelleEntry}
                disabled={creatingBelle || !newBelleTitre.trim()}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {creatingBelle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Ajouter à la Belle Base
              </button>
            </div>
          </Section>

          {/* Missing recap */}
          {missing.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-800 mb-1.5">
                Étapes restantes ({missing.length})
              </p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {missing.map((m) => (
                  <li key={m} className="flex items-center gap-1.5">
                    <Circle className="w-2.5 h-2.5 shrink-0" /> {OFFBOARDING_FIELD_LABELS[m]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            {missing.length === 0 ? (
              <span className="text-green-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Offboarding complet
              </span>
            ) : (
              <span>{missing.length} étape{missing.length > 1 ? 's' : ''} restante{missing.length > 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex gap-2">
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
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  children,
  required,
  missing,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
  missing?: boolean
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1.5">
        {missing ? (
          <Circle className="w-2.5 h-2.5 text-amber-500" />
        ) : required ? (
          <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
        ) : null}
        {label}
        {required && <span className="text-amber-500">*</span>}
      </label>
      {children}
    </div>
  )
}
