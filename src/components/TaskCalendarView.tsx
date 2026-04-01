'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addWeeks, addMonths, subWeeks, subMonths,
  format, isSameMonth, isToday, getDay,
  eachDayOfInterval,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Circle, CheckCircle2 } from 'lucide-react'
import type { Task } from '@/types'

const TYPE_COLORS: Record<string, string> = {
  'Brief': 'border-l-blue-500 bg-blue-50',
  'Call client': 'border-l-blue-500 bg-blue-50',
  'Email client': 'border-l-sky-500 bg-sky-50',
  'Prez': 'border-l-indigo-500 bg-indigo-50',
  'Delivery': 'border-l-violet-500 bg-violet-50',
  'Envoi r\u00e9troplanning': 'border-l-purple-500 bg-purple-50',
  'Contact presta': 'border-l-teal-500 bg-teal-50',
  'Call presta': 'border-l-teal-500 bg-teal-50',
  'Retour presta': 'border-l-teal-400 bg-teal-50',
  'COGS': 'border-l-green-500 bg-green-50',
  'Demande float': 'border-l-lime-500 bg-lime-50',
  'Matos': 'border-l-yellow-500 bg-yellow-50',
  'Shooting': 'border-l-orange-500 bg-orange-50',
  'Prepa Tournage': 'border-l-orange-400 bg-orange-50',
  'Casting VO': 'border-l-pink-500 bg-pink-50',
  'Casting acteur': 'border-l-pink-400 bg-pink-50',
  'Task interne': 'border-l-gray-400 bg-gray-50',
  'Check': 'border-l-slate-400 bg-slate-50',
  'Calendar': 'border-l-slate-400 bg-slate-50',
}

function getTypeColor(type?: string): string {
  if (!type) return 'border-l-gray-300 bg-gray-50'
  return TYPE_COLORS[type] ?? 'border-l-indigo-400 bg-indigo-50'
}

interface Props {
  tasks: Task[]
  calendarMode: 'week' | 'month'
  onCalendarModeChange: (mode: 'week' | 'month') => void
  onTaskDateChange: (taskId: string, newDate: string) => Promise<void>
  onToggleDone: (task: Task) => void
  onTaskClick: (task: Task) => void
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven']

export default function TaskCalendarView({ tasks, calendarMode, onCalendarModeChange, onTaskDateChange, onToggleDone, onTaskClick }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

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
        onClick={() => onTaskClick(task)}
        className={`group flex items-start gap-1 px-1.5 py-1 rounded border-l-[3px] cursor-pointer active:cursor-grabbing transition-colors text-[11px] leading-tight mb-0.5
          ${getTypeColor(task.type)}
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
    <div className="flex gap-3">
      {/* Main calendar */}
      <div className="flex-1 min-w-0">
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
                className={`border-r border-b border-gray-200 p-1 ${cellMinH} transition-colors
                  ${!inMonth && calendarMode === 'month' ? 'bg-gray-50/50' : 'bg-white'}
                  ${isDragOver ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300' : ''}
                `}
              >
                {/* Date number */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full
                    ${today_ ? 'bg-indigo-600 text-white' : !inMonth && calendarMode === 'month' ? 'text-gray-300' : 'text-gray-500'}
                  `}>
                    {format(day, 'd')}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className="text-[9px] text-gray-400 font-medium">{dayTasks.length}</span>
                  )}
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

      {/* Unscheduled sidebar */}
      <div
        className="w-48 shrink-0"
        onDragOver={(e) => { e.preventDefault(); setDragOverDate('__none__') }}
        onDragLeave={handleDragLeave}
        onDrop={handleDropUnscheduled}
      >
        <div className={`rounded-xl border border-gray-200 bg-white p-3 transition-colors sticky top-6
          ${dragOverDate === '__none__' ? 'ring-1 ring-inset ring-indigo-300 bg-indigo-50' : ''}
        `}>
          <h4 className="text-xs font-semibold text-gray-500 mb-2">
            Sans date <span className="text-gray-400">({unscheduled.length})</span>
          </h4>
          <div className="space-y-0 max-h-[500px] overflow-y-auto">
            {unscheduled.length === 0 ? (
              <p className="text-[10px] text-gray-300 py-2">Aucune task</p>
            ) : (
              unscheduled.map((task) => (
                <TaskPill key={task.id} task={task} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
