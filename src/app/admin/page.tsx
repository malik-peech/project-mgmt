'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Eye,
  Loader2,
  MessageSquarePlus,
  Bug,
  Lightbulb,
  MessageCircle,
} from 'lucide-react'

type UserRole = 'PM' | 'DA' | 'Admin' | 'Sales'
interface User {
  id: string
  name: string
  role: UserRole
  login: string
  matching: string
}

interface FeedbackItem {
  id: string
  author: string
  category: 'bug' | 'feature' | 'feedback'
  message: string
  done: boolean
  createdAt: string
}

const roleBadge: Record<UserRole, string> = {
  Admin: 'bg-purple-100 text-purple-800',
  PM: 'bg-indigo-100 text-indigo-800',
  DA: 'bg-teal-100 text-teal-800',
  Sales: 'bg-amber-100 text-amber-800',
}

export default function AdminPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const userRole = (session?.user as { role?: string })?.role

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Simulation state
  const [simulatedPm, setSimulatedPm] = useState<string>('')

  // Feedback state
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(true)

  // Edit / create state
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', login: '', password: '', role: 'PM' as UserRole, matching: '' })
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', login: '', password: '', role: 'PM' as UserRole, matching: '' })

  // Redirect non-admins
  useEffect(() => {
    if (session && userRole !== 'Admin') {
      router.push('/')
    }
  }, [session, userRole, router])

  // Load simulation state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('peechpm_simulate_pm')
    if (stored) setSimulatedPm(stored)
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users')
      if (res.ok) setUsers(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const fetchFeedback = useCallback(async () => {
    try {
      const res = await fetch('/api/feedback')
      if (res.ok) setFeedbackItems(await res.json())
    } finally {
      setFeedbackLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFeedback()
  }, [fetchFeedback])

  const toggleFeedbackDone = async (id: string, done: boolean) => {
    setFeedbackItems((prev) => prev.map((item) => item.id === id ? { ...item, done } : item))
    try {
      await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, done }),
      })
    } catch {
      fetchFeedback()
    }
  }

  const handleSimulate = (pmName: string) => {
    if (pmName) {
      localStorage.setItem('peechpm_simulate_pm', pmName)
    } else {
      localStorage.removeItem('peechpm_simulate_pm')
    }
    setSimulatedPm(pmName)
  }

  const handleCreateUser = async () => {
    if (!createForm.name.trim() || !createForm.password.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      })
      if (res.ok) {
        setShowCreate(false)
        setCreateForm({ name: '', login: '', password: '', role: 'PM', matching: '' })
        fetchUsers()
      } else {
        const data = await res.json()
        alert(data.error || 'Erreur')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateUser = async (originalName: string) => {
    setSaving(true)
    try {
      const body: Record<string, string> = { name: originalName, role: editForm.role }
      if (editForm.name !== originalName) body.newName = editForm.name
      if (editForm.password) body.password = editForm.password
      if (editForm.login) body.login = editForm.login
      if (editForm.matching) body.matching = editForm.matching

      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setEditingUser(null)
        fetchUsers()
      } else {
        const data = await res.json()
        alert(data.error || 'Erreur')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUser = async (name: string) => {
    if (!confirm(`Supprimer l'utilisateur "${name}" ?`)) return
    try {
      const res = await fetch(`/api/users?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
      if (res.ok) fetchUsers()
    } catch {
      // silent
    }
  }

  if (userRole !== 'Admin') return null

  const pmUsers = users.filter((u) => u.role === 'PM')
  const daUsers = users.filter((u) => u.role === 'DA')

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Administration</h1>

      {/* ── Simulation ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Eye className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Simuler la vue d&apos;un PM</h2>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Sélectionnez un PM pour voir l&apos;application comme s&apos;il était connecté.
        </p>
        <div className="flex items-center gap-3">
          <select
            value={simulatedPm}
            onChange={(e) => handleSimulate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[250px]"
          >
            <option value="">-- Aucune simulation (vue Admin) --</option>
            <optgroup label="PM">
              {pmUsers.map((u) => (
                <option key={u.name} value={u.name}>{u.name}</option>
              ))}
            </optgroup>
            <optgroup label="DA">
              {daUsers.map((u) => (
                <option key={u.name} value={u.name}>{u.name}</option>
              ))}
            </optgroup>
          </select>
          {simulatedPm && (
            <button
              onClick={() => handleSimulate('')}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Arrêter la simulation
            </button>
          )}
        </div>
      </div>

      {/* ── Users ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Utilisateurs</h2>
            <span className="text-sm text-gray-400">{users.length}</span>
          </div>
          <button
            onClick={() => {
              setShowCreate(true)
              setCreateForm({ name: '', login: '', password: '', role: 'PM', matching: '' })
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
          >
            <Plus className="w-4 h-4" />
            Ajouter
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_80px_1fr_150px_80px] gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              <span>Nom</span>
              <span>Login</span>
              <span>Rôle</span>
              <span>Matching</span>
              <span>Mot de passe</span>
              <span>Actions</span>
            </div>

            {/* Create row */}
            {showCreate && (
              <div className="grid grid-cols-[1fr_1fr_80px_1fr_150px_80px] gap-3 px-5 py-3 bg-indigo-50 border-b border-indigo-100 items-center">
                <input
                  type="text"
                  placeholder="Nom complet"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Login"
                  value={createForm.login}
                  onChange={(e) => setCreateForm({ ...createForm, login: e.target.value })}
                  className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}
                  className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="PM">PM</option>
                  <option value="DA">DA</option>
                  <option value="Admin">Admin</option>
                  <option value="Sales">Sales</option>
                </select>
                <input
                  type="text"
                  placeholder="Nom AT (PM manual)"
                  value={createForm.matching}
                  onChange={(e) => setCreateForm({ ...createForm, matching: e.target.value })}
                  className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Mot de passe"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleCreateUser}
                    disabled={saving}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded transition"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowCreate(false)}
                    className="p-1.5 text-gray-400 hover:bg-gray-100 rounded transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* User rows */}
            <div className="divide-y divide-gray-100">
              {users.map((user) => {
                const isEditing = editingUser === user.name

                if (isEditing) {
                  return (
                    <div key={user.id} className="grid grid-cols-[1fr_1fr_80px_1fr_150px_80px] gap-3 px-5 py-3 bg-yellow-50 items-center">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="text"
                        value={editForm.login}
                        onChange={(e) => setEditForm({ ...editForm, login: e.target.value })}
                        className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                        className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="PM">PM</option>
                        <option value="DA">DA</option>
                        <option value="Admin">Admin</option>
                      </select>
                      <input
                        type="text"
                        value={editForm.matching}
                        onChange={(e) => setEditForm({ ...editForm, matching: e.target.value })}
                        className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Nouveau mdp (vide = inchangé)"
                        value={editForm.password}
                        onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                        className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleUpdateUser(user.name)}
                          disabled={saving}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded transition"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingUser(null)}
                          className="p-1.5 text-gray-400 hover:bg-gray-100 rounded transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={user.id} className="grid grid-cols-[1fr_1fr_80px_1fr_150px_80px] gap-3 px-5 py-3 items-center hover:bg-gray-50">
                    <span className="text-sm text-gray-800 font-medium">{user.name}</span>
                    <span className="text-sm text-gray-600">{user.login}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full w-fit ${roleBadge[user.role]}`}>
                      {user.role}
                    </span>
                    <span className="text-sm text-gray-500">{user.matching}</span>
                    <span className="text-sm text-gray-400">********</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingUser(user.name)
                          setEditForm({ name: user.name, login: user.login, password: '', role: user.role, matching: user.matching })
                        }}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                        title="Modifier"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.name)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {/* ── Feedback ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-8">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
          <MessageSquarePlus className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Feedback</h2>
          <span className="text-sm text-gray-400">{feedbackItems.length}</span>
        </div>

        {feedbackLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : feedbackItems.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-8 text-center">Aucun feedback pour le moment.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {feedbackItems.map((item) => {
              const catConfig = {
                bug: { icon: Bug, label: 'Bug', cls: 'bg-red-50 text-red-700' },
                feature: { icon: Lightbulb, label: 'Feature', cls: 'bg-amber-50 text-amber-700' },
                feedback: { icon: MessageCircle, label: 'Feedback', cls: 'bg-indigo-50 text-indigo-700' },
              }[item.category]
              const CatIcon = catConfig.icon
              return (
                <div key={item.id} className={`flex items-start gap-3 px-5 py-3 ${item.done ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) => toggleFeedbackDone(item.id, e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-800">{item.author}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${catConfig.cls}`}>
                        <CatIcon className="w-3 h-3" />
                        {catConfig.label}
                      </span>
                      <span className="text-[11px] text-gray-400 ml-auto shrink-0">
                        {new Date(item.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </span>
                    </div>
                    <p className={`text-sm text-gray-600 ${item.done ? 'line-through' : ''}`}>{item.message}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
