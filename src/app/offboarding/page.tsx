'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  CheckCircle2,
  AlertCircle,
  Search,
  Loader2,
  PackageCheck,
  ChevronRight,
  Circle,
  Filter,
  X,
} from 'lucide-react'
import OffboardingPanel from '@/components/OffboardingPanel'
import type { Projet } from '@/types'
import { missingOffboardingFields } from '@/lib/offboarding'

type OffboardingProjet = Projet & { isOffboarded: boolean; missingCount: number }

type View = 'toOffboard' | 'archive'

interface Mensuel { id: string; name: string }

const agenceColors: Record<string, string> = {
  'Peech': 'bg-orange-100 text-orange-700',
  'Newic': 'bg-blue-100 text-blue-700',
  'Meecro': 'bg-green-100 text-green-700',
  'Creespy': 'bg-purple-100 text-purple-700',
}

const pointEopColors: Record<string, string> = {
  'Prévu': 'bg-amber-100 text-amber-700',
  'Done': 'bg-green-100 text-green-700',
  'No need (vu avec sales)': 'bg-gray-100 text-gray-600',
}

export default function OffboardingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const userName = session?.user?.name || ''
  const userRole = (session?.user as { role?: string })?.role
  const isAdmin = userRole === 'Admin'

  const [view, setView] = useState<View>('toOffboard')
  const [projets, setProjets] = useState<OffboardingProjet[]>([])
  const [counts, setCounts] = useState({ total: 0, toOffboard: 0, offboarded: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<OffboardingProjet | null>(null)
  const [mensuels, setMensuels] = useState<Mensuel[]>([])

  // Admin filter
  const [pmOverride, setPmOverride] = useState<string>('')
  const [users, setUsers] = useState<{ name: string; role: string }[]>([])
  const effectivePm = isAdmin && pmOverride ? pmOverride : (isAdmin ? '__all' : userName)

  const fetchData = useCallback(async () => {
    if (!effectivePm) return
    setLoading(true)
    try {
      const [projRes, mensuelsRes, usersRes] = await Promise.all([
        fetch(`/api/offboarding?pm=${encodeURIComponent(effectivePm)}`, { cache: 'no-store' }),
        fetch('/api/mensuel'),
        fetch('/api/users'),
      ])
      if (projRes.ok) {
        const data = await projRes.json()
        setProjets(data.projets || [])
        setCounts(data.counts || { total: 0, toOffboard: 0, offboarded: 0 })
      }
      if (mensuelsRes.ok) setMensuels(await mensuelsRes.json())
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
    const filtered = projets.filter((p) => (view === 'toOffboard' ? !p.isOffboarded : p.isOffboarded))
    if (!search.trim()) return filtered
    const q = search.toLowerCase()
    return filtered.filter(
      (p) =>
        p.nom?.toLowerCase().includes(q) ||
        p.ref?.toLowerCase().includes(q) ||
        p.clientName?.toLowerCase().includes(q)
    )
  }, [projets, view, search])

  if (status === 'loading' || (loading && projets.length === 0)) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    )
  }

  if (counts.total === 0 && !isAdmin) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <PackageCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Offboarding</h1>
          <p className="text-sm text-gray-500">
            Aucun projet en statut Done à offboarder pour le moment.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      {/* Header */}
      <div className="flex items-start md:items-center justify-between flex-col md:flex-row gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <PackageCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Offboarding</h1>
          </div>
          <p className="text-sm text-gray-500">
            {isAdmin && pmOverride
              ? `Projets Done de ${pmOverride}`
              : 'Archivez vos projets Done : Frame, Slack, EOP, Belle Base, point EOP.'}
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

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <StatCard
          label="À offboarder"
          value={counts.toOffboard}
          icon={AlertCircle}
          color="amber"
          active={view === 'toOffboard'}
          onClick={() => setView('toOffboard')}
        />
        <StatCard
          label="Offboardés"
          value={counts.offboarded}
          icon={CheckCircle2}
          color="green"
          active={view === 'archive'}
          onClick={() => setView('archive')}
        />
        <StatCard
          label="Total Done"
          value={counts.total}
          icon={PackageCheck}
          color="emerald"
        />
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
          {view === 'toOffboard' ? (
            <>
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-sm text-gray-600 font-medium">Tous vos projets Done sont offboardés 🎉</p>
              <p className="text-xs text-gray-400 mt-1">Rien à faire pour le moment.</p>
            </>
          ) : (
            <>
              <Archive className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Aucun projet offboardé pour l&apos;instant.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleProjets.map((p) => (
            <ProjetCard key={p.id} projet={p} onClick={() => setSelected(p)} />
          ))}
        </div>
      )}

      {/* Form panel */}
      {selected && (
        <OffboardingPanel
          projet={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setProjets((prev) => {
              const missing = missingOffboardingFields(updated)
              const newP = {
                ...updated,
                isOffboarded: missing.length === 0,
                missingCount: missing.length,
              }
              return prev.map((p) => (p.id === updated.id ? newP : p))
            })
            setCounts((c) => {
              const wasDone = projets.find((p) => p.id === updated.id)?.isOffboarded
              const missing = missingOffboardingFields(updated)
              const isDone = missing.length === 0
              const toOffboardDelta = (wasDone ? 0 : -1) + (isDone ? 0 : 1)
              const offboardedDelta = (wasDone ? -1 : 0) + (isDone ? 1 : 0)
              return {
                total: c.total,
                toOffboard: c.toOffboard + toOffboardDelta,
                offboarded: c.offboarded + offboardedDelta,
              }
            })
            setSelected(null)
            fetchData()
          }}
          mensuels={mensuels}
        />
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  active,
  onClick,
}: {
  label: string
  value: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  color: 'amber' | 'green' | 'emerald'
  active?: boolean
  onClick?: () => void
}) {
  const colorMap = {
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', activeBorder: 'border-amber-500 ring-2 ring-amber-200' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', activeBorder: 'border-green-500 ring-2 ring-green-200' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', activeBorder: 'border-emerald-500 ring-2 ring-emerald-200' },
  }
  const c = colorMap[color]
  const clickable = !!onClick
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`text-left flex items-center gap-3 p-4 rounded-xl bg-white border transition ${
        active ? c.activeBorder : 'border-gray-200'
      } ${clickable ? 'hover:border-gray-300 cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${c.icon}`} />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-none mt-0.5">{value}</p>
      </div>
    </button>
  )
}

function ProjetCard({ projet, onClick }: { projet: OffboardingProjet; onClick: () => void }) {
  const pct = Math.round(((5 - projet.missingCount) / 5) * 100)
  const barColor = pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-emerald-500' : 'bg-amber-500'
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-emerald-300 hover:shadow-sm transition flex items-center gap-4"
    >
      <div className="shrink-0">
        <span className="inline-flex items-center px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-xs font-semibold">
          {projet.ref || '—'}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{projet.nom}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 flex-wrap">
          {projet.clientName && <span className="truncate">{projet.clientName}</span>}
          {projet.pm && <span className="text-gray-400">· PM: {projet.pm}</span>}
          {(projet.daOfficial || projet.da) && (
            <span className="text-gray-400">· DA: {projet.daOfficial || projet.da}</span>
          )}
          {projet.agence && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${agenceColors[projet.agence] || 'bg-gray-100 text-gray-600'}`}>
              {projet.agence}
            </span>
          )}
          {projet.pointEop && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${pointEopColors[projet.pointEop] || 'bg-gray-100 text-gray-600'}`}>
              Point EOP: {projet.pointEop}
            </span>
          )}
        </div>
      </div>

      <div className="hidden md:block w-40 shrink-0">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="font-medium text-gray-600">{pct}%</span>
          <span className="text-gray-400">
            {projet.isOffboarded ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            ) : (
              `${projet.missingCount} étape${projet.missingCount > 1 ? 's' : ''}`
            )}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {projet.isOffboarded ? (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Circle className="w-2.5 h-2.5" /> Voir
          </span>
        ) : (
          <span className="text-xs font-semibold text-emerald-600">Compléter</span>
        )}
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </button>
  )
}
