'use client'

import { useEffect, useState, useMemo } from 'react'
import { X, UserX, Loader2, Search, AlertCircle, CheckCircle2, Users, Palette, PauseCircle } from 'lucide-react'
import ComboSelect from './ComboSelect'

interface UnassignedProjet {
  id: string
  ref?: string
  nom: string
  clientName?: string
  statut?: string
  agence?: string
  pm?: string
  daOfficial?: string
  pasDeDa?: boolean
  missingPM: boolean
  missingDA: boolean
  standBy: boolean
}

// Sentinel value for the synthetic "Pas de DA" option in the DA picker.
const PAS_DE_DA = '__PAS_DE_DA__'

interface Counts {
  total: number
  missingPM: number
  missingDA: number
  missingBoth: number
  standBy: number
}

interface Props {
  onClose: () => void
}

const statutColors: Record<string, string> = {
  'En cours': 'bg-yellow-100 text-yellow-800',
  'Finalisation': 'bg-orange-100 text-orange-800',
  'Stand-by': 'bg-pink-100 text-pink-800',
  'Tentative': 'bg-cyan-100 text-cyan-800',
  'Intention': 'bg-cyan-100 text-cyan-800',
}

const agenceColors: Record<string, string> = {
  'Peech': 'bg-orange-100 text-orange-700',
  'Newic': 'bg-blue-100 text-blue-700',
  'Meecro': 'bg-green-100 text-green-700',
  'Creespy': 'bg-purple-100 text-purple-700',
}

type FilterView = 'all' | 'pm' | 'da' | 'standby'

export default function UnassignedModal({ onClose }: Props) {
  const [projets, setProjets] = useState<UnassignedProjet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<FilterView>('all')
  const [users, setUsers] = useState<{ name: string; role: string }[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [projRes, usersRes] = await Promise.all([
          fetch('/api/projets/unassigned', { cache: 'no-store' }),
          fetch('/api/users'),
        ])
        if (projRes.ok) {
          const data = await projRes.json()
          if (!cancelled) setProjets(data.projets || [])
        }
        if (usersRes.ok) {
          const list = await usersRes.json()
          if (!cancelled) setUsers(list)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pmOptions = useMemo(
    () => users.filter((u) => u.role === 'PM' || u.role === 'Admin').map((u) => ({ value: u.name, label: u.name })),
    [users]
  )
  const daOptions = useMemo(
    () => [
      { value: PAS_DE_DA, label: 'Pas de DA', sub: 'Aucun DA nécessaire' },
      ...users.filter((u) => u.role === 'DA').map((u) => ({ value: u.name, label: u.name })),
    ],
    [users]
  )

  const visibleProjets = useMemo(() => {
    let list = projets
    // Stand-by projets are excluded from Tous / Sans PM / Sans DA — they live in their own tab.
    if (view === 'all') list = list.filter((p) => !p.standBy)
    else if (view === 'pm') list = list.filter((p) => p.missingPM && !p.standBy)
    else if (view === 'da') list = list.filter((p) => p.missingDA && !p.standBy)
    else if (view === 'standby') list = list.filter((p) => p.standBy)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.nom?.toLowerCase().includes(q) ||
          p.ref?.toLowerCase().includes(q) ||
          p.clientName?.toLowerCase().includes(q)
      )
    }
    return list
  }, [projets, view, search])

  const assign = async (projetId: string, field: 'pm' | 'daOfficial', value: string) => {
    setSavingId(projetId + field)
    try {
      // Synthetic "Pas de DA" value → clear the DA field AND set the pasDeDa flag.
      const body: Record<string, string | boolean | null> = { id: projetId }
      const pickedPasDeDa = field === 'daOfficial' && value === PAS_DE_DA
      if (pickedPasDeDa) {
        body.daOfficial = ''
        body.pasDeDa = true
      } else {
        body[field] = value
        if (field === 'daOfficial' && value) body.pasDeDa = false
      }
      const res = await fetch('/api/projets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        // Optimistic: update the row locally. Counters are re-derived from the
        // list below, so we don't need to manually sync them.
        setProjets((prev) =>
          prev
            .map((p) => {
              if (p.id !== projetId) return p
              const updated = { ...p }
              if (field === 'pm') {
                updated.pm = value
                updated.missingPM = !value.trim()
              } else if (pickedPasDeDa) {
                updated.daOfficial = ''
                updated.pasDeDa = true
                updated.missingDA = false
              } else {
                updated.daOfficial = value
                updated.pasDeDa = false
                updated.missingDA = !value.trim()
              }
              return updated
            })
            .filter((p) => p.missingPM || p.missingDA)
        )
        setSavedFlash(projetId + field)
        setTimeout(() => setSavedFlash(null), 1500)
      }
    } finally {
      setSavingId(null)
    }
  }

  // Derive counts from the current list so they stay in sync with optimistic updates.
  const derivedCounts: Counts = useMemo(() => {
    let missingPM = 0
    let missingDA = 0
    let missingBoth = 0
    let standBy = 0
    for (const p of projets) {
      if (p.standBy) {
        standBy++
        continue
      }
      if (p.missingPM && p.missingDA) missingBoth++
      else if (p.missingPM) missingPM++
      else if (p.missingDA) missingDA++
    }
    return {
      total: missingPM + missingDA + missingBoth,
      missingPM: missingPM + missingBoth,
      missingDA: missingDA + missingBoth,
      missingBoth,
      standBy,
    }
  }, [projets])

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-10 md:pt-20 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <UserX className="w-4 h-4 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Projets non assignés</h2>
            </div>
            <p className="text-xs text-gray-500">
              {derivedCounts.total} actif{derivedCounts.total > 1 ? 's' : ''} sans PM/DA
              {derivedCounts.standBy > 0 && (
                <span className="text-gray-400"> · {derivedCounts.standBy} stand-by</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 flex-wrap">
          <TabButton
            active={view === 'all'}
            onClick={() => setView('all')}
            label="Tous"
            count={derivedCounts.total}
            color="gray"
          />
          <TabButton
            active={view === 'pm'}
            onClick={() => setView('pm')}
            label="Sans PM"
            count={derivedCounts.missingPM}
            icon={Users}
            color="indigo"
          />
          <TabButton
            active={view === 'da'}
            onClick={() => setView('da')}
            label="Sans DA"
            count={derivedCounts.missingDA}
            icon={Palette}
            color="teal"
          />
          <TabButton
            active={view === 'standby'}
            onClick={() => setView('standby')}
            label="Stand-by"
            count={derivedCounts.standBy}
            icon={PauseCircle}
            color="pink"
          />
          {derivedCounts.missingBoth > 0 && (
            <span className="ml-auto text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {derivedCounts.missingBoth} sans PM ni DA
            </span>
          )}
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un projet, un client, une réf…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : visibleProjets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500 mb-3" />
              <p className="text-sm text-gray-600 font-medium">
                {search || view !== 'all' ? 'Aucun résultat' : 'Tous les projets sont assignés 🎉'}
              </p>
              {(search || view !== 'all') && (
                <p className="text-xs text-gray-400 mt-1">Essayez d&apos;autres filtres.</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {visibleProjets.map((p) => (
                <div key={p.id} className="flex items-start md:items-center gap-3 px-6 py-3 hover:bg-gray-50 flex-col md:flex-row">
                  {/* Ref + info */}
                  <div className="flex-1 min-w-0 w-full md:w-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.ref && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-semibold">
                          {p.ref}
                        </span>
                      )}
                      {p.statut && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statutColors[p.statut] || 'bg-gray-100 text-gray-600'}`}>
                          {p.statut}
                        </span>
                      )}
                      {p.agence && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${agenceColors[p.agence] || 'bg-gray-100 text-gray-600'}`}>
                          {p.agence}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-sm text-gray-900 mt-0.5 truncate">{p.nom}</p>
                    {p.clientName && <p className="text-xs text-gray-500 truncate">{p.clientName}</p>}
                  </div>

                  {/* PM assign */}
                  <div className="w-full md:w-44 shrink-0">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-gray-500 mb-1">
                      <Users className="w-3 h-3" />
                      PM
                      {p.missingPM ? (
                        <span className="text-amber-600">*</span>
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                      )}
                    </div>
                    <div className="relative">
                      <ComboSelect
                        options={pmOptions}
                        value={p.pm || ''}
                        onChange={(v) => assign(p.id, 'pm', v)}
                        placeholder={p.missingPM ? 'Affecter un PM…' : ''}
                        size="sm"
                        clearable
                      />
                      {savingId === p.id + 'pm' && (
                        <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-500 animate-spin" />
                      )}
                      {savedFlash === p.id + 'pm' && (
                        <CheckCircle2 className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-green-500" />
                      )}
                    </div>
                  </div>

                  {/* DA assign */}
                  <div className="w-full md:w-44 shrink-0">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-gray-500 mb-1">
                      <Palette className="w-3 h-3" />
                      DA
                      {p.missingDA ? (
                        <span className="text-amber-600">*</span>
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                      )}
                    </div>
                    <div className="relative">
                      <ComboSelect
                        options={daOptions}
                        value={p.pasDeDa ? PAS_DE_DA : (p.daOfficial || '')}
                        onChange={(v) => assign(p.id, 'daOfficial', v)}
                        placeholder={p.missingDA ? 'Affecter un DA…' : ''}
                        size="sm"
                        clearable
                      />
                      {savingId === p.id + 'daOfficial' && (
                        <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-500 animate-spin" />
                      )}
                      {savedFlash === p.id + 'daOfficial' && (
                        <CheckCircle2 className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-green-500" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Les modifs sont sauvegardées automatiquement sur Airtable.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

function TabButton({
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
  icon?: any
  color: 'gray' | 'indigo' | 'teal' | 'pink'
}) {
  const activeMap = {
    gray: 'bg-gray-900 text-white',
    indigo: 'bg-indigo-600 text-white',
    teal: 'bg-teal-600 text-white',
    pink: 'bg-pink-600 text-white',
  }
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
        active ? activeMap[color] : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-gray-200 text-gray-700'}`}>
        {count}
      </span>
    </button>
  )
}
