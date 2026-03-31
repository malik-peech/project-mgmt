'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Search, Calendar, X, ChevronRight, ChevronUp, ChevronDown, RefreshCw, AlertTriangle, TrendingUp, Plus, FileText, ExternalLink, Loader2, CheckCircle2, Circle } from 'lucide-react'
import { useData } from '@/hooks/useData'
import ForceNewTaskModal from '@/components/ForceNewTaskModal'
import type { Projet, StatutProjet, Cogs, Task } from '@/types'

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

const cogsStatutColors: Record<string, string> = {
  'A Approuver (CDP)': 'text-pink-700 bg-pink-50',
  'A Approuver (CSM)': 'text-teal-700 bg-teal-50',
  'A Approuver': 'text-pink-700 bg-pink-50',
  'Estimée': 'text-blue-700 bg-blue-50',
  'Engagée': 'text-yellow-700 bg-yellow-50',
  'A payer': 'text-orange-700 bg-orange-50',
  'Payée': 'text-green-700 bg-green-50',
  'Annulée': 'text-gray-400 bg-gray-50',
  'Refusée': 'text-red-700 bg-red-50',
}

const agenceColors: Record<string, string> = {
  'Peech': 'bg-orange-100 text-orange-700',
  'Newic': 'bg-blue-100 text-blue-700',
}

const fmt = (n?: number) =>
  n != null
    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
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
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

type SortField = 'ref' | 'clientName' | 'nom' | 'agence' | 'phase' | 'statut' | 'nextTask' | 'nextTaskDate'
type SortDir = 'asc' | 'desc'

export default function DashboardPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<StatutProjet | 'Tous'>('Tous')
  const [selectedProjet, setSelectedProjet] = useState<Projet | null>(null)
  const [search, setSearch] = useState('')
  const [agenceFilter, setAgenceFilter] = useState<string>('')
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const userName = session?.user?.name || ''
  const userRole = (session?.user as { role?: string })?.role || 'PM'

  // Simulation support: admin can simulate a PM's view
  const [simulatedPm, setSimulatedPm] = useState<string>('')
  useEffect(() => {
    if (userRole === 'Admin') {
      const check = () => setSimulatedPm(localStorage.getItem('peechpm_simulate_pm') || '')
      check()
      window.addEventListener('storage', check)
      const interval = setInterval(check, 1000)
      return () => {
        window.removeEventListener('storage', check)
        clearInterval(interval)
      }
    }
  }, [userRole])

  const effectivePm = userRole === 'Admin' && simulatedPm ? simulatedPm : ''
  const pmParam = userRole !== 'Admin' && userName ? `pm=${encodeURIComponent(userName)}` : effectivePm ? `pm=${encodeURIComponent(effectivePm)}` : ''

  const { data: projets, loading, error, revalidate } = useData<Projet[]>(
    session?.user?.name ? `/api/projets?${pmParam}` : null,
    { key: `projets-${pmParam}`, enabled: !!session?.user?.name }
  )

  // Fetch users for PM/DA dropdowns in panel
  const { data: allUsers } = useData<{ name: string; role: string }[]>(
    userRole === 'Admin' ? '/api/users' : null,
    { key: 'users-list', enabled: userRole === 'Admin' }
  )

  const pmOptions = useMemo(() => (allUsers ?? []).filter((u) => u.role === 'PM').map((u) => u.name), [allUsers])
  const daOptions = useMemo(() => (allUsers ?? []).filter((u) => u.role === 'DA').map((u) => u.name), [allUsers])

  const allProjets = projets ?? []

  // Extract unique agences for filter
  const agences = useMemo(() => {
    const set = new Set<string>()
    allProjets.forEach((p) => { if (p.agence) set.add(p.agence) })
    return Array.from(set).sort()
  }, [allProjets])

  const filtered = useMemo(() => {
    let list = allProjets
    if (activeTab !== 'Tous') list = list.filter((p) => p.statut === activeTab)
    if (agenceFilter) list = list.filter((p) => p.agence === agenceFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.nom.toLowerCase().includes(q) ||
          p.clientName?.toLowerCase().includes(q) ||
          p.ref?.toLowerCase().includes(q)
      )
    }
    // Sorting
    if (sortField) {
      list = [...list].sort((a, b) => {
        let va: string | undefined
        let vb: string | undefined
        switch (sortField) {
          case 'ref': va = a.ref; vb = b.ref; break
          case 'clientName': va = a.clientName; vb = b.clientName; break
          case 'nom': va = a.nom; vb = b.nom; break
          case 'agence': va = a.agence; vb = b.agence; break
          case 'phase': va = a.phase; vb = b.phase; break
          case 'statut': va = a.statut; vb = b.statut; break
          case 'nextTask': va = a.nextTask; vb = b.nextTask; break
          case 'nextTaskDate': va = a.nextTaskDate; vb = b.nextTaskDate; break
        }
        const cmp = (va || '').localeCompare(vb || '')
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [allProjets, activeTab, agenceFilter, search, sortField, sortDir])

  useEffect(() => {
    if (selectedProjet && !filtered.find((p) => p.id === selectedProjet.id)) {
      setSelectedProjet(null)
    }
  }, [filtered, selectedProjet])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortField(null); setSortDir('asc') }
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-0.5" />
      : <ChevronDown className="w-3 h-3 inline ml-0.5" />
  }

  if (loading && !projets) {
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

  if (error && !projets) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <AlertTriangle className="w-10 h-10 text-orange-400 mb-3" />
          <p className="text-lg font-medium mb-1">Impossible de charger les projets</p>
          <button onClick={() => revalidate()} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition mt-3">
            <RefreshCw className="w-4 h-4" /> Réessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh)] overflow-hidden">
      {/* Main list */}
      <div className="flex-1 overflow-auto min-w-0">
        <div className="p-6 md:p-8">
          {/* Header + Search */}
          <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Projets</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {filtered.length} projet{filtered.length !== 1 ? 's' : ''}
                {simulatedPm && <span className="ml-2 text-amber-600 font-medium">(vue {simulatedPm})</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Agence filter */}
              {agences.length > 1 && (
                <select
                  value={agenceFilter}
                  onChange={(e) => setAgenceFilter(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">Toutes agences</option>
                  {agences.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              )}
              {/* Search */}
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher code, client..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
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
                  <span className={`ml-1.5 text-xs ${activeTab === tab ? 'opacity-75' : 'opacity-50'}`}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg font-medium">Aucun projet</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="hidden md:grid grid-cols-[0.5fr_0.5fr_1fr_1.2fr_0.6fr_0.6fr_1.3fr_0.5fr_28px] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <button onClick={() => handleSort('ref')} className="text-left hover:text-gray-700 transition">
                  Code<SortIcon field="ref" />
                </button>
                <button onClick={() => handleSort('agence')} className="text-left hover:text-gray-700 transition">
                  Agence<SortIcon field="agence" />
                </button>
                <button onClick={() => handleSort('clientName')} className="text-left hover:text-gray-700 transition">
                  Client<SortIcon field="clientName" />
                </button>
                <button onClick={() => handleSort('nom')} className="text-left hover:text-gray-700 transition">
                  Projet<SortIcon field="nom" />
                </button>
                <button onClick={() => handleSort('phase')} className="text-left hover:text-gray-700 transition">
                  Phase<SortIcon field="phase" />
                </button>
                <button onClick={() => handleSort('statut')} className="text-left hover:text-gray-700 transition">
                  Statut<SortIcon field="statut" />
                </button>
                <button onClick={() => handleSort('nextTask')} className="text-left hover:text-gray-700 transition">
                  Next Task<SortIcon field="nextTask" />
                </button>
                <button onClick={() => handleSort('nextTaskDate')} className="text-left hover:text-gray-700 transition">
                  Date<SortIcon field="nextTaskDate" />
                </button>
                <span />
              </div>

              <div className="divide-y divide-gray-100">
                {filtered.map((projet) => {
                  const hasNoTask = projet.statut === 'En cours' && !projet.nextTask
                  const isActive = selectedProjet?.id === projet.id

                  return (
                    <button
                      key={projet.id}
                      onClick={() => setSelectedProjet(isActive ? null : projet)}
                      className={`w-full text-left grid grid-cols-1 md:grid-cols-[0.5fr_0.5fr_1fr_1.2fr_0.6fr_0.6fr_1.3fr_0.5fr_28px] gap-x-3 gap-y-1 px-4 py-2.5 transition-colors duration-150 group cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
                          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                      }`}
                    >
                      {/* Code */}
                      <div className="flex items-center min-w-0">
                        <span className="text-[11px] font-mono text-gray-500 truncate">
                          {projet.ref || '—'}
                        </span>
                      </div>

                      {/* Agence */}
                      <div className="flex items-center min-w-0">
                        {projet.agence ? (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full leading-tight ${agenceColors[projet.agence] || 'bg-gray-100 text-gray-600'}`}>
                            {projet.agence}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </div>

                      {/* Client */}
                      <div className="flex items-center min-w-0">
                        <span className="text-[13px] font-medium text-gray-800 truncate">
                          {projet.clientName || '—'}
                        </span>
                      </div>

                      {/* Projet */}
                      <div className="flex items-center min-w-0">
                        <span className="text-[13px] text-gray-600 truncate">{projet.nom}</span>
                      </div>

                      {/* Phase */}
                      <div className="flex items-center">
                        {projet.phase ? (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full leading-tight ${phaseColors[projet.phase] || 'bg-gray-100 text-gray-600'}`}>
                            {projet.phase}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </div>

                      {/* Statut */}
                      <div className="flex items-center">
                        {projet.statut ? (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full leading-tight ${statutColors[projet.statut] || 'bg-gray-100 text-gray-600'}`}>
                            {projet.statut}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </div>

                      {/* Next task */}
                      <div className="flex items-center min-w-0">
                        {hasNoTask ? (
                          <div className="flex items-center gap-1 text-amber-600">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span className="text-[11px] font-medium">Aucune task</span>
                          </div>
                        ) : projet.nextTask ? (
                          <span className={`text-[12px] truncate ${
                            isOverdue(projet.nextTaskDate) ? 'text-amber-600 font-medium'
                              : isToday(projet.nextTaskDate) ? 'text-orange-600 font-medium'
                                : 'text-gray-600'
                          }`}>
                            {projet.nextTask}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </div>

                      {/* Date */}
                      <div className="flex items-center">
                        {projet.nextTaskDate ? (
                          <span className={`text-[11px] tabular-nums ${
                            isOverdue(projet.nextTaskDate) ? 'text-amber-500 font-medium'
                              : isToday(projet.nextTaskDate) ? 'text-orange-500 font-medium'
                                : 'text-gray-400'
                          }`}>
                            {formatDate(projet.nextTaskDate)}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </div>

                      {/* Chevron */}
                      <div className="hidden md:flex items-center justify-center">
                        <ChevronRight className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-indigo-500' : 'text-gray-300 group-hover:text-gray-400'}`} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile backdrop */}
      {selectedProjet && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setSelectedProjet(null)} />
      )}

      {/* Side panel */}
      <div
        className={`fixed md:relative right-0 top-0 h-full z-40 md:z-0 bg-white border-l border-gray-200 shadow-xl md:shadow-none overflow-y-auto transition-all duration-300 ease-in-out ${
          selectedProjet
            ? 'w-full md:w-[480px] translate-x-0 opacity-100'
            : 'w-0 md:w-0 translate-x-full md:translate-x-full opacity-0'
        }`}
      >
        {selectedProjet && (
          <SidePanel
            projet={selectedProjet}
            onClose={() => setSelectedProjet(null)}
            pmParam={pmParam}
            allProjets={allProjets}
            onTasksChanged={revalidate}
            isAdmin={userRole === 'Admin'}
            pmOptions={pmOptions}
            daOptions={daOptions}
          />
        )}
      </div>
    </div>
  )
}

/* ─── Side Panel ─── */

function SidePanel({
  projet,
  onClose,
  pmParam,
  allProjets,
  onTasksChanged,
  isAdmin,
  pmOptions,
  daOptions,
}: {
  projet: Projet
  onClose: () => void
  pmParam: string
  allProjets: Projet[]
  onTasksChanged: () => void
  isAdmin: boolean
  pmOptions: string[]
  daOptions: string[]
}) {
  const [showForceTask, setShowForceTask] = useState<{ projetId: string; projetName: string } | null>(null)
  const [inlineTaskName, setInlineTaskName] = useState('')
  const [inlineTaskDate, setInlineTaskDate] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)

  // Editable PM/DA state
  const [editingPm, setEditingPm] = useState(false)
  const [editingDa, setEditingDa] = useState(false)
  const [localPm, setLocalPm] = useState(projet.pm || '')
  const [localDa, setLocalDa] = useState(projet.daOfficial || '')

  // Reset when project changes
  useEffect(() => {
    setLocalPm(projet.pm || '')
    setLocalDa(projet.daOfficial || '')
    setEditingPm(false)
    setEditingDa(false)
  }, [projet.id, projet.pm, projet.daOfficial])

  // Fetch tasks for this project
  const { data: projectTasks, revalidate: revalidateProjectTasks } = useData<Task[]>(
    `/api/tasks?projetId=${projet.id}`,
    { key: `tasks-projet-${projet.id}`, enabled: true, staleTime: 10_000 }
  )

  // Fetch COGS for this project
  const { data: projectCogs } = useData<Cogs[]>(
    `/api/cogs?projetId=${projet.id}`,
    { key: `cogs-projet-${projet.id}`, enabled: true, staleTime: 10_000 }
  )

  const tasks = projectTasks ?? []
  const cogs = projectCogs ?? []
  const openTasks = tasks.filter((t) => !t.done)

  const toggleTaskDone = async (task: Task) => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !task.done }),
      })
      revalidateProjectTasks()
      onTasksChanged()

      // If marking as done, show force new task modal
      if (!task.done) {
        setShowForceTask({ projetId: projet.id, projetName: projet.nom })
      }
    } catch {
      // silent
    }
  }

  const createInlineTask = async () => {
    if (!inlineTaskName.trim()) return
    setCreatingTask(true)
    try {
      const body: Record<string, string> = {
        name: inlineTaskName,
        projetId: projet.id,
      }
      if (inlineTaskDate) body.dueDate = inlineTaskDate
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setInlineTaskName('')
      setInlineTaskDate('')
      revalidateProjectTasks()
      onTasksChanged()
    } catch {
      // silent
    } finally {
      setCreatingTask(false)
    }
  }

  const updateProjetField = async (field: 'pm' | 'daOfficial', value: string) => {
    try {
      await fetch('/api/projets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projet.id, [field]: value }),
      })
      onTasksChanged() // revalidate projets
    } catch {
      // silent
    }
  }

  // Team members for display
  const teamMembers = [
    { label: 'PM', name: localPm, editable: true, editing: editingPm, setEditing: setEditingPm, options: pmOptions, onChange: (v: string) => { setLocalPm(v); updateProjetField('pm', v); setEditingPm(false) } },
    { label: 'DA', name: localDa, editable: true, editing: editingDa, setEditing: setEditingDa, options: daOptions, onChange: (v: string) => { setLocalDa(v); updateProjetField('daOfficial', v); setEditingDa(false) } },
    { label: 'AM', name: projet.am, editable: false },
    { label: 'PC', name: projet.pc, editable: false },
    { label: 'Film', name: projet.filmmaker, editable: false },
  ]

  return (
    <div className="p-6 min-w-[320px]">
      {/* Close */}
      <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
        <X className="w-5 h-5" />
      </button>

      {/* Header */}
      <div className="pr-8 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
            {projet.clientName || 'Client'}
          </p>
          {projet.ref && (
            <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
              {projet.ref}
            </span>
          )}
          {projet.agence && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${agenceColors[projet.agence] || 'bg-gray-100 text-gray-600'}`}>
              {projet.agence}
            </span>
          )}
        </div>
        <h2 className="text-xl font-bold text-gray-900 leading-tight">{projet.nom}</h2>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mb-6">
        {projet.phase && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${phaseColors[projet.phase] || 'bg-gray-100 text-gray-600'}`}>
            {projet.phase}
          </span>
        )}
        {projet.statut && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statutColors[projet.statut] || 'bg-gray-100 text-gray-600'}`}>
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
      <div className="mb-6">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Equipe</h3>
        <div className="flex flex-wrap gap-2">
          {teamMembers
            .filter((m) => m.name || (m.editable && isAdmin))
            .map((member) => {
              // Editable inline dropdown
              if (member.editable && isAdmin && member.editing) {
                return (
                  <div key={member.label} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5">
                    <div className="min-w-0">
                      <p className="text-[10px] text-indigo-500 font-medium leading-none mb-1">{member.label}</p>
                      <select
                        value={member.name || ''}
                        onChange={(e) => member.onChange!(e.target.value)}
                        onBlur={() => member.setEditing!(false)}
                        autoFocus
                        className="text-xs border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      >
                        <option value="">— Aucun —</option>
                        {member.options!.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={member.label}
                  className={`flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 ${
                    member.editable && isAdmin ? 'cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition' : ''
                  }`}
                  onClick={() => {
                    if (member.editable && isAdmin && member.setEditing) member.setEditing(true)
                  }}
                >
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[8px] font-bold shrink-0">
                    {getInitials(member.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-400 font-medium leading-none">{member.label}</p>
                    <p className="text-xs text-gray-700 truncate leading-tight">{member.name || '—'}</p>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Budget */}
      <div className="mb-6">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Budget</h3>
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white rounded-lg py-2 px-1">
              <p className="text-[10px] text-gray-400 mb-0.5">Budget COGS</p>
              <p className="text-xs font-semibold text-gray-800">{fmt(projet.cogsBudget)}</p>
            </div>
            <div className="bg-white rounded-lg py-2 px-1">
              <p className="text-[10px] text-gray-400 mb-0.5">Réels</p>
              <p className="text-xs font-semibold text-gray-800">{fmt(projet.cogsReels)}</p>
            </div>
            <div className="bg-white rounded-lg py-2 px-1">
              <p className="text-[10px] text-gray-400 mb-0.5">Prévus</p>
              <p className="text-xs font-semibold text-gray-800">{fmt(projet.cogsPrevus)}</p>
            </div>
          </div>
          {(projet.offreInitiale != null || projet.offreFinale != null) && (
            <div className="space-y-1 pt-2 border-t border-gray-200">
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
          )}
        </div>
      </div>

      {/* Devis signé */}
      {projet.devisSigne && projet.devisSigne.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Devis signé</h3>
          <div className="space-y-1.5">
            {projet.devisSigne.map((doc, i) => (
              <a
                key={i}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 transition group"
              >
                <FileText className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 shrink-0" />
                <span className="text-sm text-gray-700 group-hover:text-indigo-700 truncate flex-1">{doc.filename}</span>
                <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-indigo-400 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      <div className="mb-6">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
          Tasks ({openTasks.length} ouvertes)
        </h3>

        {/* Task list */}
        <div className="space-y-1 mb-3">
          {openTasks.length === 0 && (
            <p className="text-sm text-gray-400 py-2">Aucune task ouverte</p>
          )}
          {openTasks.slice(0, 10).map((task) => (
            <div key={task.id} className="flex items-center gap-2 py-1.5 group">
              <button onClick={() => toggleTaskDone(task)} className="shrink-0 text-gray-300 hover:text-green-500 transition">
                <Circle className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{task.name}</p>
              </div>
              {task.dueDate && (
                <span className={`text-[11px] tabular-nums shrink-0 ${
                  isOverdue(task.dueDate) ? 'text-amber-600' : isToday(task.dueDate) ? 'text-orange-500' : 'text-gray-400'
                }`}>
                  {formatDate(task.dueDate)}
                </span>
              )}
            </div>
          ))}
          {openTasks.length > 10 && (
            <p className="text-xs text-gray-400 pl-6">+ {openTasks.length - 10} autres</p>
          )}
        </div>

        {/* Inline task creation */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <Plus className="w-4 h-4 text-gray-300 shrink-0" />
          <input
            type="text"
            placeholder="Nouvelle task..."
            value={inlineTaskName}
            onChange={(e) => setInlineTaskName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inlineTaskName.trim()) createInlineTask()
            }}
            className="flex-1 text-sm border-none outline-none bg-transparent placeholder:text-gray-300"
          />
          <input
            type="date"
            value={inlineTaskDate}
            onChange={(e) => setInlineTaskDate(e.target.value)}
            className="text-xs text-gray-400 border-none outline-none bg-transparent w-28"
          />
          {inlineTaskName.trim() && (
            <button
              onClick={createInlineTask}
              disabled={creatingTask}
              className="text-indigo-600 hover:text-indigo-700 text-xs font-medium shrink-0"
            >
              {creatingTask ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ajouter'}
            </button>
          )}
        </div>
      </div>

      {/* COGS list */}
      {cogs.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
            COGS ({cogs.length})
          </h3>
          <div className="space-y-1">
            {cogs.map((c) => (
              <a
                key={c.id}
                href={`/cogs?id=${c.id}`}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{c.ressourceName || 'Ressource'}</p>
                  {c.categorie && <p className="text-[10px] text-gray-400">{c.categorie}</p>}
                </div>
                <span className="text-xs font-medium text-gray-700 tabular-nums shrink-0">
                  {fmt(c.montantEngageProd)}
                </span>
                {c.statut && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${cogsStatutColors[c.statut] || 'bg-gray-100 text-gray-600'}`}>
                    {c.statut}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Force new task modal */}
      {showForceTask && (
        <ForceNewTaskModal
          projetId={showForceTask.projetId}
          projetName={showForceTask.projetName}
          onClose={() => setShowForceTask(null)}
          onCreated={() => {
            setShowForceTask(null)
            revalidateProjectTasks()
            onTasksChanged()
          }}
        />
      )}
    </div>
  )
}
