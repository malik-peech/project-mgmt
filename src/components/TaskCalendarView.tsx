'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addWeeks, addMonths, subWeeks, subMonths,
  format, isSameMonth, isToday, getDay,
  eachDayOfInterval,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Circle, CheckCircle2, Plus } from 'lucide-react'
import type { Task } from '@/types'

// Palette used to color task pills by project. Full class strings (no dynamic
// interpolation) so Tailwind doesn't purge them.
const PROJECT_PALETTE = [
  'border-l-blue-500 bg-blue-50',
  'border-l-emerald-500 bg-emerald-50',
  'border-l-violet-500 bg-violet-50',
  'border-l-orange-500 bg-orange-50',
  'border-l-pink-500 bg-pink-50',
  'border-l-teal-500 bg-teal-50',
  'border-l-amber-500 bg-amber-50',
  'border-l-cyan-500 bg-cyan-50',
  'border-l-fuchsia-500 bg-fuchsia-50',
  'border-l-lime-600 bg-lime-50',
  'border-l-rose-500 bg-rose-50',
  'border-l-indigo-500 bg-indigo-50',
  'border-l-sky-500 bg-sky-50',
  'border-l-purple-500 bg-purple-50',
]
const NO_PROJECT_COLOR = 'border-l-gray-300 bg-gray-50'

interface Props {
  tasks: Task[]
  calendarMode: 'week' | 'month'
  onCalendarModeChange: (mode: 'week' | 'month') => void
  onTaskDateChange: (taskId: string, newDate: string) => Promise<void>
  onToggleDone: (task: Task) => void
  onTaskClick: (task: Task) => void
  onCreateTask?: (date: string) => void
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven']

export default function TaskCalendarView({ tasks, calendarMode, onCalendarModeChange, onTaskDateChange, onToggleDone, onTaskClick, onCreateTask }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  // Assign a stable color to each project present, in first-seen order, so
  // tasks of the same project share a color across the calendar.
  const projectColorMap = useMemo(() => {
    const map = new Map<string, string>()
    let i = 0
    for (const t of tasks) {
      const key = t.projetId || t.projetRef
      if (!key || map.has(key)) continue
      map.set(key, PROJECT_PALETTE[i % PROJECT_PALETTE.length])
      i++
    }
    return map
  }, [tasks])
  const colorFor = useCallback((task: Task) => {
    const key = task.projetId || task.projetRef
    return (key && projectColorMap.get(key)) || NO_PROJECT_COLOR
  }, [projectColorMap])

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      const key = t.dueDate || '__none__'
      const list = map.get(key) || []
      list.push(t)
      map.set(key, list)
    }
    return map
  }, [tasks])

  const unscheduled = tasksByDate.get('__none__') || []

  // Compute visible days (weekdays only: Mon-Fri)
  const days = useMemo(() => {
    let start: Date, end: Date
    if (calendarMode === 'week') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 })
      end = endOfWeek(currentDate, { weekStartsOn: 1 })
    } else {
      const monthStart = startOfMonth(currentDate)
      const monthEnd = endOfMonth(currentDate)
      start = startOfWeek(monthStart, { weekStartsOn: 1 })
      end = endOfWeek(monthEnd, { weekStartsOn: 1 })
    }
    const all = eachDayOfInterval({ start, end })
    // Filter out Saturday (6) and Sunday (0)
    return all.filter((d) => {
      const dow = getDay(d)
      return dow !== 0 && dow !== 6
    })
  }, [currentDate, calendarMode])

  // Navigation
  const goToday = () => setCurrentDate(new Date())
  const goPrev = () => setCurrentDate(d => calendarMode === 'week' ? subWeeks(d, 1) : subMonths(d, 1))
  const goNext = () => setCurrentDate(d => calendarMode === 'week' ? addWeeks(d, 1) : addMonths(d, 1))

  // Period label
  const periodLabel = useMemo(() => {
    if (calendarMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 })
      const end = endOfWeek(currentDate, { weekStartsOn: 1 })
      return `${format(start, 'd', { locale: fr })} - ${format(end, 'd MMM yyyy', { locale: fr })}`
    }
    return format(currentDate, 'MMMM yyyy', { locale: fr })
  }, [currentDate, calendarMode])

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData('taskId', task.id)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(dateStr)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault()
    setDragOverDate(null)
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) {
      onTaskDateChange(taskId, dateStr)
    }
  }, [onTaskDateChange])

  const handleDropUnscheduled = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOverDate(null)
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) {
      onTaskDateChange(taskId, '')
    }
  }, [onTaskDateChange])

  // Task pill component
  const TaskPill = ({ task }: { task: Task }) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const isOverdue = task.dueDate ? new Date(task.dueDate + 'T00:00:00') < today : false

    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, task)}
        onClick={(e) => { e.stopPropagation(); onTaskClick(task) }}
        className={`group flex items-start gap-1 px-1.5 py-1 rounded border-l-[3px] cursor-pointer active:cursor-grabbing transition-colors text-[11px] leading-tight mb-0.5
          ${colorFor(task)}
          ${isOverdue ? 'ring-1 ring-red-300' : ''}
          hover:shadow-md hover:brightness-95`}
        title={`${task.name}${task.projetRef ? '\n' + task.projetRef : ''}${task.clientName ? ' - ' + task.clientName : ''}${task.type ? '\nType: ' + task.type : ''}`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleDone(task) }}
          className="shrink-0 mt-0.5 text-gray-300 hover:text-green-500 transition"
        >
          {task.done ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Circle className="w-3 h-3" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-gray-800">{task.name}</div>
          {(task.projetRef || task.clientName) && (
            <div className="truncate text-[9px] text-gray-400">
              {[task.projetRef, task.clientName].filter(Boolean).join(' - ')}
            </div>
          )}
        </div>
        {task.assigneManuel && (
          <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[9px] font-bold mt-0.5" title={task.assigneManuel}>
            {task.assigneManuel.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
    )
  }

  const isWeek = calendarMode === 'week'
  const cellMinH = isWeek ? 'min-h-[400px]' : 'min-h-[110px]'
  const maxVisible = isWeek ? 50 : 4

  return (
    <div className="flex flex-col gap-3">
      {/* Sans date strip */}
      <div
        className={`rounded-xl border border-dashed border-gray-200 bg-white px-3 py-2 transition-colors
          ${dragOverDate === '__none__' ? 'ring-1 ring-inset ring-indigo-300 bg-indigo-50 border-solid' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); setDragOverDate('__none__') }}
        onDragLeave={handleDragLeave}
        onDrop={handleDropUnscheduled}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-400 shrink-0 whitespace-nowrap">
            Sans date <span className="text-gray-300">({unscheduled.length})</span>
          </span>
          {unscheduled.length === 0 ? (
            <span className="text-[10px] text-gray-300 italic">Aucune task — dépose ici pour désassigner une date</span>
          ) : (
            <div className="flex gap-1 flex-wrap flex-1 min-w-0">
              {unscheduled.map((task) => (
                <TaskPill key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main calendar */}
      <div className="min-w-0">
        {/* Header: nav + mode toggle */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
              Aujourd&apos;hui
            </button>
            <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition">
              <ChevronRight className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-semibold text-gray-800 capitalize ml-1">{periodLabel}</h3>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => onCalendarModeChange('week')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                calendarMode === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Semaine
            </button>
            <button
              onClick={() => onCalendarModeChange('month')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                calendarMode === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Mois
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-5 mb-1">
          {DAYS_FR.map((d) => (
            <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1.5">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-5 border-t border-l border-gray-200">
          {days.map((day) => {
            const dateStr = toISO(day)
            const dayTasks = tasksByDate.get(dateStr) || []
            const inMonth = isSameMonth(day, currentDate)
            const today_ = isToday(day)
            const isDragOver = dragOverDate === dateStr
            const overflow = dayTasks.length > maxVisible

            return (
              <div
                key={dateStr}
                onDragOver={(e) => handleDragOver(e, dateStr)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, dateStr)}
                onClick={() => onCreateTask?.(dateStr)}
                className={`group/cell relative border-r border-b border-gray-200 p-1 ${cellMinH} transition-colors
                  ${onCreateTask ? 'cursor-pointer' : ''}
                  ${!inMonth && calendarMode === 'month' ? 'bg-gray-50/50' : 'bg-white'}
                  ${isDragOver ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300' : 'hover:bg-indigo-50/30'}
                `}
                title={onCreateTask ? 'Cliquer pour créer une task ce jour' : undefined}
              >
                {/* Date number */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full
                    ${today_ ? 'bg-indigo-600 text-white' : !inMonth && calendarMode === 'month' ? 'text-gray-300' : 'text-gray-500'}
                  `}>
                    {format(day, 'd')}
                  </span>
                  <div className="flex items-center gap-1">
                    {onCreateTask && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onCreateTask(dateStr) }}
                        className="opacity-0 group-hover/cell:opacity-100 transition text-indigo-500 hover:text-indigo-700"
                        title="Créer une task ce jour"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {dayTasks.length > 0 && (
                      <span className="text-[9px] text-gray-400 font-medium">{dayTasks.length}</span>
                    )}
                  </div>
                </div>

                {/* Tasks */}
                <div className={`space-y-0 ${isWeek ? 'overflow-y-auto max-h-[360px]' : ''}`}>
                  {dayTasks.slice(0, maxVisible).map((task) => (
                    <TaskPill key={task.id} task={task} />
                  ))}
                  {overflow && (
                    <div className="text-[10px] text-gray-400 font-medium px-1 py-0.5">
                      +{dayTasks.length - maxVisible} autres
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
