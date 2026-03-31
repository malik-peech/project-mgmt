'use client'

import { useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, X, CheckCircle2, Circle, CalendarDays, Loader2, Copy, Trash2, RefreshCw, AlertTriangle, Search } from 'lucide-react'
import ContextMenu from '@/components/ContextMenu'
import ForceNewTaskModal from '@/components/ForceNewTaskModal'
import { useData } from '@/hooks/useData'
import type { Task, TaskPriority, TaskType, Projet } from '@/types'

const PRIORITY_COLORS: Record<string, string> = {
  'Urgent': 'bg-red-100 text-red-800',
  'Important': 'bg-yellow-100 text-yellow-800',
  "Dans l'ideal": 'bg-teal-100 text-teal-800',
  "Dans l\u2019id\u00e9al": 'bg-teal-100 text-teal-800',
  'Optionnel': 'bg-gray-100 text-gray-600',
  'Si retour client': 'bg-green-100 text-green-800',
}

const PRIORITY_OPTIONS: TaskPriority[] = ['Urgent', 'Important', "Dans l'id\u00e9al", 'Optionnel', 'Si retour client']

const TYPE_OPTIONS: TaskType[] = [
  'Brief', 'Call client', 'Email client', 'Demande float', 'Shooting',
  'Delivery', 'Envoi r\u00e9troplanning', 'Task interne', 'Contact presta',
  'Check', 'Prez', 'COGS', 'Matos', 'Retour presta', 'Casting VO',
  'Casting acteur', 'Prepa Tournage', 'Call presta', 'Calendar',
]

function getPriorityColor(priority?: string): string {
  if (!priority) return 'bg-gray-100 text-gray-500'
  return PRIORITY_COLORS[priority] ?? 'bg-gray-100 text-gray-500'
}

function getDateColor(dueDate?: string): string {
  if (!dueDate) return 'text-gray-400'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0)
  if (due < today) return 'text-amber-600 font-medium'
  if (due.getTime() === today.getTime()) return 'text-orange-500 font-medium'
  return 'text-gray-500'
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

const DATE_FILTERS = [
  { label: 'Toutes', value: 'all' },
  { label: 'En retard', value: 'overdue' },
  { label: "Aujourd'hui", value: 'today' },
  { label: 'Cette semaine', value: 'week' },
  { label: 'Sans date', value: 'nodate' },
]

export default function TasksPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<'todo' | 'done'>('todo')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [projetFilter, setProjetFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: Task } | null>(null)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [showForceTask, setShowForceTask] = useState<{ projetId?: string; projetName?: string } | null>(null)

  // Inline create
  const [inlineName, setInlineName] = useState('')
  const [inlineDate, setInlineDate] = useState('')
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
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const newTask = await res.json()
        mutateTasks(prev => [newTask, ...(prev ?? [])])
      }
    } catch {}
  }

  const toggleDone = async (task: Task) => {
    const newDone = !task.done
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
      // If marking done, show force new task modal
      if (newDone && task.projetId) {
        setShowForceTask({ projetId: task.projetId, projetName: task.projetName })
      }
    } catch { fetchTasks() }
  }

  const updateTaskDate = async (taskId: string, newDate: string) => {
    // Optimistic
    mutateTasks(prev => (prev ?? []).map(t => t.id === taskId ? { ...t, dueDate: newDate } : t))
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: newDate }),
      })
    } catch { fetchTasks() }
    setEditingDate(null)
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
    if (!inlineName.trim()) return
    setInlineCreating(true)
    try {
      const body: Record<string, string> = { name: inlineName }
      // If filtered by project, auto-assign
      if (projetFilter) body.projetId = projetFilter
      if (inlineDate) body.dueDate = inlineDate
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
      }
    } catch {} finally { setInlineCreating(false) }
  }

  // Apply filters
  const displayedTasks = activeTab === 'todo' ? todoList : doneList
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
    if (dateFilter !== 'all') {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (7 - today.getDay()))
      list = list.filter((t) => {
        if (dateFilter === 'nodate') return !t.dueDate
        if (!t.dueDate) return false
        const d = new Date(t.dueDate); d.setHours(0, 0, 0, 0)
        if (dateFilter === 'overdue') return d < today
        if (dateFilter === 'today') return d.getTime() === today.getTime()
        if (dateFilter === 'week') return d >= today && d <= endOfWeek
        return true
      })
    }
    return list
  }, [displayedTasks, typeFilter, projetFilter, search, dateFilter])

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {todoList.length} tâche{todoList.length !== 1 ? 's' : ''} en cours
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
          {/* Todo/Done toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('todo')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'todo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              A faire ({todoList.length})
            </button>
            <button
              onClick={() => setActiveTab('done')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'done' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Terminées ({doneList.length})
            </button>
          </div>

          {/* Project filter */}
          <select
            value={projetFilter}
            onChange={(e) => setProjetFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[200px]"
          >
            <option value="">Tous les projets</option>
            {taskProjets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ref ? `${p.ref} - ` : ''}{p.name}
              </option>
            ))}
          </select>

          {/* Date filter pills */}
          <div className="flex gap-1 flex-wrap">
            {DATE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setDateFilter(f.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  dateFilter === f.value
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Type filter pills */}
          {allTypes.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  typeFilter === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Tous types
              </button>
              {allTypes.slice(0, 8).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                    typeFilter === t ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {t}
                </button>
              ))}
              {allTypes.length > 8 && (
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-full px-2 py-1 text-gray-500 bg-white"
                >
                  <option value="all">+ {allTypes.length - 8} types</option>
                  {allTypes.slice(8).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inline create */}
      {activeTab === 'todo' && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-white rounded-xl border border-dashed border-gray-200">
          <Plus className="w-4 h-4 text-gray-300 shrink-0" />
          <input
            type="text"
            placeholder={projetFilter ? 'Nouvelle task pour ce projet...' : 'Nouvelle task rapide...'}
            value={inlineName}
            onChange={(e) => setInlineName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && inlineName.trim()) createInlineTask() }}
            className="flex-1 text-sm border-none outline-none bg-transparent placeholder:text-gray-300"
          />
          <input
            type="date"
            value={inlineDate}
            onChange={(e) => setInlineDate(e.target.value)}
            className="text-xs text-gray-400 border-none outline-none bg-transparent w-28"
          />
          {inlineName.trim() && (
            <button onClick={createInlineTask} disabled={inlineCreating} className="text-indigo-600 hover:text-indigo-700 text-xs font-medium">
              {inlineCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ajouter'}
            </button>
          )}
        </div>
      )}

      {/* Task list */}
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
                <p className={`text-sm font-medium truncate ${task.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                  {task.name}
                </p>
                {(task.projetName || task.projetRef) && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {task.projetRef && <span className="font-mono">{task.projetRef}</span>}
                    {task.projetRef && task.projetName && ' · '}
                    {task.projetName}
                    {task.clientName ? ` — ${task.clientName}` : ''}
                  </p>
                )}
              </div>

              {/* Priority */}
              {task.priority && (
                <span className={`hidden sm:inline-flex shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${getPriorityColor(task.priority)}`}>
                  {task.priority}
                </span>
              )}

              {/* Type */}
              {task.type && (
                <span className="hidden md:inline-flex shrink-0 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                  {task.type}
                </span>
              )}

              {/* Due date (editable) */}
              {editingDate === task.id ? (
                <input
                  type="date"
                  autoFocus
                  defaultValue={task.dueDate || ''}
                  onBlur={(e) => updateTaskDate(task.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') updateTaskDate(task.id, (e.target as HTMLInputElement).value)
                    if (e.key === 'Escape') setEditingDate(null)
                  }}
                  className="text-xs border border-indigo-300 rounded px-1.5 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              ) : (
                <button
                  onClick={() => setEditingDate(task.id)}
                  className={`hidden sm:inline-flex items-center gap-1 shrink-0 text-xs hover:bg-gray-100 px-1.5 py-0.5 rounded transition ${getDateColor(task.dueDate)}`}
                  title="Cliquer pour modifier la date"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  {task.dueDate ? formatDate(task.dueDate) : 'Date'}
                </button>
              )}

              {/* Assignee */}
              {task.assigneeName && (
                <span className="shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium flex items-center justify-center" title={task.assigneeName}>
                  {getInitials(task.assigneeName)}
                </span>
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
                <select
                  value={form.projetId}
                  onChange={(e) => setForm({ ...form, projetId: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">-- Sélectionner un projet --</option>
                  {projetList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.ref ? `${p.ref} - ` : ''}{p.nom} {p.clientName ? `(${p.clientName})` : ''}
                    </option>
                  ))}
                </select>
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
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">-- Type --</option>
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">-- Priorité --</option>
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d&apos;échéance</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
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
