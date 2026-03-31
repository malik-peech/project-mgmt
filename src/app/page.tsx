'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { AlertTriangle, Calendar, TrendingUp, X, ChevronRight } from 'lucide-react'
import { useData } from '@/hooks/useData'
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

function cogsPercent(projet: Projet) {
  if (projet.cogsBudget && projet.cogsReels != null) {
    return Math.round((projet.cogsReels / projet.cogsBudget) * 100)
  }
  return null
}

function cogsBarColor(pct: number) {
  if (pct > 100) return 'bg-red-500'
  if (pct > 80) return 'bg-orange-500'
  return 'bg-emerald-500'
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<StatutProjet | 'Tous'>('Tous')
  const [selectedProjet, setSelectedProjet] = useState<Projet | null>(null)

  const userName = session?.user?.name || ''
  const userRole = (session?.user as { role?: string })?.role || 'PM'
  const pmParam = userRole !== 'Admin' && userName ? `pm=${encodeURIComponent(userName)}` : ''

  const { data: projets, loading } = useData<Projet[]>(
    session?.user?.name ? `/api/projets?${pmParam}` : null,
    { key: `projets-${pmParam}`, enabled: !!session?.user?.name }
  )

  const allProjets = projets ?? []

  const filtered = useMemo(() => {
    if (activeTab === 'Tous') return allProjets
    return allProjets.filter((p) => p.statut === activeTab)
  }, [allProjets, activeTab])

  // When tab changes, keep panel open only if selected project is still in filtered list
  useEffect(() => {
    if (selectedProjet && !filtered.find((p) => p.id === selectedProjet.id)) {
      setSelectedProjet(null)
    }
  }, [filtered, selectedProjet])

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-10 bg-gray-100 rounded w-80" />
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-11 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh)] overflow-hidden">
      {/* ── Main list area ── */}
      <div
        className={`flex-1 overflow-auto transition-all duration-300 min-w-0 ${
          selectedProjet ? 'md:mr-0' : ''
        }`}
      >
        <div className="p-6 md:p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mes Projets</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {filtered.length} projet{filtered.length !== 1 ? 's' : ''}
                {activeTab !== 'Tous' ? ` ${activeTab.toLowerCase()}` : ''}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-5 overflow-x-auto">
            {statutTabs.map((tab) => {
              const count = tab === 'Tous' ? allProjets.length : allProjets.filter((p) => p.statut === tab).length
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                    activeTab === tab
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tab}
                  <span className={`ml-1.5 text-xs ${activeTab === tab ? 'opacity-75' : 'opacity-50'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Table / List */}
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-medium">Aucun projet</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[1.2fr_1.5fr_0.8fr_0.8fr_1.2fr_1.5fr_0.7fr_28px] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <span>Client</span>
                <span>Projet</span>
                <span>Phase</span>
                <span>Statut</span>
                <span>COGS</span>
                <span>Next Task</span>
                <span>Date</span>
                <span />
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-100">
                {filtered.map((projet) => {
                  const pct = cogsPercent(projet)
                  const hasNoTask = projet.statut === 'En cours' && !projet.nextTask
                  const isActive = selectedProjet?.id === projet.id

                  return (
                    <button
                      key={projet.id}
                      onClick={() => setSelectedProjet(isActive ? null : projet)}
                      className={`w-full text-left grid grid-cols-1 md:grid-cols-[1.2fr_1.5fr_0.8fr_0.8fr_1.2fr_1.5fr_0.7fr_28px] gap-x-3 gap-y-1 px-4 py-2.5 transition-colors duration-150 group cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
                          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                      }`}
                    >
                      {/* Client */}
                      <div className="flex items-center min-w-0">
                        <span className="text-[13px] font-medium text-gray-800 truncate">
                          {projet.clientName || '—'}
                        </span>
                      </div>

                      {/* Projet name */}
                      <div className="flex items-center min-w-0">
                        <span className="text-[13px] text-gray-600 truncate">{projet.nom}</span>
                        {projet.ref && (
                          <span className="ml-1.5 text-[10px] text-gray-400 shrink-0">{projet.ref}</span>
                        )}
                      </div>

                      {/* Phase badge */}
                      <div className="flex items-center">
                        {projet.phase ? (
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full leading-tight ${
                              phaseColors[projet.phase] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {projet.phase}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>

                      {/* Statut badge */}
                      <div className="flex items-center">
                        {projet.statut ? (
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full leading-tight ${
                              statutColors[projet.statut] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {projet.statut}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>

                      {/* COGS mini progress */}
                      <div className="flex items-center gap-2 min-w-0">
                        {pct != null ? (
                          <div className="flex items-center gap-2 w-full min-w-0">
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5 min-w-[40px]">
                              <div
                                className={`h-1.5 rounded-full ${cogsBarColor(pct)}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className={`text-[11px] font-medium shrink-0 tabular-nums ${
                              pct > 100 ? 'text-red-600' : pct > 80 ? 'text-orange-600' : 'text-gray-500'
                            }`}>
                              {pct}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>

                      {/* Next task */}
                      <div className="flex items-center min-w-0">
                        {hasNoTask ? (
                          <div className="flex items-center gap-1 text-red-500">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span className="text-[11px] font-medium">Aucune task</span>
                          </div>
                        ) : projet.nextTask ? (
                          <span
                            className={`text-[12px] truncate ${
                              isOverdue(projet.nextTaskDate)
                                ? 'text-red-600 font-medium'
                                : isToday(projet.nextTaskDate)
                                  ? 'text-orange-600 font-medium'
                                  : 'text-gray-600'
                            }`}
                          >
                            {projet.nextTask}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>

                      {/* Date */}
                      <div className="flex items-center">
                        {projet.nextTaskDate ? (
                          <span
                            className={`text-[11px] tabular-nums ${
                              isOverdue(projet.nextTaskDate)
                                ? 'text-red-500 font-medium'
                                : isToday(projet.nextTaskDate)
                                  ? 'text-orange-500 font-medium'
                                  : 'text-gray-400'
                            }`}
                          >
                            {formatDate(projet.nextTaskDate)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>

                      {/* Chevron */}
                      <div className="hidden md:flex items-center justify-center">
                        <ChevronRight
                          className={`w-3.5 h-3.5 transition-colors ${
                            isActive ? 'text-indigo-500' : 'text-gray-300 group-hover:text-gray-400'
                          }`}
                        />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile backdrop ── */}
      {selectedProjet && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden transition-opacity"
          onClick={() => setSelectedProjet(null)}
        />
      )}

      {/* ── Side panel ── */}
      <div
        className={`fixed md:relative right-0 top-0 h-full z-40 md:z-0 bg-white border-l border-gray-200 shadow-xl md:shadow-none overflow-y-auto transition-all duration-300 ease-in-out ${
          selectedProjet
            ? 'w-full md:w-[480px] translate-x-0 opacity-100'
            : 'w-0 md:w-0 translate-x-full md:translate-x-full opacity-0'
        }`}
      >
        {selectedProjet && <SidePanel projet={selectedProjet} onClose={() => setSelectedProjet(null)} />}
      </div>
    </div>
  )
}

/* ─── Side Panel Component ─── */

function SidePanel({ projet, onClose }: { projet: Projet; onClose: () => void }) {
  const pct = cogsPercent(projet)
  const hasNoTask = projet.statut === 'En cours' && !projet.nextTask

  return (
    <div className="p-6 min-w-[320px]">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Header */}
      <div className="pr-8 mb-5">
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">
          {projet.clientName || 'Client'}
        </p>
        <h2 className="text-xl font-bold text-gray-900 leading-tight">{projet.nom}</h2>
        {projet.ref && <p className="text-xs text-gray-400 mt-1">{projet.ref}</p>}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mb-6">
        {projet.phase && (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              phaseColors[projet.phase] || 'bg-gray-100 text-gray-600'
            }`}
          >
            {projet.phase}
          </span>
        )}
        {projet.statut && (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              statutColors[projet.statut] || 'bg-gray-100 text-gray-600'
            }`}
          >
            {projet.statut}
          </span>
        )}
        {projet.typeProjet && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            {projet.typeProjet}
          </span>
        )}
      </div>

      {/* Team */}
      {(projet.am || projet.da || projet.pc || projet.filmmaker) && (
        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
            Equipe
          </h3>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'AM', name: projet.am },
              { label: 'DA', name: projet.da },
              { label: 'PC', name: projet.pc },
              { label: 'Film', name: projet.filmmaker },
            ]
              .filter((m) => m.name)
              .map((member) => (
                <div
                  key={member.label}
                  className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5"
                >
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[8px] font-bold shrink-0">
                    {getInitials(member.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-400 font-medium leading-none">{member.label}</p>
                    <p className="text-xs text-gray-700 truncate leading-tight">{member.name}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Budget section */}
      <div className="mb-6">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
          Budget
        </h3>
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          {/* COGS progress */}
          <div>
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-xs font-medium text-gray-700">COGS</span>
              {pct != null && (
                <span
                  className={`text-xs font-bold tabular-nums ${
                    pct > 100 ? 'text-red-600' : pct > 80 ? 'text-orange-600' : 'text-emerald-600'
                  }`}
                >
                  {pct}%
                </span>
              )}
            </div>
            {pct != null && (
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full transition-all ${cogsBarColor(pct)}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white rounded-lg py-2 px-1">
                <p className="text-[10px] text-gray-400 mb-0.5">Budget</p>
                <p className="text-xs font-semibold text-gray-800">{fmt(projet.cogsBudget)}</p>
              </div>
              <div className="bg-white rounded-lg py-2 px-1">
                <p className="text-[10px] text-gray-400 mb-0.5">Reels</p>
                <p className="text-xs font-semibold text-gray-800">{fmt(projet.cogsReels)}</p>
              </div>
              <div className="bg-white rounded-lg py-2 px-1">
                <p className="text-[10px] text-gray-400 mb-0.5">Prevus</p>
                <p className="text-xs font-semibold text-gray-800">{fmt(projet.cogsPrevus)}</p>
              </div>
            </div>
          </div>

          {/* Detail rows */}
          <div className="space-y-1.5 pt-1 border-t border-gray-200">
            {projet.sizing != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Sizing</span>
                <span className="font-medium text-gray-700">{projet.sizing}h</span>
              </div>
            )}
            {projet.timeCreaBudget != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Time Crea Budget</span>
                <span className="font-medium text-gray-700">{projet.timeCreaBudget}h</span>
              </div>
            )}
            {projet.travelBudget != null && projet.travelBudget > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Travel</span>
                <span className="font-medium text-gray-700">{fmt(projet.travelBudget)}</span>
              </div>
            )}
            {projet.offreInitiale != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Offre initiale</span>
                <span className="font-medium text-gray-700">{fmt(projet.offreInitiale)}</span>
              </div>
            )}
            {projet.offreFinale != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Offre finale</span>
                <span className="font-medium text-gray-700">{fmt(projet.offreFinale)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Next task */}
      <div className="mb-6">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
          Prochaine task
        </h3>
        {hasNoTask ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">Aucune task prevue</p>
              <p className="text-xs text-red-500">Projet en cours sans prochaine action</p>
            </div>
          </div>
        ) : projet.nextTask ? (
          <div
            className={`rounded-xl px-4 py-3 ${
              isOverdue(projet.nextTaskDate)
                ? 'bg-red-50 border border-red-200'
                : isToday(projet.nextTaskDate)
                  ? 'bg-orange-50 border border-orange-200'
                  : 'bg-gray-50 border border-gray-200'
            }`}
          >
            <div className="flex items-start gap-2">
              <Calendar
                className={`w-4 h-4 mt-0.5 shrink-0 ${
                  isOverdue(projet.nextTaskDate)
                    ? 'text-red-500'
                    : isToday(projet.nextTaskDate)
                      ? 'text-orange-500'
                      : 'text-gray-400'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    isOverdue(projet.nextTaskDate)
                      ? 'text-red-700'
                      : isToday(projet.nextTaskDate)
                        ? 'text-orange-700'
                        : 'text-gray-800'
                  }`}
                >
                  {projet.nextTask}
                </p>
                {projet.nextTaskDate && (
                  <p
                    className={`text-xs mt-0.5 ${
                      isOverdue(projet.nextTaskDate)
                        ? 'text-red-500 font-medium'
                        : isToday(projet.nextTaskDate)
                          ? 'text-orange-500 font-medium'
                          : 'text-gray-400'
                    }`}
                  >
                    {isOverdue(projet.nextTaskDate) && 'En retard \u00b7 '}
                    {isToday(projet.nextTaskDate) && "Aujourd'hui \u00b7 "}
                    {new Date(projet.nextTaskDate).toLocaleDateString('fr-FR', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Aucune task</p>
        )}
      </div>

      {/* KPIs */}
      {(projet.ehr || projet.progression || projet.percentCogs) && (
        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
            Indicateurs
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {projet.ehr && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">EHR</p>
                <p className="text-sm font-bold text-gray-800">{projet.ehr}</p>
              </div>
            )}
            {projet.progression && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">Progression</p>
                <p className="text-sm font-bold text-gray-800">{projet.progression}</p>
              </div>
            )}
            {projet.percentCogs && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">% COGS</p>
                <p className="text-sm font-bold text-gray-800">{projet.percentCogs}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
