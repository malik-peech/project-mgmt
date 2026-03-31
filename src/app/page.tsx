'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { AlertTriangle, Calendar, TrendingUp } from 'lucide-react'
import type { Projet, StatutProjet } from '@/types'

const phaseColors: Record<string, string> = {
  'Démarrage': 'bg-yellow-100 text-yellow-800',
  'Conception': 'bg-cyan-100 text-cyan-800',
  'Production': 'bg-teal-100 text-teal-800',
  'Last modifs': 'bg-green-100 text-green-800',
  'Done': 'bg-purple-100 text-purple-800',
  'Archivé': 'bg-gray-100 text-gray-800',
}

const statutColors: Record<string, string> = {
  'En cours': 'bg-yellow-100 text-yellow-800',
  'Finalisation': 'bg-orange-100 text-orange-800',
  'Stand-by': 'bg-pink-100 text-pink-800',
  'Done': 'bg-green-100 text-green-800',
  'Tentative': 'bg-cyan-100 text-cyan-800',
  'Intention': 'bg-cyan-100 text-cyan-800',
}

const fmt = (n?: number) =>
  n != null
    ? new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(n)
    : '—'

const statutTabs: (StatutProjet | 'Tous')[] = ['Tous', 'En cours', 'Finalisation', 'Stand-by']

function isOverdue(dateStr?: string) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date(new Date().toDateString())
}

function isToday(dateStr?: string) {
  if (!dateStr) return false
  return new Date(dateStr).toDateString() === new Date().toDateString()
}

function getInitials(name?: string) {
  if (!name) return ''
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [projets, setProjets] = useState<Projet[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<StatutProjet | 'Tous'>('Tous')

  useEffect(() => {
    if (!session?.user?.name) return
    const role = (session.user as { role?: string }).role
    const params = new URLSearchParams()
    if (role !== 'Admin') {
      params.set('pm', session.user.name)
    }
    fetch(`/api/projets?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setProjets(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session])

  const filtered = useMemo(() => {
    if (activeTab === 'Tous') return projets
    return projets.filter((p) => p.statut === activeTab)
  }, [projets, activeTab])

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 bg-gray-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Projets</h1>
          <p className="text-sm text-gray-500 mt-1">
            {projets.length} projet{projets.length !== 1 ? 's' : ''} actif
            {projets.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {statutTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              activeTab === tab
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab}
            {tab !== 'Tous' && (
              <span className="ml-1.5 text-xs opacity-75">
                {projets.filter((p) => p.statut === tab).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Aucun projet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((projet) => {
            const cogsPercent =
              projet.cogsBudget && projet.cogsReels != null
                ? Math.round((projet.cogsReels / projet.cogsBudget) * 100)
                : null
            const hasNoTask = projet.statut === 'En cours' && !projet.nextTask

            return (
              <div
                key={projet.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition p-5"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-indigo-600 truncate">
                      {projet.clientName}
                    </p>
                    <h3 className="text-sm font-semibold text-gray-900 truncate mt-0.5">
                      {projet.nom}
                    </h3>
                    {projet.ref && (
                      <p className="text-xs text-gray-400 mt-0.5">{projet.ref}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5 ml-2 shrink-0">
                    {projet.phase && (
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          phaseColors[projet.phase] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {projet.phase}
                      </span>
                    )}
                    {projet.statut && (
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          statutColors[projet.statut] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {projet.statut}
                      </span>
                    )}
                  </div>
                </div>

                {/* Type + Team */}
                <div className="flex items-center gap-2 mb-3">
                  {projet.typeProjet && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {projet.typeProjet}
                    </span>
                  )}
                  <div className="flex -space-x-1 ml-auto">
                    {[projet.am, projet.da, projet.pc, projet.filmmaker]
                      .filter(Boolean)
                      .map((name, i) => (
                        <div
                          key={i}
                          className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[9px] font-bold border-2 border-white"
                          title={name}
                        >
                          {getInitials(name)}
                        </div>
                      ))}
                  </div>
                </div>

                {/* Budget COGS */}
                <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">COGS</span>
                    <span className="font-medium text-gray-700">
                      {fmt(projet.cogsReels)} / {fmt(projet.cogsBudget)}
                    </span>
                  </div>
                  {cogsPercent != null && (
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          cogsPercent > 100
                            ? 'bg-red-500'
                            : cogsPercent > 80
                              ? 'bg-orange-500'
                              : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(cogsPercent, 100)}%` }}
                      />
                    </div>
                  )}
                  <div className="flex gap-4 text-xs text-gray-500">
                    {projet.sizing != null && <span>Sizing: {projet.sizing}h</span>}
                    {projet.timeCreaBudget != null && (
                      <span>Créa: {projet.timeCreaBudget}h</span>
                    )}
                    {projet.travelBudget != null && projet.travelBudget > 0 && (
                      <span>Travel: {fmt(projet.travelBudget)}</span>
                    )}
                  </div>
                </div>

                {/* Next task */}
                <div className="flex items-center gap-2 text-xs">
                  {hasNoTask ? (
                    <div className="flex items-center gap-1.5 text-red-600 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Aucune task prévue
                    </div>
                  ) : projet.nextTask ? (
                    <>
                      <Calendar
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isOverdue(projet.nextTaskDate)
                            ? 'text-red-500'
                            : isToday(projet.nextTaskDate)
                              ? 'text-orange-500'
                              : 'text-gray-400'
                        }`}
                      />
                      <span
                        className={`truncate ${
                          isOverdue(projet.nextTaskDate)
                            ? 'text-red-600 font-medium'
                            : isToday(projet.nextTaskDate)
                              ? 'text-orange-600 font-medium'
                              : 'text-gray-600'
                        }`}
                      >
                        {projet.nextTask}
                      </span>
                      {projet.nextTaskDate && (
                        <span className="text-gray-400 shrink-0 ml-auto">
                          {new Date(projet.nextTaskDate).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
