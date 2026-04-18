'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, Search, Loader2, CheckCircle2, Filter, X } from 'lucide-react'
import DatePicker from '@/components/DatePicker'

interface ABrieferProjet {
  id: string
  ref?: string
  nom: string
  clientName?: string
  statut?: string
  agence?: string
  pm?: string
  pm2?: string
  daOfficial?: string
  phase?: string
  briefEffectue: boolean
  dateBrief?: string
  statutBrief?: string
  dateFinalisationPrevue?: string
}

const phaseColors: Record<string, string> = {
  'Démarrage': 'bg-amber-300 text-amber-900',
  'Conception': 'bg-sky-300 text-sky-900',
  'Production': 'bg-indigo-300 text-indigo-900',
  'Last modifs': 'bg-emerald-300 text-emerald-900',
  'Done': 'bg-purple-300 text-purple-900',
}

const statutColors: Record<string, string> = {
  'En cours': 'bg-yellow-300 text-yellow-900',
  'Finalisation': 'bg-orange-300 text-orange-900',
  'Stand-by': 'bg-pink-300 text-pink-900',
  'Tentative': 'bg-cyan-300 text-cyan-900',
  'Intention': 'bg-violet-300 text-violet-900',
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

export default function ABrieferPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const userName = session?.user?.name || ''
  const userRole = (session?.user as { role?: string })?.role
  const isAdmin = userRole === 'Admin'

  const [projets, setProjets] = useState<ABrieferProjet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  // Admin PM override
  const [pmOverride, setPmOverride] = useState<string>('')
  const [users, setUsers] = useState<{ name: string; role: string }[]>([])
  const effectivePm = isAdmin && pmOverride ? pmOverride : (isAdmin ? '__all' : userName)

  const fetchData = useCallback(async () => {
    if (!effectivePm) return
    setLoading(true)
    try {
      const [projRes, usersRes] = await Promise.all([
        fetch(`/api/a-briefer?pm=${encodeURIComponent(effectivePm)}`, { cache: 'no-store' }),
        fetch('/api/users'),
      ])
      if (projRes.ok) {
        const data = await projRes.json()
        setProjets(data.projets || [])
      }
      if (usersRes.ok) setUsers(await usersRes.json())
    } finally {
      setLoading(false)
    }
  }, [effectivePm])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const pmOptions = useMemo(
    () => users.filter((u) => u.role === 'PM' || u.role === 'Admin').map((u) => u.name).sort((a, b) => a.localeCompare(b)),
    [users]
  )

  const visibleProjets = useMemo(() => {
    if (!search.trim()) return projets
    const q = search.toLowerCase()
    return projets.filter(
      (p) =>
        p.nom?.toLowerCase().includes(q) ||
        p.ref?.toLowerCase().includes(q) ||
        p.clientName?.toLowerCase().includes(q)
    )
  }, [projets, search])

  const toggleBrief = async (p: ABrieferProjet) => {
    setSavingId(p.id)
    try {
      const res = await fetch('/api/projets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, briefEffectue: !p.briefEffectue }),
      })
      if (res.ok) {
        // If toggled to "done", drop from list; otherwise update locally.
        setProjets((prev) =>
          !p.briefEffectue
            ? prev.filter((x) => x.id !== p.id)
            : prev.map((x) => (x.id === p.id ? { ...x, briefEffectue: !p.briefEffectue } : x))
        )
      }
    } finally {
      setSavingId(null)
    }
  }

  const updateDate = async (p: ABrieferProjet, value: string) => {
    setSavingId(p.id + 'date')
    try {
      await fetch('/api/projets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, dateBrief: value || null }),
      })
      setProjets((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, dateBrief: value || undefined } : x))
      )
    } finally {
      setSavingId(null)
    }
  }

  if (status === 'loading' || (loading && projets.length === 0)) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      {/* Header */}
      <div className="flex items-start md:items-center justify-between flex-col md:flex-row gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <ClipboardCheck className="w-4 h-4 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Brief client à planifier</h1>
          </div>
          <p className="text-sm text-gray-500">
            {projets.length} projet{projets.length > 1 ? 's' : ''} dont le brief n&apos;est pas encore effectué
          </p>
        </div>

        {isAdmin && pmOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={pmOverride}
              onChange={(e) => setPmOverride(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Tous les PM</option>
              {pmOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {pmOverride && (
              <button
                onClick={() => setPmOverride('')}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
        </div>
      </div>

      {/* List */}
      {visibleProjets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-sm text-gray-600 font-medium">Tous les briefs sont faits 🎉</p>
          <p className="text-xs text-gray-400 mt-1">Aucun projet à briefer.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[40px_80px_100px_1fr_140px_120px_140px] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            <div>Brief</div>
            <div>Code</div>
            <div>Statut</div>
            <div>Projet / Client</div>
            <div>Phase</div>
            <div>PM</div>
            <div>Date de brief</div>
          </div>

          <div className="divide-y divide-gray-100">
            {visibleProjets.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-1 md:grid-cols-[40px_80px_100px_1fr_140px_120px_140px] gap-x-3 gap-y-1 px-4 py-3 hover:bg-gray-50"
              >
                {/* Brief effectué checkbox */}
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => toggleBrief(p)}
                    disabled={savingId === p.id}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                      p.briefEffectue
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 hover:border-indigo-400 bg-white'
                    }`}
                    title={p.briefEffectue ? 'Brief effectué' : 'Cliquer pour marquer comme fait'}
                  >
                    {savingId === p.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : p.briefEffectue ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : null}
                  </button>
                </div>

                {/* Code */}
                <div className="flex items-center min-w-0">
                  <span className="text-[11px] font-mono text-gray-500 truncate">{p.ref || '—'}</span>
                </div>

                {/* Statut */}
                <div className="flex items-center">
                  {p.statut && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statutColors[p.statut] || 'bg-gray-100 text-gray-600'}`}>
                      {p.statut}
                    </span>
                  )}
                </div>

                {/* Projet / Client */}
                <div className="min-w-0 flex flex-col justify-center">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.nom}</p>
                  {p.clientName && <p className="text-xs text-gray-500 truncate">{p.clientName}</p>}
                  {p.statutBrief && (
                    <p className="text-[11px] text-amber-700 truncate" title={p.statutBrief}>
                      {p.statutBrief}
                    </p>
                  )}
                </div>

                {/* Phase */}
                <div className="flex items-center">
                  {p.phase && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${phaseColors[p.phase] || 'bg-gray-100 text-gray-600'}`}>
                      {p.phase}
                    </span>
                  )}
                </div>

                {/* PM */}
                <div className="flex items-center min-w-0">
                  {p.pm ? (
                    <span className="text-xs text-gray-700 truncate" title={[p.pm, p.pm2].filter(Boolean).join(' / ')}>
                      {p.pm}
                      {p.pm2 && <span className="text-gray-400"> +1</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>

                {/* Date de brief */}
                <div className="flex items-center">
                  <DatePicker
                    value={p.dateBrief || ''}
                    onChange={(v) => updateDate(p, v)}
                    placeholder="Planifier…"
                    size="sm"
                    clearable
                  />
                  {savingId === p.id + 'date' && (
                    <Loader2 className="w-3 h-3 text-indigo-500 animate-spin ml-2" />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500">
            Cliquer sur la case pour marquer un brief comme effectué · {formatDate(new Date().toISOString())}
          </div>
        </div>
      )}
    </div>
  )
}
