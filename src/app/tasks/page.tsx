'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, X, CheckCircle2, Circle, Loader2, Copy, Trash2, RefreshCw, AlertTriangle, Search, List, CalendarDays } from 'lucide-react'
import ContextMenu from '@/components/ContextMenu'
import ForceNewTaskModal from '@/components/ForceNewTaskModal'
import TaskCalendarView from '@/components/TaskCalendarView'
import ComboSelect from '@/components/ComboSelect'
import DatePicker from '@/components/DatePicker'
import { useData } from '@/hooks/useData'
import type { Task, TaskPriority, TaskType, Projet } from '@/types'

const PRIORITY_COLORS: Record<string, string> = {
  'Urgent': 'bg-red-100 text-red-700 ring-1 ring-red-200',
  'Important': 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  "Dans l'ideal": 'bg-teal-100 text-teal-700',
  "Dans l\u2019id\u00e9al": 'bg-teal-100 text-teal-700',
  'Optionnel': 'bg-gray-100 text-gray-500',
  'Si retour client': 'bg-emerald-100 text-emerald-700',
}

const TYPE_COLORS: Record<string, string> = {
  // Client communication — blue tones
  'Brief': 'bg-blue-100 text-blue-700',
  'Call client': 'bg-blue-100 text-blue-700',
  'Email client': 'bg-sky-100 text-sky-700',
  'Prez': 'bg-indigo-100 text-indigo-700',
  // Delivery
  'Delivery': 'bg-violet-100 text-violet-700',
  'Envoi rétroplanning': 'bg-purple-100 text-purple-700',
  // External / presta
  'Contact presta': 'bg-teal-100 text-teal-700',
  'Call presta': 'bg-teal-100 text-teal-600',
  'Retour presta': 'bg-teal-50 text-teal-600',
  // Finance / admin
  'COGS': 'bg-green-100 text-green-700',
  'Demande float': 'bg-lime-100 text-lime-700',
  'Matos': 'bg-yellow-100 text-yellow-700',
  // Physical / production
  'Shooting': 'bg-orange-100 text-orange-700',
  'Prepa Tournage': 'bg-orange-100 text-orange-600',
  'Casting VO': 'bg-pink-100 text-pink-700',
  'Casting acteur': 'bg-pink-100 text-pink-600',
  // Internal / planning
  'Task interne': 'bg-gray-100 text-gray-600',
  'Check': 'bg-slate-100 text-slate-600',
  'Calendar': 'bg-slate-100 text-slate-500',
}

const PRIORITY_OPTIONS: TaskPriority[] = ['Urgent', 'Important', "Dans l'id\u00e9al", 'Optionnel', 'Si retour client']

const TYPE_OPTIONS: TaskType[] = [
  'Brief', 'Call client', 'Email client', 'Demande float', 'Shooting',
  'Delivery', 'Envoi r\u00e9troplanning', 'Task interne', 'Contact presta',
  'Check', 'Prez', 'COGS', 'Matos', 'Retour presta', 'Casting VO',
  'Casting acteur', 'Prepa Tournage', 'Call presta', 'Calendar',
]

const priorityComboOptions = PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))
const typeComboOptions = TYPE_OPTIONS.map((t) => ({ value: t, label: t }))

function getPriorityColor(priority?: string): string {
  if (!priority) return 'bg-gray-100 text-gray-500'
  return PRIORITY_COLORS[priority] ?? 'bg-gray-100 text-gray-500'
}

function getTypeColor(type?: string): string {
  if (!type) return 'bg-gray-50 text-gray-400'
  return TYPE_COLORS[type] ?? 'bg-indigo-50 text-indigo-600'
}

/** Strip Airtable record IDs (rec + 8+ alphanumeric chars) from display strings */
function stripRecIds(text?: string): string {
  if (!text) return ''
  return text.replace(/\brec[A-Za-z0-9]{8,}\b/g, '').replace(/\s{2,}/g, ' ').trim()
}

const DATE_FILTERS = [
  { label: 'Toutes', value: 'all' },
  { label: 'En retard', value: 'overdue' },
  { label: "Aujourd'hui", value: 'today' },
  { label: 'Demain', value: 'tomorrow' },
  { label: 'Cette semaine', value: 'week' },
  { label: 'Sans date', value: 'nodate' },
]

export default function TasksPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<'todo' | 'done'>('todo')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [scopeFilter, setScopeFilter] = useState<'myProjects' | 'myTasks'>('myProjects')
  const [specificDate, setSpecificDate] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [calendarMode, setCalendarMode] = useState<'week' | 'month'>('month')

  // Apply URL filter param on mount (e.g. /tasks?filter=overdue)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const f = params.get('filter')
    if (f === 'overdue') setDateFilter('overdue')
  }, [])
  const [projetFilter, setProjetFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: Task } | null>(null)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<{ id: string; field: 'type' | 'priority' } | null>(null)
  const [editingAssignee, setEditingAssignee] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [showForceTask, setShowForceTask] = useState<{ projetId?: string; projetName?: string; clientName?: string; projetRef?: string } | null>(null)

  // Inline create
  const [inlineName, setInlineName] = useState('')
  const [inlineDate, setInlineDate] = useState('')
  const [inlineProjet, setInlineProjet] = useState('')
  const [inlineType, setInlineType] = useState('')
  const [inlinePriority, setInlinePriority] = useState('')
  const [inlineCreating, setInlineCreating] = useState(false)

  // Form state (modal)
  const [form, setForm] = useState({ name: '', projetId: '', type: '' as string, priority: '' as string, dueDate: '', description: '' })

  const userName = (session?.user as any)?.name || ''
  const userRole = (session?.user as any)?.role || 'PM'
  const pmParam = userRole === 'Admin' ? '' : `pm=${encodeURIComponent(userName)}`
  const ready = !!session?.user?.name

  const { data: tasks, mutate: mutateTasks, revalidate: revalidateTasks, loading: loadingTodo, error: errorTodo } = useData<Task[]>(
    ready ? `/api/tasks?${pmParam}` : null,
    { key: `tasks-todo-${pmParam}`, enabled: ready }
  )

  const { data: doneTasks, mutate: mutateDone, revalidate: revalidateDone, loading: loadingDone, error: errorDone } = useData<Task[]>(
    ready ? `/api/tasks?done=true&${pmParam}` : null,
    { key: `tasks-done-${pmParam}`, enabled: ready }
  )

  const { data: projets } = useData<Projet[]>(
    ready ? '/api/projets' : null,
    { key: 'projets-all', enabled: ready, staleTime: 60_000 }
  )

  const { data: users } = useData<{ name: string; role: string }[]>(
    ready ? '/api/users' : null,
    { key: 'users-all', enabled: ready, staleTime: 300_000 }
  )

  const userOptions = (users ?? []).map((u) => ({ value: u.name, label: u.name, sub: u.role }))

  const loading = loadingTodo || loadingDone
  const fetchTasks = useCallback(async () => {
    await Promise.all([revalidateTasks(), revalidateDone()])
  }, [revalidateTasks, revalidateDone])

  const todoList = tasks ?? []
  const doneList = doneTasks ?? []
  const projetList = projets ?? []

  // Unique projects + clients from tasks for filter
  const taskProjets = useMemo(() => {
    const map = new Map<string, { id: string; ref?: string; name: string; client?: string }>()
    for (const t of [...todoList, ...doneList]) {
      if (t.projetId && t.projetName) {
        map.set(t.projetId, { id: t.projetId, ref: t.projetRef, name: t.projetName, client: t.clientName })
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [todoList, doneList])

  const taskProjetOptions = useMemo(() =>
    taskProjets.map((p) => ({
      value: p.id,
      label: p.name,
      sub: [p.ref, p.client].filter(Boolean).join(' · ') || undefined,
    })),
    [taskProjets]
  )

  const projetComboOptions = useMemo(() =>
    projetList.map((p) => ({
      value: p.id,
      label: p.nom,
      sub: [p.ref, p.clientName].filter(Boolean).join(' · ') || undefined,
    })),
    [projetList]
  )

  // Unique types from tasks
  const allTypes = useMemo(() =>
    Array.from(new Set([...todoList, ...doneList].map((t) => t.type).filter(Boolean))) as string[],
    [todoList, doneList]
  )

  const deleteTask = async (task: Task) => {
    mutateTasks(prev => (prev ?? []).filter(t => t.id !== task.id))
    mutateDone(prev => (prev ?? []).filter(t => t.id !== task.id))
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    } catch { fetchTasks() }
  }

  const duplicateTask = async (task: Task) => {
    try {
      const body: Record<string, any> = { name: `${task.name} (copie)` }
      if (task.projetId) body.projetId = task.projetId
      if (task.dueDate) body.dueDate = task.dueDate
      if (task.priority) body.priority = task.priority
      if (task.type) body.type = task.type
      if (task.description) body.description = task.description
      if (task.assigneManuel) body.assigneManuel = task.assigneManuel
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const newTask = await res.json()
        // Carry over display fields that the API may not return immediately
        const enriched = {
          ...newTask,
          projetName: newTask.projetName || task.projetName,
          projetRef: newTask.projetRef || task.projetRef,
          clientName: newTask.clientName || task.clientName,
          assigneManuel: newTask.assigneManuel || task.assigneManuel,
        }
        mutateTasks(prev => [enriched, ...(prev ?? [])])
      }
    } catch {}
  }

  const updateTaskName = async (taskId: string, newName: string) => {
    if (!newName.trim()) return
    mutateTasks(prev => (prev ?? []).map(t => t.id === taskId ? { ...t, name: newName } : t))
    mutateDone(prev => (prev ?? []).map(t => t.id === taskId ? { ...t, name: newName } : t))
    setEditingName(null)
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
    } catch { fetchTasks() }
  }

  const toggleDone = async (task: Task) => {
    const newDone = !task.done
    // Capture remaining todo tasks for this project BEFORE mutating state
    const otherTodoTasks = newDone && task.projetId
      ? (tasks ?? []).filter((t) => t.projetId === task.projetId && t.id !== task.id && !t.done)
      : []
    if (newDone) {
      mutateTasks(prev => (prev ?? []).filter(t => t.id !== task.id))
      mutateDone(prev => [{ ...task, done: true }, ...(prev ?? [])])
    } else {
      mutateDone(prev => (prev ?? []).filter(t => t.id !== task.id))
      mutateTasks(prev => [{ ...task, done: false }, ...(prev ?? [])])
    }
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: newDone }),
      })
      if (newDone && task.projetId && otherTodoTasks.length === 0) {
        setShowForceTask({ projetId: task.projetId, projetName: task.projetName, clientName: task.clientName, projetRef: task.projetRef })
      }
    } catch { fetchTasks() }
  }

  const updateTaskDate = async (taskId: string, newDate: string) => {
    mutateTasks(prev => (prev ?? []).map(t => t.id === taskId ? { ...t, dueDate: newDate } : t))
    setEditingDate(null)
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: newDate }),
      })
    } catch { fetchTasks() }
  }

  const updateTaskField = async (taskId: string, field: 'type' | 'priority', value: string) => {
    mutateTasks(prev => (prev ?? []).map(t => t.id === taskId ? { ...t, [field]: value || undefined } : t))
    setEditingField(null)
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
    } catch { fetchTasks() }
  }

  const updateAssignee = async (taskId: string, name: string) => {
    mutateTasks(prev => (prev ?? []).map(t => t.id === taskId ? { ...t, assigneManuel: name || undefined } : t))
    setEditingAssignee(null)
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneManuel: name }),
      })
    } catch { fetchTasks() }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSubmitting(true)
    try {
      const body: Record<string, any> = { name: form.name }
      if (form.projetId) body.projetId = form.projetId
      if (form.dueDate) body.dueDate = form.dueDate
      if (form.priority) body.priority = form.priority
      if (form.type) body.type = form.type
      if (form.description) body.description = form.description
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setShowModal(false)
        setForm({ name: '', projetId: '', type: '', priority: '', dueDate: '', description: '' })
        fetchTasks()
      }
    } catch {} finally { setSubmitting(false) }
  }

  const createInlineTask = async () => {
    const projetId = inlineProjet || projetFilter
    if (!inlineName.trim() || !projetId) return
    setInlineCreating(true)
    try {
      const body: Record<string, string> = { name: inlineName }
      if (projetId) body.projetId = projetId
      if (inlineDate) body.dueDate = inlineDate
      if (inlineType) body.type = inlineType
      if (inlinePriority) body.priority = inlinePriority
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const newTask = await res.json()
        mutateTasks(prev => [newTask, ...(prev ?? [])])
        setInlineName('')
        setInlineDate('')
        setInlineProjet('')
        setInlineType('')
        setInlinePriority('')
      }
    } catch {} finally { setInlineCreating(false) }
  }

  // Set of project IDs where the current user is PM or DA
  const myProjetIds = useMemo(() => {
    const ids = new Set<string>()
    for (const p of projetList) {
      if (p.pm === userName || p.daOfficial === userName) ids.add(p.id)
    }
    return ids
  }, [projetList, userName])

  // Apply scope filter to both todo and done lists for accurate counts
  const scopedTodo = useMemo(() => {
    if (scopeFilter === 'myTasks') return todoList.filter((t) => t.assigneManuel === userName)
    return todoList.filter((t) => t.projetId && myProjetIds.has(t.projetId))
  }, [todoList, scopeFilter, myProjetIds, userName])

  const scopedDone = useMemo(() => {
    if (scopeFilter === 'myTasks') return doneList.filter((t) => t.assigneManuel === userName)
    return doneList.filter((t) => t.projetId && myProjetIds.has(t.projetId))
  }, [doneList, scopeFilter, myProjetIds, userName])

  // Count overdue tasks in scoped todo
  const overdueCount = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return scopedTodo.filter((t) => {
      if (!t.dueDate) return false
      const d = new Date(t.dueDate + 'T00:00:00'); d.setHours(0, 0, 0, 0)
      return d < today
    }).length
  }, [scopedTodo])

  // Apply filters
  const displayedTasks = activeTab === 'todo' ? scopedTodo : scopedDone

  const filteredTasks = useMemo(() => {
    let list = displayedTasks
    if (typeFilter !== 'all') list = list.filter((t) => t.type === typeFilter)
    if (projetFilter) list = list.filter((t) => t.projetId === projetFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.projetName?.toLowerCase().includes(q) ||
        t.clientName?.toLowerCase().includes(q) ||
        t.projetRef?.toLowerCase().includes(q)
      )
    }
    if (specificDate) {
      list = list.filter((t) => t.dueDate === specificDate)
    } else if (dateFilter !== 'all') {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
      const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (7 - today.getDay()))
      list = list.filter((t) => {
        if (dateFilter === 'nodate') return !t.dueDate
        if (!t.dueDate) return false
        const d = new Date(t.dueDate + 'T00:00:00'); d.setHours(0, 0, 0, 0)
        if (dateFilter === 'overdue') return d < today
        if (dateFilter === 'today') return d.getTime() === today.getTime()
        if (dateFilter === 'tomorrow') return d.getTime() === tomorrow.getTime()
        if (dateFilter === 'week') return d >= today && d <= endOfWeek
        return true
      })
    }
    return list
  }, [displayedTasks, typeFilter, projetFilter, search, dateFilter, specificDate, scopeFilter, myProjetIds, userName])

  // Calendar-specific filtered tasks (no date filter, applies type/project/search/scope)
  const calendarFilteredTasks = useMemo(() => {
    let list: Task[] = scopedTodo
    if (typeFilter !== 'all') list = list.filter((t) => t.type === typeFilter)
    if (projetFilter) list = list.filter((t) => t.projetId === projetFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.projetName?.toLowerCase().includes(q) ||
        t.clientName?.toLowerCase().includes(q) ||
        t.projetRef?.toLowerCase().includes(q)
      )
    }
    return list
  }, [scopedTodo, typeFilter, projetFilter, search])

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {scopedTodo.length} tâche{scopedTodo.length !== 1 ? 's' : ''} en cours
          </p>
        </div>
        <button
          onClick={() => {
            if (projetFilter) setForm(f => ({ ...f, projetId: projetFilter }))
            setShowModal(true)
          }}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nouvelle task
        </button>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3 mb-5">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher une task, un projet, un client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Todo/Done/Overdue toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => { setActiveTab('todo'); setDateFilter('all') }}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'todo' && dateFilter !== 'overdue' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              A faire ({scopedTodo.length})
            </button>
            <button
              onClick={() => { setActiveTab('todo'); setDateFilter('overdue') }}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'todo' && dateFilter === 'overdue'
                  ? 'bg-white text-red-600 shadow-sm'
                  : overdueCount > 0 ? 'text-red-500 hover:text-red-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              En retard ({overdueCount})
            </button>
            <button
              onClick={() => setActiveTab('done')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'done' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Terminées ({scopedDone.length})
            </button>
          </div>

          {/* Scope filter: Mes projets / Mes tasks */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setScopeFilter('myProjects')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                scopeFilter === 'myProjects' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Mes projets
            </button>
            <button
              onClick={() => setScopeFilter('myTasks')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                scopeFilter === 'myTasks' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Mes tasks
            </button>
          </div>

          {/* Project filter */}
          <div className="w-52">
            <ComboSelect
              options={taskProjetOptions}
              value={projetFilter}
              onChange={setProjetFilter}
              placeholder="Tous les projets"
              clearable
              size="sm"
            />
          </div>

          {/* Date filter pills (hidden in calendar mode) */}
          {viewMode === 'list' && (
            <div className="flex gap-1 flex-wrap items-center">
              {DATE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setDateFilter(f.value); setSpecificDate('') }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                    dateFilter === f.value && !specificDate
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              {/* Specific date picker */}
              <div className="w-36">
                <DatePicker
                  value={specificDate}
                  onChange={(v) => { setSpecificDate(v); if (v) setDateFilter('all') }}
                  placeholder="Date..."
                  clearable
                  size="sm"
                />
              </div>
            </div>
          )}

          {/* Type filter */}
          <div className="w-40">
            <ComboSelect
              options={[{ value: 'all', label: 'Tous types' }, ...TYPE_OPTIONS.map((t) => ({ value: t, label: t }))]}
              value={typeFilter}
              onChange={setTypeFilter}
              placeholder="Tous types"
              size="sm"
            />
          </div>

          {/* View mode toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 ml-auto">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
              title="Vue liste"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setViewMode('calendar'); setDateFilter('all'); setSpecificDate('') }}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
              title="Vue calendrier"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Inline create */}
      {activeTab === 'todo' && viewMode === 'list' && (
        <div className="mb-4 bg-white rounded-xl border border-dashed border-gray-200 overflow-visible">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Plus className="w-4 h-4 text-gray-300 shrink-0" />
            <input
              type="text"
              placeholder={projetFilter || inlineProjet ? 'Nouvelle task pour ce projet...' : 'Nouvelle task rapide...'}
              value={inlineName}
              onChange={(e) => setInlineName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && inlineName.trim()) createInlineTask() }}
              className="flex-1 text-sm border-none outline-none bg-transparent placeholder:text-gray-300"
            />
            <div className="w-32 shrink-0">
              <DatePicker
                value={inlineDate}
                onChange={setInlineDate}
                placeholder="Date"
                clearable
                size="sm"
              />
            </div>
            {inlineName.trim() && (
              <button
                onClick={createInlineTask}
                disabled={inlineCreating || !(inlineProjet || projetFilter)}
                className="text-indigo-600 hover:text-indigo-700 text-xs font-medium shrink-0 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                {inlineCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ajouter'}
              </button>
            )}
          </div>
          {/* Extra fields row */}
          <div className="flex items-center gap-2 px-4 pb-2.5 border-t border-gray-50 pt-2">
            <div className="w-44">
              <ComboSelect
                options={projetComboOptions}
                value={projetFilter || inlineProjet}
                onChange={setInlineProjet}
                placeholder="Projet *"
                clearable={!projetFilter}
                size="sm"
              />
            </div>
            <div className="w-36">
              <ComboSelect
                options={typeComboOptions}
                value={inlineType}
                onChange={setInlineType}
                placeholder="Type"
                clearable
                size="sm"
              />
            </div>
            <div className="w-36">
              <ComboSelect
                options={priorityComboOptions}
                value={inlinePriority}
                onChange={setInlinePriority}
                placeholder="Priorité"
                clearable
                size="sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Task list or Calendar */}
      {loading && !tasks && !doneTasks ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Chargement...
        </div>
      ) : (errorTodo || errorDone) && !tasks && !doneTasks ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <AlertTriangle className="w-10 h-10 text-orange-400 mb-3" />
          <p className="text-lg font-medium mb-1">Impossible de charger les tasks</p>
          <button onClick={() => fetchTasks()} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition mt-3">
            <RefreshCw className="w-4 h-4" /> Réessayer
          </button>
        </div>
      ) : viewMode === 'calendar' ? (
        <TaskCalendarView
          tasks={calendarFilteredTasks}
          calendarMode={calendarMode}
          onCalendarModeChange={setCalendarMode}
          onTaskDateChange={updateTaskDate}
          onToggleDone={toggleDone}
          onTaskClick={(task) => {
            setViewMode('list')
            setSearch(task.name)
          }}
        />
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Aucune task</p>
          <p className="text-sm mt-1">
            {activeTab === 'todo' ? 'Toutes les tasks sont terminées !' : 'Aucune task terminée.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors group"
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, task })
              }}
            >
              {/* Checkbox */}
              <button onClick={() => toggleDone(task)} className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors">
                {task.done ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5" />}
              </button>

              {/* Name + Project */}
              <div className="flex-1 min-w-0">
                {editingName === task.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editingNameValue}
                    onChange={(e) => setEditingNameValue(e.target.value)}
                    onBlur={() => updateTaskName(task.id, editingNameValue)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') updateTaskName(task.id, editingNameValue)
                      if (e.key === 'Escape') setEditingName(null)
                    }}
                    className="w-full text-sm font-medium text-gray-900 border border-indigo-300 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <p
                    className={`text-sm font-medium truncate cursor-text hover:bg-gray-50 rounded px-1 -mx-1 ${task.done ? 'line-through text-gray-400' : 'text-gray-900'}`}
                    onClick={() => { setEditingName(task.id); setEditingNameValue(stripRecIds(task.name)) }}
                  >
                    {stripRecIds(task.name)}
                  </p>
                )}
                {(task.projetName || task.projetRef) && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {task.projetRef && <span className="font-mono">{task.projetRef}</span>}
                    {task.projetRef && task.projetName && ' · '}
                    {task.projetName}
                    {task.clientName ? ` — ${task.clientName}` : ''}
                  </p>
                )}
              </div>

              {/* Priority (click to edit) */}
              {editingField?.id === task.id && editingField?.field === 'priority' ? (
                <div className="w-36 shrink-0">
                  <ComboSelect
                    options={priorityComboOptions}
                    value={task.priority || ''}
                    onChange={(v) => updateTaskField(task.id, 'priority', v)}
                    placeholder="Priorité"
                    clearable
                    size="sm"
                    autoOpen
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingField({ id: task.id, field: 'priority' })}
                  className={`hidden sm:inline-flex shrink-0 text-xs px-2 py-0.5 rounded-full font-medium transition hover:opacity-75 ${
                    task.priority
                      ? getPriorityColor(task.priority)
                      : 'bg-gray-50 text-gray-300 border border-dashed border-gray-200'
                  }`}
                  title="Cliquer pour modifier la priorité"
                >
                  {task.priority || '+ priorité'}
                </button>
              )}

              {/* Type (click to edit) */}
              {editingField?.id === task.id && editingField?.field === 'type' ? (
                <div className="w-36 shrink-0">
                  <ComboSelect
                    options={typeComboOptions}
                    value={task.type || ''}
                    onChange={(v) => updateTaskField(task.id, 'type', v)}
                    placeholder="Type"
                    clearable
                    size="sm"
                    autoOpen
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingField({ id: task.id, field: 'type' })}
                  className={`hidden md:inline-flex shrink-0 text-xs px-2 py-0.5 rounded-full font-medium transition hover:opacity-75 ${
                    task.type
                      ? getTypeColor(task.type)
                      : 'bg-gray-50 text-gray-300 border border-dashed border-gray-200'
                  }`}
                  title="Cliquer pour modifier le type"
                >
                  {task.type || '+ type'}
                </button>
              )}

              {/* Due date (DatePicker) */}
              {editingDate === task.id ? (
                <DatePicker
                  value={task.dueDate || ''}
                  onChange={(v) => updateTaskDate(task.id, v)}
                  placeholder="Date"
                  clearable
                  size="sm"
                  autoOpen
                  className="w-32 shrink-0"
                />
              ) : (
                <button
                  onClick={() => setEditingDate(task.id)}
                  className={`hidden sm:inline-flex items-center gap-1 shrink-0 text-xs hover:bg-gray-100 px-1.5 py-0.5 rounded transition ${
                    !task.dueDate ? 'text-gray-400' : (() => {
                      const today = new Date(); today.setHours(0,0,0,0)
                      const due = new Date(task.dueDate!); due.setHours(0,0,0,0)
                      if (due < today) return 'text-amber-600 font-medium'
                      if (due.getTime() === today.getTime()) return 'text-orange-500 font-medium'
                      return 'text-gray-500'
                    })()
                  }`}
                  title="Cliquer pour modifier la date"
                >
                  {task.dueDate
                    ? new Date(task.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                    : 'Date'}
                </button>
              )}

              {/* Assignee (click to edit) */}
              {editingAssignee === task.id ? (
                <div className="w-36 shrink-0">
                  <ComboSelect
                    options={userOptions}
                    value={task.assigneManuel || ''}
                    onChange={(v) => updateAssignee(task.id, v)}
                    onClose={() => setEditingAssignee(null)}
                    placeholder="Assigné"
                    clearable
                    size="sm"
                    autoOpen
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingAssignee(task.id)}
                  title={task.assigneManuel || task.assigneeName || 'Assigner'}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition hover:ring-2 hover:ring-indigo-400 hover:ring-offset-1"
                  style={task.assigneManuel || task.assigneeName ? {} : { background: 'rgb(243 244 246)' }}
                >
                  {task.assigneManuel || task.assigneeName ? (
                    <span className="w-full h-full rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center">
                      {(task.assigneManuel || task.assigneeName || '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  ) : (
                    <span className="w-full h-full rounded-full border-2 border-dashed border-gray-300 text-gray-400 flex items-center justify-center text-[10px]">+</span>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Dupliquer', icon: <Copy className="w-4 h-4" />, onClick: () => duplicateTask(contextMenu.task) },
            { separator: true },
            { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, onClick: () => deleteTask(contextMenu.task), danger: true },
          ]}
        />
      )}

      {/* Force new task modal (after marking done) */}
      {showForceTask && (
        <ForceNewTaskModal
          projetId={showForceTask.projetId}
          projetName={showForceTask.projetName}
          projetRef={showForceTask.projetRef}
          clientName={showForceTask.clientName}
          projets={projetList}
          onClose={() => setShowForceTask(null)}
          onCreated={() => {
            setShowForceTask(null)
            fetchTasks()
          }}
        />
      )}

      {/* New Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Nouvelle task</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projet</label>
                <ComboSelect
                  options={projetComboOptions}
                  value={form.projetId}
                  onChange={(v) => setForm({ ...form, projetId: v })}
                  placeholder="-- Sélectionner un projet --"
                  clearable
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la task <span className="text-red-500">*</span></label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Envoyer le brief au client"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <ComboSelect
                    options={typeComboOptions}
                    value={form.type}
                    onChange={(v) => setForm({ ...form, type: v })}
                    placeholder="-- Type --"
                    clearable
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label>
                  <ComboSelect
                    options={priorityComboOptions}
                    value={form.priority}
                    onChange={(v) => setForm({ ...form, priority: v })}
                    placeholder="-- Priorité --"
                    clearable
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d&apos;échéance</label>
                <DatePicker
                  value={form.dueDate}
                  onChange={(v) => setForm({ ...form, dueDate: v })}
                  placeholder="Choisir une date"
                  clearable
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
                  placeholder="Détails de la task..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">Annuler</button>
                <button type="submit" disabled={submitting || !form.name.trim()}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
