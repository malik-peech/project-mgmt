'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, X, CheckCircle2, Circle, CalendarDays, Loader2, Copy, Trash2 } from 'lucide-react'
import ContextMenu from '@/components/ContextMenu'
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
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  if (due < today) return 'text-red-600 font-medium'
  if (due.getTime() === today.getTime()) return 'text-orange-500 font-medium'
  return 'text-gray-500'
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function getInitials(name?: string): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function TasksPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<'todo' | 'done'>('todo')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: Task } | null>(null)

  // Form state
  const [form, setForm] = useState({
    name: '',
    projetId: '',
    type: '' as string,
    priority: '' as string,
    dueDate: '',
    description: '',
  })

  const userName = (session?.user as any)?.name || ''
  const userRole = (session?.user as any)?.role || 'PM'
  const pmParam = userRole === 'Admin' ? '' : `pm=${encodeURIComponent(userName)}`
  const ready = !!session?.user?.name

  const { data: tasks, mutate: mutateTasks, revalidate: revalidateTasks, loading: loadingTodo } = useData<Task[]>(
    ready ? `/api/tasks?${pmParam}` : null,
    { key: `tasks-todo-${pmParam}`, enabled: ready }
  )

  const { data: doneTasks, mutate: mutateDone, revalidate: revalidateDone, loading: loadingDone } = useData<Task[]>(
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

  const deleteTask = async (task: Task) => {
    // Optimistic
    mutateTasks(prev => (prev ?? []).filter(t => t.id !== task.id))
    mutateDone(prev => (prev ?? []).filter(t => t.id !== task.id))
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to delete task', err)
      fetchTasks()
    }
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
    } catch (err) {
      console.error('Failed to duplicate task', err)
    }
  }

  const toggleDone = async (task: Task) => {
    const newDone = !task.done
    // Optimistic update
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
    } catch (err) {
      console.error('Failed to toggle task', err)
      fetchTasks()
    }
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
    } catch (err) {
      console.error('Failed to create task', err)
    } finally {
      setSubmitting(false)
    }
  }

  const displayedTasks = activeTab === 'todo' ? todoList : doneList
  const filteredTasks =
    typeFilter === 'all'
      ? displayedTasks
      : displayedTasks.filter((t) => t.type === typeFilter)

  // Collect unique types from all tasks for filter
  const allTypes = Array.from(
    new Set([...todoList, ...doneList].map((t) => t.type).filter(Boolean))
  ) as string[]

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {todoList.length} tache{todoList.length !== 1 ? 's' : ''} en cours
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nouvelle task
        </button>
      </div>

      {/* Tabs + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('todo')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'todo'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            A faire ({todoList.length})
          </button>
          <button
            onClick={() => setActiveTab('done')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'done'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Termin\u00e9es ({doneList.length})
          </button>
        </div>
        {allTypes.length > 0 && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Tous les types</option>
            {allTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Chargement...
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Aucune task</p>
          <p className="text-sm mt-1">
            {activeTab === 'todo'
              ? 'Toutes les tasks sont termin\u00e9es !'
              : 'Aucune task termin\u00e9e.'}
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
              <button
                onClick={() => toggleDone(task)}
                className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors"
              >
                {task.done ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </button>

              {/* Name + Project */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium truncate ${
                    task.done ? 'line-through text-gray-400' : 'text-gray-900'
                  }`}
                >
                  {task.name}
                </p>
                {task.projetName && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {task.projetName}
                    {task.clientName ? ` \u2014 ${task.clientName}` : ''}
                  </p>
                )}
              </div>

              {/* Priority badge */}
              {task.priority && (
                <span
                  className={`hidden sm:inline-flex shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${getPriorityColor(
                    task.priority
                  )}`}
                >
                  {task.priority}
                </span>
              )}

              {/* Type badge */}
              {task.type && (
                <span className="hidden md:inline-flex shrink-0 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                  {task.type}
                </span>
              )}

              {/* Due date */}
              {task.dueDate && (
                <span
                  className={`hidden sm:inline-flex items-center gap-1 shrink-0 text-xs ${getDateColor(
                    task.dueDate
                  )}`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  {formatDate(task.dueDate)}
                </span>
              )}

              {/* Assignee */}
              {task.assigneeName && (
                <span
                  className="shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium flex items-center justify-center"
                  title={task.assigneeName}
                >
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

      {/* New Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Nouvelle task</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Projet */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Projet
                </label>
                <select
                  value={form.projetId}
                  onChange={(e) => setForm({ ...form, projetId: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">-- S\u00e9lectionner un projet --</option>
                  {projetList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom} {p.clientName ? `(${p.clientName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de la task <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Envoyer le brief au client"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Type + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">-- Type --</option>
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priorit\u00e9
                  </label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">-- Priorit\u00e9 --</option>
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date d&apos;\u00e9ch\u00e9ance
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="D\u00e9tails de la task..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting || !form.name.trim()}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Cr\u00e9er
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
