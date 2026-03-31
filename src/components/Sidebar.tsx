'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  ListTodo,
  Receipt,
  Settings,
  Menu,
  X,
  LogOut,
  Eye,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Projets', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/cogs', label: 'COGS', icon: Receipt },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string })?.role
  const isAdmin = userRole === 'Admin'

  const [simulatedPm, setSimulatedPm] = useState<string>('')

  useEffect(() => {
    const check = () => {
      const stored = localStorage.getItem('peechpm_simulate_pm') || ''
      setSimulatedPm(stored)
    }
    check()
    // Listen for storage changes (from admin page)
    window.addEventListener('storage', check)
    // Poll for same-tab changes
    const interval = setInterval(check, 1000)
    return () => {
      window.removeEventListener('storage', check)
      clearInterval(interval)
    }
  }, [])

  const stopSimulation = () => {
    localStorage.removeItem('peechpm_simulate_pm')
    setSimulatedPm('')
  }

  const allNavItems = isAdmin
    ? [...navItems, { href: '/admin', label: 'Admin', icon: Settings }]
    : navItems

  const NavContent = () => (
    <>
      <div className="flex items-center gap-2 px-6 py-5 border-b border-indigo-800">
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
          <LayoutDashboard className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-bold text-lg tracking-tight">
          Peech PM
        </span>
      </div>

      {/* Simulation banner */}
      {isAdmin && simulatedPm && (
        <div className="mx-3 mt-3 px-3 py-2 bg-amber-500/20 border border-amber-500/30 rounded-lg">
          <div className="flex items-center gap-1.5 mb-1">
            <Eye className="w-3 h-3 text-amber-300" />
            <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider">Simulation</span>
          </div>
          <p className="text-xs text-amber-100 font-medium truncate">{simulatedPm}</p>
          <button
            onClick={stopSimulation}
            className="text-[10px] text-amber-300 hover:text-white underline mt-1"
          >
            Arrêter
          </button>
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-1">
        {allNavItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {session?.user && (
        <div className="px-3 py-4 border-t border-indigo-800">
          <div className="px-3 mb-2">
            <p className="text-white text-sm font-medium truncate">{session.user.name}</p>
            <p className="text-indigo-300 text-xs">{userRole}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-2 px-3 py-2 text-indigo-300 hover:text-white text-sm w-full rounded-lg hover:bg-indigo-800 transition"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-40 md:hidden p-2 rounded-lg bg-[var(--color-sidebar)] text-white shadow-lg"
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[250px] bg-[var(--color-sidebar)] flex flex-col transform transition-transform duration-300 ease-in-out md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1 text-indigo-300 hover:text-white"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
        <NavContent />
      </aside>

      <aside className="hidden md:flex w-[250px] shrink-0 flex-col bg-[var(--color-sidebar)] min-h-screen">
        <NavContent />
      </aside>
    </>
  )
}
