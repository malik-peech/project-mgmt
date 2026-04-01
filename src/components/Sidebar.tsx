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
  RefreshCw,
  Users,
  MessageSquarePlus,
  Loader2,
  Bug,
  Lightbulb,
  MessageCircle,
  FileText,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Projets', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/cogs', label: 'COGS', icon: Receipt },
  { href: '/ressources', label: 'Ressources', icon: Users },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string })?.role
  const isAdmin = userRole === 'Admin'

  const [simulatedPm, setSimulatedPm] = useState<string>('')
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<string>('')
  const [showFeedback, setShowFeedback] = useState(false)
  const [fbCategory, setFbCategory] = useState<'bug' | 'feature' | 'feedback'>('feedback')
  const [fbMessage, setFbMessage] = useState('')
  const [fbSending, setFbSending] = useState(false)
  const [fbSent, setFbSent] = useState(false)

  const submitFeedback = async () => {
    if (!fbMessage.trim() || !session?.user?.name) return
    setFbSending(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: session.user.name, category: fbCategory, message: fbMessage }),
      })
      if (res.ok) {
        setFbSent(true)
        setFbMessage('')
        setTimeout(() => { setFbSent(false); setShowFeedback(false) }, 1500)
      } else {
        console.error('Feedback POST failed:', res.status, await res.text())
      }
    } catch (err) { console.error('Feedback error:', err) } finally { setFbSending(false) }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch('/api/admin/refresh', { method: 'POST' })
      setLastRefresh(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    } catch {}
    setRefreshing(false)
  }

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
          <Link
            href="/changelog"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-indigo-300 hover:text-white text-sm w-full rounded-lg hover:bg-indigo-800 transition"
          >
            <FileText className="w-4 h-4" />
            Changelog
          </Link>
          <button
            onClick={() => setShowFeedback(true)}
            className="flex items-center gap-2 px-3 py-2 text-indigo-300 hover:text-white text-sm w-full rounded-lg hover:bg-indigo-800 transition"
          >
            <MessageSquarePlus className="w-4 h-4" />
            Feedback
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-indigo-300 hover:text-white text-sm w-full rounded-lg hover:bg-indigo-800 transition disabled:opacity-50"
            title="Forcer la synchronisation avec Airtable"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Sync...' : lastRefresh ? `Sync AT · ${lastRefresh}` : 'Sync Airtable'}
          </button>
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

      {/* Feedback modal */}
      {showFeedback && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => { setShowFeedback(false); setFbSent(false) }}>
          <div className="bg-white rounded-xl shadow-2xl w-[400px] max-w-[90vw] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Envoyer un feedback</h3>
              <button onClick={() => { setShowFeedback(false); setFbSent(false) }} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category selector */}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setFbCategory('bug')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${fbCategory === 'bug' ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                <Bug className="w-3.5 h-3.5" /> Bug
              </button>
              <button onClick={() => setFbCategory('feature')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${fbCategory === 'feature' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                <Lightbulb className="w-3.5 h-3.5" /> Feature
              </button>
              <button onClick={() => setFbCategory('feedback')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${fbCategory === 'feedback' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                <MessageCircle className="w-3.5 h-3.5" /> Feedback
              </button>
            </div>

            {/* Message */}
            <textarea
              value={fbMessage}
              onChange={(e) => setFbMessage(e.target.value)}
              placeholder="Décrivez votre retour..."
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none mb-4"
              autoFocus
            />

            {/* Submit */}
            {fbSent ? (
              <div className="text-center text-green-600 text-sm font-medium py-2">
                Merci pour votre feedback !
              </div>
            ) : (
              <button
                onClick={submitFeedback}
                disabled={fbSending || !fbMessage.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {fbSending && <Loader2 className="w-4 h-4 animate-spin" />}
                Envoyer
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
