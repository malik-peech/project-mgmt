'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import {
  Plus,
  X,
  Search,
  Check,
  FileText,
  TrendingUp,
  CreditCard,
  Wallet,
  Copy,
  Trash2,
} from 'lucide-react'
import ContextMenu from '@/components/ContextMenu'
import type { Cogs, StatutCogs, Projet, Ressource } from '@/types'

const statutColors: Record<string, string> = {
  'A Approuver (CDP)': 'bg-pink-100 text-pink-800',
  'A Approuver (CSM)': 'bg-teal-100 text-teal-800',
  'A Approuver': 'bg-pink-100 text-pink-800',
  'Estimée': 'bg-blue-100 text-blue-800',
  'Engagée': 'bg-yellow-100 text-yellow-800',
  'A payer': 'bg-orange-100 text-orange-800',
  'Autorisée via flash': 'bg-indigo-100 text-indigo-800',
  'Payée': 'bg-green-100 text-green-800',
  'Annulée': 'bg-red-100 text-red-800',
  'Refusée': 'bg-red-100 text-red-800',
  'Stand-by': 'bg-gray-100 text-gray-800',
}

const statutTabs: (string | 'Tous')[] = [
  'Tous',
  'A Approuver (CDP)',
  'Engagée',
  'A payer',
  'Payée',
]

const fmt = (n?: number) =>
  n != null
    ? new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(n)
    : '\u2014'

export default function CogsPage() {
  const { data: session } = useSession()
  const [cogs, setCogs] = useState<Cogs[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Tous')
  const [showModal, setShowModal] = useState(false)

  // Modal state
  const [projets, setProjets] = useState<Projet[]>([])
  const [ressources, setRessources] = useState<Ressource[]>([])
  const [formProjetId, setFormProjetId] = useState('')
  const [formRessourceId, setFormRessourceId] = useState('')
  const [formMontant, setFormMontant] = useState('')
  const [formCommentaire, setFormCommentaire] = useState('')
  const [ressourceSearch, setRessourceSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cog: Cogs } | null>(null)

  const deleteCog = async (cog: Cogs) => {
    try {
      await fetch(`/api/cogs/${cog.id}`, { method: 'DELETE' })
      setCogs(prev => prev.filter(c => c.id !== cog.id))
    } catch (err) {
      console.error('Failed to delete cog', err)
    }
  }

  const duplicateCog = async (cog: Cogs) => {
    try {
      const res = await fetch('/api/cogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projetId: cog.projetId,
          ressourceId: cog.ressourceId,
          montantEngageProd: cog.montantEngageProd,
          commentaire: cog.commentaire ? `${cog.commentaire} (copie)` : '(copie)',
        }),
      })
      if (res.ok) fetchCogs()
    } catch (err) {
      console.error('Failed to duplicate cog', err)
    }
  }

  const fetchCogs = () => {
    if (!session?.user?.name) return
    const role = (session.user as { role?: string }).role
    const params = new URLSearchParams()
    if (role !== 'Admin') {
      params.set('pm', session.user.name)
    }
    fetch(`/api/cogs?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setCogs(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchCogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // Fetch projets and ressources when modal opens
  useEffect(() => {
    if (!showModal) return
    fetch('/api/projets')
      .then((r) => r.json())
      .then(setProjets)
      .catch(() => {})
    fetch('/api/ressources')
      .then((r) => r.json())
      .then(setRessources)
      .catch(() => {})
  }, [showModal])

  const filtered = useMemo(() => {
    if (activeTab === 'Tous') return cogs
    return cogs.filter((c) => c.statut === activeTab)
  }, [cogs, activeTab])

  const totalEngage = useMemo(
    () => cogs.reduce((sum, c) => sum + (c.montantEngageProd || 0), 0),
    [cogs]
  )

  const totalAPayer = useMemo(
    () =>
      cogs
        .filter((c) => c.statut === 'A payer')
        .reduce((sum, c) => sum + (c.montantTTC || c.montantEngageProd || 0), 0),
    [cogs]
  )

  const totalPaye = useMemo(
    () =>
      cogs
        .filter((c) => c.statut === 'Payée')
        .reduce((sum, c) => sum + (c.montantTTC || c.montantEngageProd || 0), 0),
    [cogs]
  )

  const filteredRessources = useMemo(() => {
    if (!ressourceSearch) return ressources
    const q = ressourceSearch.toLowerCase()
    return ressources.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.categorie?.some((c) => c.toLowerCase().includes(q))
    )
  }, [ressources, ressourceSearch])

  const handleSubmit = async () => {
    if (!formProjetId || !formRessourceId || !formMontant) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/cogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projetId: formProjetId,
          ressourceId: formRessourceId,
          montantEngageProd: parseFloat(formMontant),
          commentaire: formCommentaire || undefined,
        }),
      })
      if (res.ok) {
        setShowModal(false)
        resetForm()
        fetchCogs()
      }
    } catch {
      // silent
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormProjetId('')
    setFormRessourceId('')
    setFormMontant('')
    setFormCommentaire('')
    setRessourceSearch('')
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl" />
            ))}
          </div>
          <div className="h-96 bg-gray-100 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">COGS</h1>
          <p className="text-sm text-gray-500 mt-1">
            {cogs.length} d&eacute;pense{cogs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          <Plus className="w-4 h-4" />
          Nouvelle d&eacute;pense
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Total engag&eacute;</p>
              <p className="text-lg font-bold text-gray-900">{fmt(totalEngage)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Total &agrave; payer</p>
              <p className="text-lg font-bold text-gray-900">{fmt(totalAPayer)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Total pay&eacute;</p>
              <p className="text-lg font-bold text-gray-900">{fmt(totalPaye)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {statutTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              activeTab === tab
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab}
            {tab !== 'Tous' && (
              <span className="ml-1.5 text-xs opacity-75">
                {cogs.filter((c) => c.statut === tab).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Aucune d&eacute;pense</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    N&deg; Commande
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Client / Projet
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Ressource
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Cat&eacute;gorie
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Montant HT
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Montant TTC
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    BDC
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50/50 transition"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY, cog: c })
                    }}
                  >
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {c.numeroCommande || '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-indigo-600 font-medium">
                        {c.clientName || '\u2014'}
                      </div>
                      <div className="text-gray-900 text-sm truncate max-w-[200px]">
                        {c.projetId ? `#${c.projetId.slice(0, 6)}` : '\u2014'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.ressourceName || '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      {c.categorie ? (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {c.categorie}
                        </span>
                      ) : (
                        '\u2014'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {fmt(c.montantEngageProd)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {fmt(c.montantTTC)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.statut ? (
                        <span
                          className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full ${
                            statutColors[c.statut] || 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {c.statut}
                        </span>
                      ) : (
                        '\u2014'
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.bdcEnvoye ? (
                        <Check className="w-4 h-4 text-green-600 mx-auto" />
                      ) : (
                        <span className="text-gray-300">\u2014</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Dupliquer', icon: <Copy className="w-4 h-4" />, onClick: () => duplicateCog(contextMenu.cog) },
            { separator: true },
            { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, onClick: () => deleteCog(contextMenu.cog), danger: true },
          ]}
        />
      )}

      {/* Modal: Nouvelle depense */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setShowModal(false)
              resetForm()
            }}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                Nouvelle d&eacute;pense
              </h2>
              <button
                onClick={() => {
                  setShowModal(false)
                  resetForm()
                }}
                className="p-1 rounded-lg hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Projet */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Projet <span className="text-red-500">*</span>
                </label>
                <select
                  value={formProjetId}
                  onChange={(e) => setFormProjetId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">S&eacute;lectionner un projet</option>
                  {projets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.clientName ? `${p.clientName} - ` : ''}
                      {p.nom}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ressource with search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ressource <span className="text-red-500">*</span>
                </label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Rechercher une ressource..."
                    value={ressourceSearch}
                    onChange={(e) => setRessourceSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <select
                  value={formRessourceId}
                  onChange={(e) => setFormRessourceId(e.target.value)}
                  size={5}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">S&eacute;lectionner une ressource</option>
                  {filteredRessources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.categorie?.length ? ` (${r.categorie.join(', ')})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Montant */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Montant HT engag&eacute; <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={formMontant}
                    onChange={(e) => setFormMontant(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    &euro;
                  </span>
                </div>
              </div>

              {/* Commentaire */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Commentaire
                </label>
                <textarea
                  rows={3}
                  placeholder="Ajouter un commentaire..."
                  value={formCommentaire}
                  onChange={(e) => setFormCommentaire(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false)
                  resetForm()
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formProjetId || !formRessourceId || !formMontant || submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Cr\u00e9ation...' : 'Cr\u00e9er la d\u00e9pense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
