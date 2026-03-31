'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X, Calendar } from 'lucide-react'

interface Props {
  value: string       // ISO date YYYY-MM-DD
  onChange: (v: string) => void
  min?: string        // ISO date YYYY-MM-DD
  placeholder?: string
  className?: string
  clearable?: boolean
  size?: 'sm' | 'md'
  autoOpen?: boolean
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]
const DAYS_FR = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

function parseDate(s: string): Date | null {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatDisplay(s: string): string {
  const d = parseDate(s)
  if (!d) return ''
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DatePicker({ value, onChange, min, placeholder = 'Choisir une date', className = '', clearable = false, size = 'md', autoOpen = false }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoOpen) setOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const minDate = min ? parseDate(min) : null
  const selected = parseDate(value)

  const initView = () => {
    const base = selected || today
    return { year: base.getFullYear(), month: base.getMonth() }
  }
  const [view, setView] = useState(initView)

  // Sync view when value changes externally
  useEffect(() => {
    setView(initView())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const prevMonth = () => {
    setView((v) => {
      const d = new Date(v.year, v.month - 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }
  const nextMonth = () => {
    setView((v) => {
      const d = new Date(v.year, v.month + 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  // Build calendar grid (Mon-Sun)
  const firstDay = new Date(view.year, view.month, 1)
  const lastDay = new Date(view.year, view.month + 1, 0)

  // Day of week for first day (0=Sun → convert to Mon-based)
  const startDow = (firstDay.getDay() + 6) % 7 // Mon=0

  const cells: (Date | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(new Date(view.year, view.month, d))
  }
  // Pad to complete weeks
  while (cells.length % 7 !== 0) cells.push(null)

  const pickDay = (d: Date) => {
    if (minDate && d < minDate) return
    onChange(toISO(d))
    setOpen(false)
  }

  const isDisabled = (d: Date) => !!minDate && d < minDate
  const isSelected = (d: Date) => selected ? toISO(d) === toISO(selected) : false
  const isToday = (d: Date) => toISO(d) === toISO(today)

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 border border-gray-200 rounded-lg text-left bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition
          ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}
          ${open ? 'ring-2 ring-indigo-500 border-transparent' : ''}`}
      >
        <Calendar className={`${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-gray-400 shrink-0`} />
        <span className={`flex-1 truncate ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        {clearable && value && (
          <span
            role="button"
            onMouseDown={(e) => { e.stopPropagation(); onChange('') }}
            className="shrink-0 p-0.5 rounded hover:bg-gray-100 text-gray-400"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* Calendar dropdown */}
      {open && (
        <div className="absolute z-[100] mt-1 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-64">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-800">
              {MONTHS_FR[view.month]} {view.year}
            </span>
            <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_FR.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />
              const disabled = isDisabled(day)
              const selected_ = isSelected(day)
              const today_ = isToday(day)
              return (
                <button
                  key={toISO(day)}
                  type="button"
                  onClick={() => pickDay(day)}
                  disabled={disabled}
                  className={`w-8 h-8 mx-auto flex items-center justify-center rounded-lg text-xs font-medium transition
                    ${disabled ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer hover:bg-indigo-50 hover:text-indigo-700'}
                    ${selected_ ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white' : ''}
                    ${today_ && !selected_ ? 'border border-indigo-300 text-indigo-600' : ''}
                    ${!selected_ && !today_ && !disabled ? 'text-gray-700' : ''}
                  `}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>

          {/* Today shortcut */}
          {!minDate || today >= minDate ? (
            <div className="mt-2 pt-2 border-t border-gray-100 text-center">
              <button
                type="button"
                onClick={() => { onChange(toISO(today)); setOpen(false) }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Aujourd&apos;hui
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
