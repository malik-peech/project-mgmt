'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Rocket,
  CheckCircle2,
  AlertCircle,
  Search,
  Loader2,
  Archive,
  ChevronRight,
  Circle,
  Filter,
  X,
} from 'lucide-react'
import OnboardingPanel from '@/components/OnboardingPanel'
import type { Projet } from '@/types'

type OnboardingProjet = Projet & { isOnboarded: boolean; missingCount: number }

type View = 'toOnboard' | 'archive'

interface Client { id: string; name: string }
interface Mensuel { id: string; name: string }

const statutColors: Record<string, string> = {
  'En cours': 'bg-yellow-100 text-yellow-800',
  'Finalisation': 'bg-orange-100 text-orange-800',
  'Stand-by': 'bg-pink-100 text-pink-800',
  'Done': 'bg-green-100 text-green-800',
  'Tentative': 'bg-cyan-100 text-cyan-800',
  'Intention': 'bg-cyan-100 text-cyan-800',
}

const agenceColors: Record<string, string> = {
  'Peech': 'bg-orange-100 text-orange-700',
  'Newic': 'bg-blue-100 text-blue-700',
  'Meecro': 'bg-green-100 text-green-700',
  'Creespy': 'bg-purple-100 text-purple-700',
}

export default function OnboardingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const userName = session?.user?.name || ''
  const userRole = (session?.user as { role?: string })?.role

  const [view, setView] = useState<View>('toOnboard')
  const [projets, setProjets] = useState<OnboardingProjet[]>([])
  const [counts, setCounts] = useState({ total: 0, toOnboard: 0, onboarded: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<OnboardingProjet | null>(null)

  const [clients, setClients] = useState<Client[]>([])
  const [mensuels, setMensuels] = useState<Mensuel[]>([])
  const [users, setUsers] = useState<{ name: string; role: string }[]>([])

  // Admin can view another sales' queue via ?sales=
  const [salesOverride, setSalesOverride] = useState<string>('')
  const [salesOptions, setSalesOptions] = useState<string[]>([])
  const isAdmin = userRole === 'Admin'
  const effectiveSales = isAdmin && salesOverride ? salesOverride : userName

  const fetchData = useCallback(async () => {
    if (!effectiveSales) return
    setLoading(true)
    try {
      const [projRes, clientsRes, mensuelsRes, usersRes] = await Promise.all([
        fetch(`/api/onboarding?sales=${encodeURIComponent(effectiveSales)}`),
        fetch('/api/clients'),
        fetch('/api/mensuel'),
        fetch('/api/users'),
      ])
      if (projRes.ok) {
        const data = await projRes.json()
        setProjets(data.projets || [])
        setCounts(data.counts || { total: 0, toOnboard: 0, onboarded: 0 })
      }
      if (clientsRes.ok) setClients(await clientsRes.json())
      if (mensuelsRes.ok) setMensuels(await mensuelsRes.json())
      if (usersRes.ok) {
        const list = await usersRes.json()
        setUsers(list)
      }
    } finally {
      setLoading(false)
    }
  }, [effectiveSales])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Admin: build sales options from users with any projets where sales === them.
  // Simpler: gather distinct Sales values from projets visible in other queries.
  // For now, use a hardcoded list matching Airtable Sales singleSelect.
  useEffect(() => {
    if (!isAdmin) return
    // Populate from Airtable Sales options (singleSelect). Names match those from schema.
    setSalesOptions([
      'Malik Goulamhoussen',
      'Fabien Dhondt',
      'Laurine Angelini',
      'Rodolphe Le Dortz',
      'Julien Munier',
      'Amandine',
      'Maxime Robé',
      'Marlène',
    ])
  }, [isAdmin])

  // Redirect non-authenticated to login
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const pmOptions = useMemo(
    () => users.filter((u) => u.role === 'PM').map((u) => u.name).sort((a, b) => a.localeCompare(b)),
    [users]
  )

  const visibleProjets = useMemo(() => {
    const filtered = projets.filter((p) => (view === 'toOnboard' ? !p.isOnboarded : p.isOnboarded))
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

  // Not sales and not admin and no projets → friendly message
  const hasAnySales = counts.total > 0
  if (!hasAnySales && !isAdmin) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <Rocket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Onboarding</h1>
          <p className="text-sm text-gray-500">
            Aucun projet n&apos;est associé à vous en tant que Sales dans Airtable.
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
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
          </div>
          <p className="text-sm text-gray-500">
            {isAdmin && salesOverride
              ? `Projets de ${salesOverride}`
              : 'Complétez les infos de vos projets signés avant qu\'ils ne partent en prod.'}
          </p>
        </div>

        {isAdmin && salesOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={salesOverride}
              onChange={(e) => setSalesOverride(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Moi ({userName})</option>
              {salesOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {salesOverride && (
              <button
                onClick={() => setSalesOverride('')}
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
          label="À onboarder"
          value={counts.toOnboard}
          icon={AlertCircle}
          color="amber"
          active={view === 'toOnboard'}
          onClick={() => setView('toOnboard')}
        />
        <StatCard
          label="Onboardés"
          value={counts.onboarded}
          icon={CheckCircle2}
          color="green"
          active={view === 'archive'}
          onClick={() => setView('archive')}
        />
        <StatCard
          label="Total"
          value={counts.total}
          icon={Rocket}
          color="indigo"
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
          {view === 'toOnboard' ? (
            <>
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-sm text-gray-600 font-medium">Tous vos projets sont onboardés 🎉</p>
              <p className="text-xs text-gray-400 mt-1">Rien à compléter pour le moment.</p>
            </>
          ) : (
            <>
              <Archive className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Aucun projet onboardé pour l&apos;instant.</p>
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
        <OnboardingPanel
          projet={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null)
            fetchData()
          }}
          clients={clients}
          mensuels={mensuels}
          pmOptions={pmOptions}
          onClientCreated={(c) => setClients((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}
    </div>
  )
}

// ── Subcomponents ──

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
  color: 'amber' | 'green' | 'indigo'
  active?: boolean
  onClick?: () => void
}) {
  const colorMap = {
    amber: {
      bg: 'bg-amber-50',
      icon: 'text-amber-600',
      border: 'border-amber-200',
      activeBorder: 'border-amber-500 ring-2 ring-amber-200',
    },
    green: {
      bg: 'bg-green-50',
      icon: 'text-green-600',
      border: 'border-green-200',
      activeBorder: 'border-green-500 ring-2 ring-green-200',
    },
    indigo: {
      bg: 'bg-indigo-50',
      icon: 'text-indigo-600',
      border: 'border-indigo-200',
      activeBorder: 'border-indigo-500 ring-2 ring-indigo-200',
    },
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

function ProjetCard({ projet, onClick }: { projet: OnboardingProjet; onClick: () => void }) {
  const pct = Math.round(((18 - projet.missingCount) / 18) * 100)
  const barColor = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-indigo-500' : 'bg-amber-500'
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition flex items-center gap-4"
    >
      {/* Ref */}
      <div className="shrink-0">
        <span className="inline-flex items-center px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-xs font-semibold">
          {projet.ref || '—'}
        </span>
      </div>

      {/* Name + client */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{projet.nom}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
          {projet.clientName && <span className="truncate">{projet.clientName}</span>}
          {projet.statut && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statutColors[projet.statut] || 'bg-gray-100 text-gray-600'}`}>
              {projet.statut}
            </span>
          )}
          {projet.agence && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${agenceColors[projet.agence] || 'bg-gray-100 text-gray-600'}`}>
              {projet.agence}
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="hidden md:block w-40 shrink-0">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="font-medium text-gray-600">{pct}%</span>
          <span className="text-gray-400">
            {projet.isOnboarded ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            ) : (
              `${projet.missingCount} champ${projet.missingCount > 1 ? 's' : ''}`
            )}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* CTA */}
      <div className="shrink-0 flex items-center gap-2">
        {projet.isOnboarded ? (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Circle className="w-2.5 h-2.5" /> Voir
          </span>
        ) : (
          <span className="text-xs font-semibold text-indigo-600">Compléter</span>
        )}
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </button>
  )
}
