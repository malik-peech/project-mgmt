'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  X,
  Loader2,
  ClipboardCheck,
  Clock,
  AlertTriangle,
  CalendarX,
  CheckCircle2,
  Circle,
} from 'lucide-react'
import DatePicker from './DatePicker'

interface Entry {
  id: string
  ref?: string
  nom: string
  clientName?: string
  statut?: string
  agence?: string
  phase?: string
  briefEffectue?: boolean
  dateBrief?: string
  dateFinalisationPrevue?: string
  overdueTaskCount?: number
  nextTaskDate?: string
}

interface DashboardData {
  unplannedBriefs: Entry[]
  overdueTasks: Entry[]
  noTasks: Entry[]
  pastDeadline: Entry[]
  counts: {
    unplannedBriefs: number
    overdueTasks: number
    noTasks: number
    pastDeadline: number
  }
}

type TabKey = 'briefs' | 'overdue' | 'noTasks' | 'deadline'

export default function PMWelcomeModal({ userName, onClose }: { userName: string; onClose: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('briefs')
  const [savingId, setSavingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pm-dashboard?pm=${encodeURIComponent(userName)}`, { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [userName])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const patchProjet = async (id: string, body: Record<string, string | boolean | null>) => {
    setSavingId(id)
    try {
      await fetch('/api/projets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
    } finally {
      setSavingId(null)
    }
  }

  const markBriefDone = async (entry: Entry) => {
    await patchProjet(entry.id, { briefEffectue: true })
    setData((prev) =>
      prev
        ? {
            ...prev,
            unplannedBriefs: prev.unplannedBriefs.filter((e) => e.id !== entry.id),
            counts: { ...prev.counts, unplannedBriefs: prev.counts.unplannedBriefs - 1 },
          }
        : prev
    )
  }

  const updateBriefDate = async (entry: Entry, value: string) => {
    await patchProjet(entry.id, { dateBrief: value || null })
    setData((prev) =>
      prev
        ? {
            ...prev,
            unplannedBriefs: value
              ? prev.unplannedBriefs.filter((e) => e.id !== entry.id)
              : prev.unplannedBriefs.map((e) => (e.id === entry.id ? { ...e, dateBrief: value } : e)),
            counts: {
              ...prev.counts,
              unplannedBriefs: value ? prev.counts.unplannedBriefs - 1 : prev.counts.unplannedBriefs,
            },
          }
        : prev
    )
  }

  const updateDeadline = async (entry: Entry, value: string) => {
    await patchProjet(entry.id, { dateFinalisationPrevue: value || null })
    setData((prev) =>
      prev
        ? {
            ...prev,
            pastDeadline: prev.pastDeadline.map((e) =>
              e.id === entry.id ? { ...e, dateFinalisationPrevue: value } : e,
            ),
          }
        : prev,
    )
  }

  const total = data
    ? data.counts.unplannedBriefs +
      data.counts.overdueTasks +
      data.counts.noTasks +
      data.counts.pastDeadline
    : 0

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-6 md:pt-16 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <ClipboardCheck className="w-4 h-4 text-indigo-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Bonjour {userName.split(' ')[0]} 👋</h2>
            </div>
            <p className="text-xs text-gray-500">
              {total === 0
                ? 'Tout est à jour sur vos projets.'
                : `${total} point${total > 1 ? 's' : ''} d'attention sur vos projets — mettons-les à jour rapidement.`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {data && (
          <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 flex-wrap">
            <TabBtn
              active={tab === 'briefs'}
              onClick={() => setTab('briefs')}
              label="Brief client à planifier"
              count={data.counts.unplannedBriefs}
              icon={ClipboardCheck}
              color="indigo"
            />
            <TabBtn
              active={tab === 'overdue'}
              onClick={() => setTab('overdue')}
              label="Tasks en retard"
              count={data.counts.overdueTasks}
              icon={Clock}
              color="red"
            />
            <TabBtn
              active={tab === 'noTasks'}
              onClick={() => setTab('noTasks')}
              label="Sans task"
              count={data.counts.noTasks}
              icon={AlertTriangle}
              color="amber"
            />
            <TabBtn
              active={tab === 'deadline'}
              onClick={() => setTab('deadline')}
              label="Date finalisation dépassée"
              count={data.counts.pastDeadline}
              icon={CalendarX}
              color="orange"
            />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading || !data ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : tab === 'briefs' ? (
            <EntryList
              entries={data.unplannedBriefs}
              emptyMessage="Tous les briefs clients sont planifiés ou faits 🎉"
              renderActions={(entry) => (
                <div className="flex items-center gap-2">
                  <div className="w-36">
                    <DatePicker
                      value={entry.dateBrief || ''}
                      onChange={(v) => updateBriefDate(entry, v)}
                      placeholder="Planifier…"
                      size="sm"
                      clearable
                    />
                  </div>
                  <button
                    onClick={() => markBriefDone(entry)}
                    disabled={savingId === entry.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Fait
                  </button>
                </div>
              )}
            />
          ) : tab === 'overdue' ? (
            <EntryList
              entries={data.overdueTasks}
              emptyMessage="Aucune task en retard 💪"
              renderActions={(entry) => (
                <a
                  href={`/tasks?projet=${entry.id}&filter=overdue`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition"
                >
                  <Clock className="w-3.5 h-3.5" />
                  {entry.overdueTaskCount} en retard
                </a>
              )}
            />
          ) : tab === 'noTasks' ? (
            <EntryList
              entries={data.noTasks}
              emptyMessage="Tous vos projets actifs ont une task 🎯"
              renderActions={(entry) => (
                <a
                  href={`/?projet=${entry.id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition"
                >
                  <Circle className="w-3.5 h-3.5" />
                  Ajouter une task
                </a>
              )}
            />
          ) : (
            <EntryList
              entries={data.pastDeadline}
              emptyMessage="Aucune date de finalisation dépassée ⏱️"
              renderActions={(entry) => (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-red-600">
                    Prévu: {formatDate(entry.dateFinalisationPrevue)}
                  </span>
                  <div className="w-36">
                    <DatePicker
                      value={entry.dateFinalisationPrevue || ''}
                      onChange={(v) => updateDeadline(entry, v)}
                      placeholder="Nouvelle date…"
                      size="sm"
                      clearable
                    />
                  </div>
                </div>
              )}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex items-center justify-between">
          <span className="text-xs text-gray-500">Les modifs sont sauvegardées automatiquement.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.substring(0, 10).split('-').map(Number)
  if (parts.length < 3 || parts.some(isNaN)) return new Date(NaN)
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—'
  const d = parseLocalDate(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const statutColors: Record<string, string> = {
  'En cours': 'bg-yellow-300 text-yellow-900',
  'Finalisation': 'bg-orange-300 text-orange-900',
  'Stand-by': 'bg-pink-300 text-pink-900',
}

function EntryList({
  entries,
  emptyMessage,
  renderActions,
}: {
  entries: Entry[]
  emptyMessage: string
  renderActions: (entry: Entry) => React.ReactNode
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle2 className="w-10 h-10 text-green-500 mb-3" />
        <p className="text-sm text-gray-600 font-medium">{emptyMessage}</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-gray-100">
      {entries.map((p) => (
        <div
          key={p.id}
          className="flex items-start md:items-center gap-3 px-6 py-3 hover:bg-gray-50 flex-col md:flex-row"
        >
          <div className="flex-1 min-w-0 w-full md:w-auto">
            <div className="flex items-center gap-2 flex-wrap">
              {p.ref && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-semibold">
                  {p.ref}
                </span>
              )}
              {p.statut && (
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    statutColors[p.statut] || 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {p.statut}
                </span>
              )}
            </div>
            <p className="font-medium text-sm text-gray-900 mt-0.5 truncate">{p.nom}</p>
            {p.clientName && <p className="text-xs text-gray-500 truncate">{p.clientName}</p>}
          </div>
          <div className="shrink-0">{renderActions(p)}</div>
        </div>
      ))}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  label,
  count,
  icon: Icon,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  color: 'indigo' | 'red' | 'amber' | 'orange'
}) {
  const activeMap = {
    indigo: 'bg-indigo-600 text-white',
    red: 'bg-red-600 text-white',
    amber: 'bg-amber-500 text-white',
    orange: 'bg-orange-500 text-white',
  }
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
        active ? activeMap[color] : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      <span
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
          active ? 'bg-white/20' : 'bg-gray-200 text-gray-700'
        }`}
      >
        {count}
      </span>
    </button>
  )
}
