'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { ChevronDown, X, Search } from 'lucide-react'

export interface ComboOption {
  value: string
  label: string
  sub?: string // secondary line (e.g. client name)
}

interface Props {
  options: ComboOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  clearable?: boolean
  className?: string
  size?: 'sm' | 'md'
}

export default function ComboSelect({
  options,
  value,
  onChange,
  placeholder = 'Sélectionner…',
  clearable = false,
  className = '',
  size = 'md',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [highlighted, setHighlighted] = useState(0)
  const id = useId()

  const selected = options.find((o) => o.value === value)

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.sub?.toLowerCase().includes(query.toLowerCase())
      )
    : options

  useEffect(() => {
    setHighlighted(0)
  }, [query, open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const select = (val: string) => {
    onChange(val)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        setOpen(true)
        e.preventDefault()
      }
      return
    }
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { setHighlighted((h) => Math.min(h + 1, filtered.length - 1)); e.preventDefault() }
    if (e.key === 'ArrowUp') { setHighlighted((h) => Math.max(h - 1, 0)); e.preventDefault() }
    if (e.key === 'Enter') {
      if (filtered[highlighted]) { select(filtered[highlighted].value); e.preventDefault() }
    }
  }

  const isSmall = size === 'sm'

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        type="button"
        id={id}
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50) }}
        className={`w-full flex items-center justify-between gap-2 border border-gray-200 rounded-lg bg-white text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500
          ${isSmall ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'}
          ${open ? 'ring-2 ring-indigo-500 border-transparent' : 'hover:border-gray-300'}`}
      >
        <span className={`truncate flex-1 ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="shrink-0 flex items-center gap-1">
          {clearable && value && (
            <span
              role="button"
              onMouseDown={(e) => { e.stopPropagation(); onChange('') }}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[100] mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {clearable && (
              <button
                type="button"
                onClick={() => select('')}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 italic"
              >
                — Aucun —
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400 text-center">Aucun résultat</p>
            ) : (
              filtered.map((opt, i) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => select(opt.value)}
                  className={`w-full text-left px-3 py-2 transition
                    ${i === highlighted ? 'bg-indigo-50' : 'hover:bg-gray-50'}
                    ${opt.value === value ? 'text-indigo-700 font-medium' : 'text-gray-800'}`}
                  onMouseEnter={() => setHighlighted(i)}
                >
                  <span className="block text-sm truncate">{opt.label}</span>
                  {opt.sub && <span className="block text-xs text-gray-400 truncate">{opt.sub}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
