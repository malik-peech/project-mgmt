'use client'

import { useState } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import type { Projet } from '@/types'

const TYPE_OPTIONS = [
  'Brief', 'Call client', 'Email client', 'Demande float', 'Shooting',
  'Delivery', 'Envoi rétroplanning', 'Task interne', 'Contact presta',
  'Check', 'Prez', 'COGS', 'Matos', 'Retour presta', 'Casting VO',
  'Casting acteur', 'Prepa Tournage', 'Call presta', 'Calendar',
]

const PRIORITY_OPTIONS = ['Urgent', 'Important', "Dans l'idéal", 'Optionnel', 'Si retour client']

type Props = {
  /** The project the completed task belonged to */
  projetId?: string
  projetName?: string
  /** All projets for dropdown if projetId is not set */
  projets?: Projet[]
  onClose: () => void
  onCreated: () => void
}

export default function ForceNewTaskModal({ projetId, projetName, projets, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [type, setType] = useState('')
  const [priority, setPriority] = useState('')
  const [selectedProjetId, setSelectedProjetId] = useState(projetId || '')
  const [submitting, setSubmitting] = useState(false)

  // Tomorrow as min date
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !dueDate) return
    setSubmitting(true)
    try {
      const body: Record<string, string> = { name, dueDate }
      if (selectedProjetId) body.projetId = selectedProjetId
      if (type) body.type = type
      if (priority) body.priority = priority

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        onCreated()
      }
    } catch {
      // silent
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        {/* Header with warning */}
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Planifier la prochaine task</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {projetName
                ? `Créez une task future pour ${projetName}`
                : 'Chaque projet actif doit avoir une prochaine action planifiée'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Project selector (only if no projetId) */}
          {!projetId && projets && (
            <select
              value={selectedProjetId}
              onChange={(e) => setSelectedProjetId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- Projet --</option>
              {projets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ref ? `${p.ref} - ` : ''}{p.nom}
                </option>
              ))}
            </select>
          )}

          {/* Task name */}
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de la prochaine task *"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {/* Due date (must be future) */}
          <input
            type="date"
            required
            value={dueDate}
            min={minDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {/* Type + Priority */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Type</option>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Priorité</option>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Passer
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !dueDate}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
