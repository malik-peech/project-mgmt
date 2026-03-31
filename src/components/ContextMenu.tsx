'use client'

import { useEffect, useRef } from 'react'

type MenuItem = {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
} | {
  separator: true
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 100,
  }

  return (
    <div ref={ref} style={style} className="bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 min-w-[180px] animate-in fade-in">
      {items.map((item, i) => (
        'separator' in item ? (
          <div key={i} className="border-t border-gray-100 my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose() }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
              item.danger
                ? 'text-red-600 hover:bg-red-50'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            {item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
            {item.label}
          </button>
        )
      ))}
    </div>
  )
}
