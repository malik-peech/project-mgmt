'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Search, Calendar, X, ChevronRight, ChevronUp, ChevronDown, RefreshCw, AlertTriangle, TrendingUp, Plus, FileText, Loader2, CheckCircle2, Circle, Clock, MessageSquare, Send, CalendarX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useData } from '@/hooks/useData'
import ForceNewTaskModal from '@/components/ForceNewTaskModal'
import FileViewer from '@/components/FileViewer'
import ComboSelect from '@/components/ComboSelect'
import DatePicker from '@/components/DatePicker'
import ResizeHandle from '@/components/ResizeHandle'
import { useColumnWidths } from '@/hooks/useColumnWidths'
import type { Projet, StatutProjet, Cogs, Task, Attachment, Bdc } from '@/types'

const phaseColors: Record<string, string> = {
  'Démarrage': 'bg-amber-300 text-amber-900',
  'Conception': 'bg-sky-300 text-sky-900',
  'Production': 'bg-indigo-300 text-indigo-900',
  'Last modifs': 'bg-emerald-300 text-emerald-900',
  'Done': 'bg-purple-300 text-purple-900',
  'Archivé': 'bg-gray-300 text-gray-800',
}

const statutColors: Record<string, string> = {
  'En cours': 'bg-yellow-300 text-yellow-900',
  'Finalisation': 'bg-orange-300 text-orange-900',
  'Stand-by': 'bg-pink-300 text-pink-900',
  'Done': 'bg-green-400 text-green-900',
  'Tentative': 'bg-cyan-300 text-cyan-900',
  'Intention': 'bg-violet-300 text-violet-900',
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

type StatutTab = StatutProjet | 'Tous' | 'Terminés'
const statutTabs: StatutTab[] = ['Tous', 'En cours', 'Finalisation', 'Stand-by', 'Terminés']

/** Match the "Terminés" tab: statut Done OR phase Done/Archivé. */
function isTermine(p: Projet): boolean {
  return p.statut === 'Done' || p.phase === 'Done' || p.phase === 'Archivé'
}

/** Parse a YYYY-MM-DD date string as local time (avoids UTC timezone shift) */
function parseLocalDate(dateStr: string): Date {
  // Take only the YYYY-MM-DD part (ignores time component if present)
  const parts = dateStr.substring(0, 10).split('-').map(Number)
  if (parts.length < 3 || parts.some(isNaN)) return new Date(NaN)
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function isOverdue(dateStr?: string) {
  if (!dateStr) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return parseLocalDate(dateStr) < today
}

function isToday(dateStr?: string) {
  if (!dateStr) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = parseLocalDate(dateStr)
  return d.getTime() === today.getTime()
}

function getInitials(name?: string) {
  if (!name) return ''
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—'
  const d = parseLocalDate(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

type SortField = 'ref' | 'clientName' | 'nom' | 'agence' | 'bu' | 'phase' | 'statut' | 'nextTask' | 'nextTaskDate' | 'dateFin' | 'pm' | 'daOfficial'
type SortDir = 'asc' | 'desc'

export default function DashboardPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<StatutTab>('Tous')
  const [selectedProjet, setSelectedProjet] = useState<Projet | null>(null)
  const [search, setSearch] = useState('')
  const [agenceFilter, setAgenceFilter] = useState<string>('')
  const [pmFilter, setPmFilter] = useState<string>('')
  const [daFilter, setDaFilter] = useState<string>('')
  const [noTaskFilter, setNoTaskFilter] = useState(false)
  const [overdueFinFilter, setOverdueFinFilter] = useState(false)
  const [editingDateFin, setEditingDateFin] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const userName = session?.user?.name || ''
  const userRole = (session?.user as { role?: string })?.role || 'PM'

  // Resizable columns for the Projets list. Widths are stored in px and
  // persisted in localStorage. A separate key per role because the Admin
  // view has 2 extra columns (PM, DA).
  const projetColDefaults = useMemo(
    () => ({
      ref: 70, agence: 70, bu: 70, client: 140, projet: 180,
      phase: 90, statut: 90, pm: 90, da: 90, nextTask: 200, date: 80, dateFin: 104,
    }),
    []
  )
  const { widths: pCol, startResize: startProjetColResize } = useColumnWidths(
    userRole === 'Admin' ? 'projets.list.widths.admin' : 'projets.list.widths.base',
    projetColDefaults,
    { min: 50 }
  )
  // Build grid-template-columns string from current widths. 28px is the chevron column.
  const projetGridCols = userRole === 'Admin'
    ? `${pCol.ref}px ${pCol.agence}px ${pCol.bu}px ${pCol.client}px ${pCol.projet}px ${pCol.phase}px ${pCol.statut}px ${pCol.pm}px ${pCol.da}px ${pCol.nextTask}px ${pCol.date}px ${pCol.dateFin}px 28px`
    : `${pCol.ref}px ${pCol.agence}px ${pCol.bu}px ${pCol.client}px ${pCol.projet}px ${pCol.phase}px ${pCol.statut}px ${pCol.nextTask}px ${pCol.date}px ${pCol.dateFin}px 28px`

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
  const pmParam = userRole === 'PM' && userName
    ? `pm=${encodeURIComponent(userName)}`
    : userRole === 'DA' && userName
    ? `da=${encodeURIComponent(userName)}`
    : effectivePm
    ? `pm=${encodeURIComponent(effectivePm)}`
    : ''

  const projetsQuery = [pmParam, 'all=1'].filter(Boolean).join('&')
  const { data: projets, loading, error, revalidate } = useData<Projet[]>(
    session?.user?.name ? `/api/projets?${projetsQuery}` : null,
    { key: `projets-${projetsQuery}`, enabled: !!session?.user?.name }
  )

  // Fetch users for PM/DA dropdowns in panel
  const { data: allUsers } = useData<{ name: string; role: string }[]>(
    '/api/users',
    { key: 'users-list', enabled: !!session?.user?.name }
  )

  // Fetch tasks for accurate overdue count
  const { data: allTasks } = useData<Task[]>(
    session?.user?.name ? `/api/tasks?${pmParam}` : null,
    { key: `tasks-overdue-count-${pmParam}`, enabled: !!session?.user?.name, staleTime: 30_000 }
  )

  const pmOptions = useMemo(() => (allUsers ?? []).filter((u) => u.role === 'PM').map((u) => u.name), [allUsers])
  const daOptions = useMemo(() => (allUsers ?? []).filter((u) => u.role === 'DA').map((u) => u.name), [allUsers])

  const router = useRouter()
  const allProjets = projets ?? []

  // KPI indicators
  const projetsWithoutTasks = useMemo(() =>
    allProjets.filter((p) => p.statut === 'En cours' && !p.nextTask),
    [allProjets]
  )
  const overdueTaskCount = useMemo(() => {
    if (!allTasks) return 0
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return allTasks.filter((t) => {
      if (!t.dueDate) return false
      // Only count tasks assigned to the logged-in user (Admin sees all)
      if (userRole !== 'Admin' && t.assigneManuel !== userName) return false
      const d = new Date(t.dueDate + 'T00:00:00'); d.setHours(0, 0, 0, 0)
      return d < today
    }).length
  }, [allTasks, userName, userRole])

  // Active projets whose planned end date (Date de finalisation prévue) is past.
  const overdueFinCount = useMemo(
    () => allProjets.filter((p) => !isTermine(p) && isOverdue(p.dateFinalisationPrevue)).length,
    [allProjets]
  )

  const patchProjetDateFin = async (id: string, value: string) => {
    try {
      await fetch('/api/projets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, dateFinalisationPrevue: value || null }),
      })
      revalidate()
    } catch {
      // silent
    }
  }

  // Extract unique agences for filter
  const agences = useMemo(() => {
    const set = new Set<string>()
    allProjets.forEach((p) => { if (p.agence) set.add(p.agence) })
    return Array.from(set).sort()
  }, [allProjets])

  const filtered = useMemo(() => {
    let list = allProjets
    if (activeTab === 'Terminés') list = list.filter(isTermine)
    else if (activeTab === 'Tous') list = list.filter((p) => !isTermine(p))
    else list = list.filter((p) => p.statut === activeTab && !isTermine(p))
    if (agenceFilter) list = list.filter((p) => p.agence === agenceFilter)
    if (pmFilter) list = list.filter((p) => p.pm === pmFilter || p.pm2 === pmFilter)
    if (daFilter) list = list.filter((p) => p.daOfficial === daFilter)
    if (noTaskFilter) list = list.filter((p) => p.statut === 'En cours' && !p.nextTask)
    if (overdueFinFilter) list = list.filter((p) => isOverdue(p.dateFinalisationPrevue))
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
          case 'bu': va = a.bu; vb = b.bu; break
          case 'phase': va = a.phase; vb = b.phase; break
          case 'statut': va = a.statut; vb = b.statut; break
          case 'nextTask': va = a.nextTask; vb = b.nextTask; break
          case 'nextTaskDate': va = a.nextTaskDate; vb = b.nextTaskDate; break
          case 'dateFin': va = a.dateFinalisationPrevue; vb = b.dateFinalisationPrevue; break
          case 'pm': va = a.pm; vb = b.pm; break
          case 'daOfficial': va = a.daOfficial; vb = b.daOfficial; break
        }
        const cmp = (va || '').localeCompare(vb || '')
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [allProjets, activeTab, agenceFilter, pmFilter, daFilter, noTaskFilter, overdueFinFilter, search, sortField, sortDir])

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
              {/* Admin PM/DA filters */}
              {userRole === 'Admin' && (
                <>
                  <select
                    value={pmFilter}
                    onChange={(e) => setPmFilter(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">Tous PM</option>
                    {pmOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <select
                    value={daFilter}
                    onChange={(e) => setDaFilter(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">Tous DA</option>
                    {daOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </>
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
              const count =
                tab === 'Terminés'
                  ? allProjets.filter(isTermine).length
                  : tab === 'Tous'
                  ? allProjets.filter((p) => !isTermine(p)).length
                  : allProjets.filter((p) => p.statut === tab && !isTermine(p)).length
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

          {/* Indicators */}
          <div className="flex gap-3 mb-5">
            <button
              onClick={() => setNoTaskFilter(!noTaskFilter)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
                noTaskFilter
                  ? 'bg-amber-50 border-amber-300 text-amber-700 ring-2 ring-amber-200'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-amber-300 hover:bg-amber-50'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>{projetsWithoutTasks.length} projet{projetsWithoutTasks.length !== 1 ? 's' : ''} sans task</span>
            </button>
            <button
              onClick={() => router.push('/tasks?filter=overdue')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:border-orange-300 hover:bg-orange-50 transition"
            >
              <Clock className="w-4 h-4 text-orange-500" />
              <span>{overdueTaskCount} task{overdueTaskCount !== 1 ? 's' : ''} en retard</span>
            </button>
            <button
              onClick={() => setOverdueFinFilter(!overdueFinFilter)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
                overdueFinFilter
                  ? 'bg-red-50 border-red-300 text-red-700 ring-2 ring-red-200'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-red-300 hover:bg-red-50'
              }`}
            >
              <CalendarX className="w-4 h-4 text-red-500" />
              <span>{overdueFinCount} finalisation{overdueFinCount !== 1 ? 's' : ''} dépassée{overdueFinCount !== 1 ? 's' : ''}</span>
            </button>
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
              <div
                className="hidden md:grid md:grid-cols-[var(--projet-grid)] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"
                style={{ ['--projet-grid' as string]: projetGridCols } as Record<string, string>}
              >
                <div className="relative text-left overflow-hidden">
                  <button onClick={() => handleSort('ref')} className="truncate hover:text-gray-700 transition">
                    Code<SortIcon field="ref" />
                  </button>
                  <ResizeHandle onMouseDown={(e) => startProjetColResize('ref', e)} />
                </div>
                <div className="relative text-left overflow-hidden">
                  <button onClick={() => handleSort('agence')} className="truncate hover:text-gray-700 transition">
                    Agence<SortIcon field="agence" />
                  </button>
                  <ResizeHandle onMouseDown={(e) => startProjetColResize('agence', e)} />
                </div>
                <div className="relative text-left overflow-hidden">
                  <button onClick={() => handleSort('bu')} className="truncate hover:text-gray-700 transition">
                    BU<SortIcon field="bu" />
                  </button>
                  <ResizeHandle onMouseDown={(e) => startProjetColResize('bu', e)} />
                </div>
                <div className="relative text-left overflow-hidden">
                  <button onClick={() => handleSort('clientName')} className="truncate hover:text-gray-700 transition">
                    Client<SortIcon field="clientName" />
                  </button>
                  <ResizeHandle onMouseDown={(e) => startProjetColResize('client', e)} />
                </div>
                <div className="relative text-left overflow-hidden">
                  <button onClick={() => handleSort('nom')} className="truncate hover:text-gray-700 transition">
                    Projet<SortIcon field="nom" />
                  </button>
                  <ResizeHandle onMouseDown={(e) => startProjetColResize('projet', e)} />
                </div>
                <div className="relative text-left overflow-hidden">
                  <button onClick={() => handleSort('phase')} className="truncate hover:text-gray-700 transition">
                    Phase<SortIcon field="phase" />
                  </button>
                  <ResizeHandle onMouseDown={(e) => startProjetColResize('phase', e)} />
                </div>
                <div className="relative text-left overflow-hidden">
                  <button onClick={() => handleSort('statut')} className="truncate hover:text-gray-700 transition">
                    Statut<SortIcon field="statut" />
                  </button>
                  <ResizeHandle onMouseDown={(e) => startProjetColResize('statut', e)} />
                </div>
                {userRole === 'Admin' && (
                  <>
                    <div className="relative text-left overflow-hidden">
                      <button onClick={() => handleSort('pm')} className="truncate hover:text-gray-700 transition">
                        PM<SortIcon field="pm" />
                      </button>
                      <ResizeHandle onMouseDown={(e) => startProjetColResize('pm', e)} />
                    </div>
                    <div className="relative text-left overflow-hidden">
                      <button onClick={() => handleSort('daOfficial')} className="truncate hover:text-gray-700 transition">
                        DA<SortIcon field="daOfficial" />
                      </button>
                      <ResizeHandle onMouseDown={(e) => startProjetColResize('da', e)} />
                    </div>
                  </>
                )}
                <div className="relative text-left overflow-hidden">
                  <button onClick={() => handleSort('nextTask')} className="truncate hover:text-gray-700 transition">
                    Next Task<SortIcon field="nextTask" />
                  </button>
                  <ResizeHandle onMouseDown={(e) => startProjetColResize('nextTask', e)} />
                </div>
                <div className="relative text-left overflow-hidden">
                  <button onClick={() => handleSort('nextTaskDate')} className="truncate hover:text-gray-700 transition">
                    Date<SortIcon field="nextTaskDate" />
                  </button>
                  <ResizeHandle onMouseDown={(e) => startProjetColResize('date', e)} />
                </div>
                <div className="relative text-left overflow-hidden">
                  <button onClick={() => handleSort('dateFin')} className="truncate hover:text-gray-700 transition">
                    Fin<SortIcon field="dateFin" />
                  </button>
                  <ResizeHandle onMouseDown={(e) => startProjetColResize('dateFin', e)} />
                </div>
                <span />
              </div>

              <div className="divide-y divide-gray-100">
                {filtered.map((projet) => {
                  const hasNoTask = projet.statut === 'En cours' && !projet.nextTask
                  const isActive = selectedProjet?.id === projet.id

                  return (
                    <div
                      key={projet.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedProjet(isActive ? null : projet)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedProjet(isActive ? null : projet)
                        }
                      }}
                      className={`w-full text-left grid grid-cols-1 md:grid-cols-[var(--projet-grid)] gap-x-3 gap-y-1 px-4 py-2.5 transition-colors duration-150 group cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
                          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                      }`}
                      style={{ ['--projet-grid' as string]: projetGridCols } as Record<string, string>}
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

                      {/* BU */}
                      <div className="flex items-center min-w-0">
                        {projet.bu ? (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 truncate">{projet.bu}</span>
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

                      {/* PM / DA (admin only) */}
                      {userRole === 'Admin' && (
                        <>
                          <div className="flex items-center min-w-0">
                            {projet.pm || projet.pm2 ? (
                              <span className="text-[11px] text-gray-600 truncate" title={[projet.pm, projet.pm2].filter(Boolean).join(' / ')}>
                                {projet.pm || projet.pm2}
                                {projet.pm && projet.pm2 && <span className="text-gray-400"> +1</span>}
                              </span>
                            ) : <span className="text-xs text-gray-300">—</span>}
                          </div>
                          <div className="flex items-center min-w-0">
                            {projet.pasDeDa ? (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 truncate" title="Pas de DA">Pas de DA</span>
                            ) : projet.daOfficial ? (
                              <span className="text-[11px] text-gray-600 truncate" title={projet.daOfficial}>{projet.daOfficial}</span>
                            ) : <span className="text-xs text-gray-300">—</span>}
                          </div>
                        </>
                      )}

                      {/* Next task */}
                      <div className="flex items-center min-w-0">
                        {hasNoTask ? (
                          <div className="flex items-center gap-1 text-yellow-500">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span className="text-[11px] font-medium">Aucune task</span>
                          </div>
                        ) : projet.nextTask ? (
                          <span className={`text-[12px] truncate font-medium ${
                            isOverdue(projet.nextTaskDate) ? 'text-red-600'
                              : isToday(projet.nextTaskDate) ? 'text-green-600'
                              : 'text-gray-900'
                          }`}>
                            {projet.nextTask}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </div>

                      {/* Date */}
                      <div className="flex items-center">
                        {projet.nextTaskDate ? (
                          <span className={`text-[11px] tabular-nums font-medium ${
                            isOverdue(projet.nextTaskDate) ? 'text-red-600'
                              : isToday(projet.nextTaskDate) ? 'text-green-600'
                              : 'text-gray-900'
                          }`}>
                            {formatDate(projet.nextTaskDate)}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </div>

                      {/* Date fin (éditable) */}
                      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                        {editingDateFin === projet.id ? (
                          <DatePicker
                            value={projet.dateFinalisationPrevue || ''}
                            onChange={(v) => { patchProjetDateFin(projet.id, v); setEditingDateFin(null) }}
                            size="sm"
                            clearable
                            autoOpen
                            className="w-32"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditingDateFin(projet.id) }}
                            className={`text-[11px] tabular-nums font-medium rounded px-1 py-0.5 hover:bg-gray-100 transition ${
                              isOverdue(projet.dateFinalisationPrevue) ? 'text-red-600' : projet.dateFinalisationPrevue ? 'text-gray-700' : 'text-gray-300'
                            }`}
                            title="Modifier la date de fin de projet"
                          >
                            {projet.dateFinalisationPrevue ? formatDate(projet.dateFinalisationPrevue) : '—'}
                          </button>
                        )}
                      </div>

                      {/* Chevron */}
                      <div className="hidden md:flex items-center justify-center">
                        <ChevronRight className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-indigo-500' : 'text-gray-300 group-hover:text-gray-400'}`} />
                      </div>
                    </div>
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
            pmOptions={pmOptions}
            daOptions={daOptions}
            userName={userName}
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
  pmOptions,
  daOptions,
  userName,
}: {
  projet: Projet
  onClose: () => void
  pmParam: string
  allProjets: Projet[]
  onTasksChanged: () => void
  pmOptions: string[]
  daOptions: string[]
  userName: string
}) {
  const [showForceTask, setShowForceTask] = useState<{ projetId: string; projetName: string; projetRef?: string; clientName?: string } | null>(null)
  const [inlineTaskName, setInlineTaskName] = useState('')
  const [inlineTaskDate, setInlineTaskDate] = useState('')
  const [viewer, setViewer] = useState<{ url: string; filename: string } | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)

  // Editable PM/PM2/DA/Phase state
  const [editingPm, setEditingPm] = useState(false)
  const [editingPm2, setEditingPm2] = useState(false)
  const [editingDa, setEditingDa] = useState(false)
  const [editingPhase, setEditingPhase] = useState(false)
  const [localPm, setLocalPm] = useState(projet.pm || '')
  const [localPm2, setLocalPm2] = useState(projet.pm2 || '')
  const [localDa, setLocalDa] = useState(projet.daOfficial || '')
  const [localPasDeDa, setLocalPasDeDa] = useState(!!projet.pasDeDa)
  const [localPhase, setLocalPhase] = useState(projet.phase || '')
  const [localDateFin, setLocalDateFin] = useState(projet.dateFinalisationPrevue || '')
  const [localFacturable, setLocalFacturable] = useState(!!projet.facturable100)

  // Commande section: BDC select, Numéro de commande text, Bon de commande attachments
  const [localBdc, setLocalBdc] = useState<string>(projet.bdc || '')
  const [editingBdc, setEditingBdc] = useState(false)
  const [localNumeroCommande, setLocalNumeroCommande] = useState(projet.numeroCommande || '')
  const [bonDeCommandeFiles, setBonDeCommandeFiles] = useState<(Attachment & { id?: string })[]>(
    (projet.bonDeCommande as (Attachment & { id?: string })[] | undefined) || []
  )
  const [uploadingBdc, setUploadingBdc] = useState(false)
  const bdcFileInputRef = useRef<HTMLInputElement | null>(null)

  // Reset when project changes
  useEffect(() => {
    setLocalPm(projet.pm || '')
    setLocalPm2(projet.pm2 || '')
    setLocalDa(projet.daOfficial || '')
    setLocalPasDeDa(!!projet.pasDeDa)
    setLocalPhase(projet.phase || '')
    setLocalDateFin(projet.dateFinalisationPrevue || '')
    setLocalFacturable(!!projet.facturable100)
    setLocalBdc(projet.bdc || '')
    setLocalNumeroCommande(projet.numeroCommande || '')
    setBonDeCommandeFiles((projet.bonDeCommande as (Attachment & { id?: string })[] | undefined) || [])
    setEditingPm(false)
    setEditingPm2(false)
    setEditingDa(false)
    setEditingPhase(false)
    setEditingBdc(false)
  }, [projet.id, projet.pm, projet.pm2, projet.daOfficial, projet.pasDeDa, projet.phase, projet.dateFinalisationPrevue, projet.facturable100, projet.bdc, projet.numeroCommande, projet.bonDeCommande])

  // Fetch tasks for this project (open + done, so we can show today's completed tasks)
  const { data: projectTasks, revalidate: revalidateProjectTasks } = useData<Task[]>(
    `/api/tasks?projetId=${projet.id}&done=all`,
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
  // Keep completed tasks visible for the day they were checked so the user
  // can un-check in case of mistake. After the day is over, the API's Done
  // filter will drop them. Shown as checked + strikethrough.
  const todayDoneTasks = tasks.filter((t) => t.done && isToday(t.dueDate))
  // Merge for display: open first, then today's completed
  const visibleTasks = [...openTasks, ...todayDoneTasks]

  const toggleTaskDone = async (task: Task) => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !task.done }),
      })
      revalidateProjectTasks()
      onTasksChanged()

      // If marking as done, only show popup if no other open tasks remain for this project
      if (!task.done) {
        const remainingOpen = openTasks.filter((t) => t.id !== task.id)
        if (remainingOpen.length === 0) {
          setShowForceTask({ projetId: projet.id, projetName: projet.nom, projetRef: projet.ref, clientName: projet.clientName })
        }
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
      // Auto-assign to logged-in user
      if (userName) body.assigneManuel = userName
      // Default to today if no date specified
      if (inlineTaskDate) {
        body.dueDate = inlineTaskDate
      } else {
        const d = new Date()
        body.dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
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

  const updateProjetField = async (
    field: 'pm' | 'pm2' | 'daOfficial' | 'pasDeDa' | 'phase' | 'dateFinalisationPrevue' | 'facturable100' | 'bdc' | 'numeroCommande',
    value: string | boolean,
  ) => {
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

  const updateProjetFields = async (patch: Record<string, string | boolean | null>) => {
    try {
      await fetch('/api/projets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projet.id, ...patch }),
      })
      onTasksChanged()
    } catch {
      // silent
    }
  }

  // Upload a "Bon de commande" attachment. Reuses the projets attachment endpoint
  // exposed via /api/onboarding/[id]/upload (whitelist allows the "Bon de commande" field).
  const uploadBonDeCommande = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingBdc(true)
    try {
      const fd = new FormData()
      for (const f of Array.from(files)) fd.append('files', f)
      const res = await fetch(
        `/api/onboarding/${projet.id}/upload?field=${encodeURIComponent('Bon de commande')}`,
        { method: 'POST', body: fd },
      )
      if (res.ok) {
        const json = await res.json()
        const updated = (json.fields?.['Bon de commande'] as (Attachment & { id?: string })[]) || []
        setBonDeCommandeFiles(updated)
        onTasksChanged()
      }
    } finally {
      setUploadingBdc(false)
      if (bdcFileInputRef.current) bdcFileInputRef.current.value = ''
    }
  }

  const deleteBonDeCommande = async (att: Attachment & { id?: string }) => {
    const params = new URLSearchParams()
    if (att.id) params.set('attachmentId', att.id)
    else params.set('attachmentUrl', att.url)
    params.set('field', 'Bon de commande')
    const res = await fetch(`/api/onboarding/${projet.id}/upload?${params.toString()}`, { method: 'DELETE' })
    if (res.ok) {
      setBonDeCommandeFiles((curr) => curr.filter((a) => a.url !== att.url))
      onTasksChanged()
    }
  }

  // Special sentinel for the "Pas de DA" option in the DA dropdown. When the
  // user picks it, we clear DA (official) and flip the Pas de DA checkbox on.
  const NO_DA = '__PAS_DE_DA__'

  const handleDaChange = (v: string) => {
    if (v === NO_DA) {
      setLocalDa('')
      setLocalPasDeDa(true)
      updateProjetFields({ daOfficial: '', pasDeDa: true })
    } else {
      setLocalDa(v)
      // Picking a real DA also clears the "Pas de DA" flag if it was on.
      if (localPasDeDa) setLocalPasDeDa(false)
      updateProjetFields({ daOfficial: v, ...(localPasDeDa ? { pasDeDa: false } : {}) })
    }
    setEditingDa(false)
  }

  const daDisplayValue = localPasDeDa ? NO_DA : localDa
  const daOptionsWithNoDa = [
    { value: NO_DA, label: 'Pas de DA' },
    ...daOptions.map((o) => ({ value: o, label: o })),
  ]

  // Team members for display
  const teamMembers = [
    { label: 'PM', name: localPm, editing: editingPm, setEditing: setEditingPm, options: pmOptions.map((o) => ({ value: o, label: o })), displayValue: localPm, onChange: (v: string) => { setLocalPm(v); updateProjetField('pm', v); setEditingPm(false) } },
    { label: 'PM2', name: localPm2, editing: editingPm2, setEditing: setEditingPm2, options: pmOptions.map((o) => ({ value: o, label: o })), displayValue: localPm2, onChange: (v: string) => { setLocalPm2(v); updateProjetField('pm2', v); setEditingPm2(false) } },
    { label: 'DA', name: localPasDeDa ? 'Pas de DA' : localDa, editing: editingDa, setEditing: setEditingDa, options: daOptionsWithNoDa, displayValue: daDisplayValue, onChange: handleDaChange },
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
        {/* Phase — editable inline */}
        {editingPhase ? (
          <select
            value={localPhase}
            onChange={(e) => {
              const v = e.target.value
              setLocalPhase(v)
              updateProjetField('phase', v)
              setEditingPhase(false)
            }}
            onBlur={() => setEditingPhase(false)}
            autoFocus
            className="text-xs border border-indigo-300 rounded-full px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            {(['Démarrage', 'Conception', 'Production', 'Last modifs', 'Done', 'Archivé'] as const).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setEditingPhase(true)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full transition hover:opacity-75 ${
              localPhase ? phaseColors[localPhase] || 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-400 border border-dashed border-gray-300'
            }`}
            title="Cliquer pour changer la phase"
          >
            {localPhase || '+ phase'}
          </button>
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
          {teamMembers.map((member) => {
            if (member.editing) {
              return (
                <div key={member.label} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 min-w-[140px]">
                  <div className="min-w-0 w-full">
                    <p className="text-[10px] text-indigo-500 font-medium leading-none mb-1">{member.label}</p>
                    <ComboSelect
                      options={[{ value: '', label: '— Aucun —' }, ...member.options]}
                      value={member.displayValue || ''}
                      onChange={member.onChange}
                      onClose={() => member.setEditing(false)}
                      placeholder="— Aucun —"
                      size="sm"
                      autoOpen
                    />
                  </div>
                </div>
              )
            }

            return (
              <div
                key={member.label}
                className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition"
                onClick={() => member.setEditing(true)}
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

      {/* Date finalisation + Facturable 100% */}
      <div className="mb-6 space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Date de finalisation prévue
          </label>
          <DatePicker
            value={localDateFin}
            onChange={(v) => {
              setLocalDateFin(v)
              updateProjetField('dateFinalisationPrevue', v)
            }}
            placeholder="Aucune date"
            clearable
            size="sm"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={localFacturable}
            onChange={(e) => {
              const v = e.target.checked
              setLocalFacturable(v)
              updateProjetField('facturable100', v)
            }}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">Facturable 100%</span>
        </label>
      </div>

      {/* Devis signé */}
      {projet.devisSigne && projet.devisSigne.length > 0 && (
        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Devis signé</h3>
          <div className="space-y-1.5">
            {projet.devisSigne.map((doc, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setViewer({ url: doc.url, filename: doc.filename })}
                className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 transition group text-left"
              >
                <FileText className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 shrink-0" />
                <span className="text-sm text-gray-700 group-hover:text-indigo-700 truncate flex-1">{doc.filename}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Commande */}
      <div className="mb-6">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Commande</h3>
        <div className="space-y-3">
          {/* BDC select */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">BDC</label>
            {editingBdc ? (
              <select
                value={localBdc}
                onChange={(e) => {
                  const v = e.target.value
                  setLocalBdc(v)
                  updateProjetField('bdc', v)
                  setEditingBdc(false)
                }}
                onBlur={() => setEditingBdc(false)}
                autoFocus
                className="w-full text-sm border border-indigo-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">—</option>
                {(['Numéro à référencer', 'Déposer sur Chorus', 'Pas de bon de commande'] as Bdc[]).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={() => setEditingBdc(true)}
                className="w-full text-left text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition"
              >
                {localBdc || <span className="text-gray-400">Choisir…</span>}
              </button>
            )}
          </div>

          {/* Numéro de commande */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Numéro de commande</label>
            <input
              type="text"
              value={localNumeroCommande}
              onChange={(e) => setLocalNumeroCommande(e.target.value)}
              onBlur={() => {
                if ((localNumeroCommande || '') !== (projet.numeroCommande || '')) {
                  updateProjetField('numeroCommande', localNumeroCommande)
                }
              }}
              placeholder="Numéro…"
              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300"
            />
          </div>

          {/* Bon de commande (attachments) */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Bon de commande</label>
            <div className="space-y-1.5 mb-2">
              {bonDeCommandeFiles.length === 0 && (
                <p className="text-xs text-gray-400 italic">Aucun fichier</p>
              )}
              {bonDeCommandeFiles.map((doc) => (
                <div
                  key={doc.id || doc.url}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg group"
                >
                  <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                  <button
                    type="button"
                    onClick={() => setViewer({ url: doc.url, filename: doc.filename })}
                    className="text-sm text-gray-700 hover:text-indigo-700 truncate flex-1 text-left"
                  >
                    {doc.filename}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteBonDeCommande(doc)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition shrink-0"
                    title="Supprimer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <input
              ref={bdcFileInputRef}
              type="file"
              multiple
              onChange={(e) => uploadBonDeCommande(e.target.files)}
              className="hidden"
              id={`bdc-upload-${projet.id}`}
            />
            <label
              htmlFor={`bdc-upload-${projet.id}`}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition"
            >
              {uploadingBdc ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Envoi…
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter un fichier
                </>
              )}
            </label>
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="mb-6">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
          Tasks ({openTasks.length} ouverte{openTasks.length > 1 ? 's' : ''}
          {todayDoneTasks.length > 0 && ` · ${todayDoneTasks.length} faite${todayDoneTasks.length > 1 ? 's' : ''} aujourd'hui`})
        </h3>

        {/* Task list: open tasks + tasks done today (checked + strikethrough) */}
        <div className="space-y-1 mb-3">
          {visibleTasks.length === 0 && (
            <p className="text-sm text-gray-400 py-2">Aucune task</p>
          )}
          {visibleTasks.slice(0, 12).map((task) => (
            <div key={task.id} className="flex items-center gap-2 py-1.5 group">
              <button
                onClick={() => toggleTaskDone(task)}
                className={`shrink-0 transition ${
                  task.done
                    ? 'text-green-500 hover:text-gray-400'
                    : 'text-gray-300 hover:text-green-500'
                }`}
                title={task.done ? 'Décocher' : 'Marquer comme fait'}
              >
                {task.done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${task.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {task.name}
                </p>
              </div>
              {(task.assigneManuel || task.assigneeName) && (
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 ${
                    task.done ? 'bg-gray-100 text-gray-400' : 'bg-indigo-100 text-indigo-600'
                  }`}
                  title={task.assigneManuel || task.assigneeName}
                >
                  {getInitials(task.assigneManuel || task.assigneeName)}
                </span>
              )}
              {task.dueDate && (
                <span className={`text-[11px] tabular-nums shrink-0 ${
                  task.done ? 'text-gray-300 line-through' :
                  isOverdue(task.dueDate) ? 'text-amber-600' :
                  isToday(task.dueDate) ? 'text-orange-500' : 'text-gray-400'
                }`}>
                  {formatDate(task.dueDate)}
                </span>
              )}
            </div>
          ))}
          {visibleTasks.length > 12 && (
            <p className="text-xs text-gray-400 pl-6">+ {visibleTasks.length - 12} autres</p>
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
          <div className="w-32 shrink-0">
            <DatePicker
              value={inlineTaskDate}
              onChange={setInlineTaskDate}
              placeholder="Date"
              clearable
              size="sm"
            />
          </div>
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
                href={`/cogs?projetId=${projet.id}&cogId=${c.id}`}
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

      {/* Factures (read-only, from the Factures table) */}
      {projet.ref && <FacturesSection projetRef={projet.ref} />}

      {/* Comments (Airtable record comments) */}
      <ProjetComments projetId={projet.id} />

      {/* Force new task modal */}
      {showForceTask && (
        <ForceNewTaskModal
          projetId={showForceTask.projetId}
          projetName={showForceTask.projetName}
          projetRef={showForceTask.projetRef}
          clientName={showForceTask.clientName}
          onClose={() => setShowForceTask(null)}
          onCreated={() => {
            setShowForceTask(null)
            revalidateProjectTasks()
            onTasksChanged()
          }}
        />
      )}

      {/* File viewer */}
      {viewer && (
        <FileViewer
          url={viewer.url}
          filename={viewer.filename}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  )
}

/* ─── Factures (read-only view of a project's invoices) ─── */

type FactureRow = {
  id: string
  numero?: string
  dateEmission?: string
  montantHT?: number
  montantTTC?: number
  reglement?: number
  soldeDu?: number
  numeroBdc?: string
  type?: string
}

function FacturesSection({ projetRef }: { projetRef: string }) {
  const [factures, setFactures] = useState<FactureRow[]>([])
  const [totals, setTotals] = useState<{ montantTTC: number; reglement: number; soldeDu: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/factures?ref=${encodeURIComponent(projetRef)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setFactures(data.factures || [])
        setTotals(data.totals || null)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projetRef])

  const eur = (n?: number) =>
    n == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  const fdate = (s?: string) => {
    if (!s) return '—'
    const parts = s.substring(0, 10).split('-').map(Number)
    if (parts.length < 3 || parts.some(isNaN)) return '—'
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  if (loading) {
    return (
      <div className="mb-6">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Factures</h3>
        <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement…</div>
      </div>
    )
  }
  if (factures.length === 0) return null

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 mb-2.5"
      >
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          Factures ({factures.length})
        </h3>
        {totals && totals.soldeDu > 0 && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
            Solde dû {eur(totals.soldeDu)}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-left">
                <th className="px-2 py-1.5 font-medium">Émission</th>
                <th className="px-2 py-1.5 font-medium">N°</th>
                <th className="px-2 py-1.5 font-medium">BDC</th>
                <th className="px-2 py-1.5 font-medium text-right">TTC</th>
                <th className="px-2 py-1.5 font-medium text-right">Réglé</th>
                <th className="px-2 py-1.5 font-medium text-right">Solde dû</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {factures.map((f) => (
                <tr key={f.id} className="text-gray-700">
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{fdate(f.dateEmission)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {f.numero || '—'}
                    {f.type && <span className="ml-1 text-[9px] text-gray-400">({f.type})</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-gray-500 whitespace-nowrap">{f.numeroBdc || '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{eur(f.montantTTC)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-green-700">{eur(f.reglement)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${f.soldeDu && f.soldeDu > 0 ? 'text-amber-700 font-medium' : ''}`}>
                    {eur(f.soldeDu)}
                  </td>
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-2 py-1.5" colSpan={3}>Total</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{eur(totals.montantTTC)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-green-700">{eur(totals.reglement)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{eur(totals.soldeDu)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

/* ─── Projet comments (Airtable record comments) ─── */

type ProjetComment = {
  id: string
  text: string
  createdTime: string
  author?: { name?: string; email?: string }
}

function ProjetComments({ projetId }: { projetId: string }) {
  const [comments, setComments] = useState<ProjetComment[]>([])
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projets/${projetId}/comments`, { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setComments(data.comments || [])
    } catch (e) {
      console.error('Load comments error:', e)
      setError('Impossible de charger les commentaires')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetId])

  const submit = async () => {
    const value = text.trim()
    if (!value || posting) return
    setPosting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projets/${projetId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.comment) {
        setComments((prev) => [...prev, data.comment])
      } else {
        await load()
      }
      setText('')
    } catch (e) {
      console.error('Post comment error:', e)
      setError("Impossible d'envoyer le commentaire")
    } finally {
      setPosting(false)
    }
  }

  const formatWhen = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch {
      return iso
    }
  }

  return (
    <div className="mb-6">
      <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
        <MessageSquare className="w-3 h-3" />
        Commentaires{comments.length > 0 && ` (${comments.length})`}
      </h3>

      <div className="space-y-2 mb-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Chargement...
          </div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-gray-400 py-1">Aucun commentaire</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-semibold text-gray-700">{c.author?.name || 'Anonyme'}</span>
                <span className="text-[10px] text-gray-400">{formatWhen(c.createdTime)}</span>
              </div>
              <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{c.text}</p>
            </div>
          ))
        )}
      </div>

      <div className="flex items-start gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Ajouter un commentaire..."
          rows={2}
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
        <button
          onClick={submit}
          disabled={posting || !text.trim()}
          className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0"
          title="Envoyer (Cmd/Ctrl+Enter)"
        >
          {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-amber-600">{error}</p>}
    </div>
  )
}
