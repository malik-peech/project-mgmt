'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useData } from '@/hooks/useData'
import {
  Plus, X, Search, Check, FileText, Copy, Trash2, RefreshCw, AlertTriangle, Loader2, Upload, CloudUpload,
  ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'
import ContextMenu from '@/components/ContextMenu'
import ComboSelect from '@/components/ComboSelect'
import FileViewer from '@/components/FileViewer'
import type { Cogs, Projet, Ressource } from '@/types'

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

const statutTabs: string[] = ['Tous', 'A Approuver (CDP)', 'Engagée', 'A payer', 'Payée']

const fmt = (n?: number) =>
  n != null
    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
    : '—'

export default function CogsPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState('Tous')
  const [search, setSearch] = useState('')
  const [projetFilter, setProjetFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selectedCog, setSelectedCog] = useState<Cogs | null>(null)
  const [uploadingCog, setUploadingCog] = useState(false)
  const [sortField, setSortField] = useState<'projetRef' | 'ressourceName' | 'categorie' | 'montantBudgeteSales' | 'montantEngageProd' | 'statut' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [ressourceFilter, setRessourceFilter] = useState('')
  const [categorieFilter, setCategorieFilter] = useState('')

  // Modal state
  const [formProjetId, setFormProjetId] = useState('')
  const [formRessourceId, setFormRessourceId] = useState('')
  const [formMontant, setFormMontant] = useState('')
  const [formCommentaire, setFormCommentaire] = useState('')
  const [ressourceSearch, setRessourceSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cog: Cogs } | null>(null)

  // Side panel edit state
  const [editNumFacture, setEditNumFacture] = useState('')
  const [editCommentaire, setEditCommentaire] = useState('')
  const [savingCog, setSavingCog] = useState(false)

  const userName = session?.user?.name || ''
  const userRole = (session?.user as { role?: string })?.role || 'PM'
  const pmParam = userRole !== 'Admin' && userName ? `pm=${encodeURIComponent(userName)}` : ''
  const ready = !!session?.user?.name

  const { data: cogs, mutate: mutateCogs, revalidate: revalidateCogs, loading, error } = useData<Cogs[]>(
    ready ? `/api/cogs?${pmParam}` : null,
    { key: `cogs-${pmParam}`, enabled: ready }
  )

  const { data: projets } = useData<Projet[]>(
    showModal ? '/api/projets' : null,
    { key: 'projets-all', enabled: showModal, staleTime: 60_000 }
  )

  const { data: ressources } = useData<Ressource[]>(
    showModal ? '/api/ressources' : null,
    { key: 'ressources-all', enabled: showModal, staleTime: 60_000 }
  )

  const cogsList = cogs ?? []
  const projetList = projets ?? []
  const ressourceList = ressources ?? []

  // Keep selectedCog in sync with refreshed cogs data
  useEffect(() => {
    if (selectedCog && cogs) {
      const updated = cogs.find((c) => c.id === selectedCog.id)
      if (updated) setSelectedCog(updated)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cogs])

  // Unique projects from COGS for filter
  const cogsProjets = useMemo(() => {
    const map = new Map<string, { id: string; ref?: string; name: string; client?: string }>()
    for (const c of cogsList) {
      if (c.projetId) {
        map.set(c.projetId, { id: c.projetId, ref: c.projetRef, name: c.projetName || '', client: c.clientName })
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [cogsList])

  const cogsProjetOptions = useMemo(() =>
    cogsProjets.map((p) => ({
      value: p.id,
      label: p.name,
      sub: [p.ref, p.client].filter(Boolean).join(' · ') || undefined,
    })),
    [cogsProjets]
  )

  // Unique ressource names for filter
  const cogsRessources = useMemo(() => {
    const set = new Set<string>()
    for (const c of cogsList) if (c.ressourceName) set.add(c.ressourceName)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [cogsList])

  const cogsRessourceOptions = useMemo(() =>
    cogsRessources.map((r) => ({ value: r, label: r })),
    [cogsRessources]
  )

  // Unique categories for filter
  const cogsCategories = useMemo(() => {
    const set = new Set<string>()
    for (const c of cogsList) if (c.categorie) set.add(c.categorie)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [cogsList])

  const projetComboOptions = useMemo(() =>
    projetList.map((p) => ({
      value: p.id,
      label: p.nom,
      sub: [p.ref, p.clientName].filter(Boolean).join(' · ') || undefined,
    })),
    [projetList]
  )

  const deleteCog = async (cog: Cogs) => {
    mutateCogs(prev => (prev ?? []).filter(c => c.id !== cog.id))
    if (selectedCog?.id === cog.id) setSelectedCog(null)
    try {
      await fetch(`/api/cogs/${cog.id}`, { method: 'DELETE' })
    } catch { revalidateCogs() }
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
      if (res.ok) revalidateCogs()
    } catch {}
  }

  const saveCogEdits = async () => {
    if (!selectedCog) return
    setSavingCog(true)
    try {
      const body: Record<string, unknown> = {}
      if (editNumFacture !== (selectedCog.numeroFacture || '')) body.numeroFacture = editNumFacture
      if (editCommentaire !== (selectedCog.commentaire || '')) body.commentaire = editCommentaire
      if (Object.keys(body).length > 0) {
        await fetch(`/api/cogs/${selectedCog.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        revalidateCogs()
      }
    } catch {} finally { setSavingCog(false) }
  }

  const handleUpload = async (files: File[]) => {
    if (!selectedCog || files.length === 0) return
    setUploadingCog(true)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('files', f, f.name)
      const res = await fetch(`/api/cogs/${selectedCog.id}/upload`, { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.text()
        console.error('Upload failed:', err)
        throw new Error(err)
      }
      // Wait for Airtable to download and process the file, then force server-side store refresh
      await new Promise((r) => setTimeout(r, 4000))
      await fetch('/api/admin/refresh', { method: 'POST' })
      await revalidateCogs()
      // Update selectedCog with fresh data
      const cogId = selectedCog.id
      setTimeout(() => {
        mutateCogs((prev) => {
          const fresh = prev?.find((c) => c.id === cogId)
          if (fresh) setSelectedCog({ ...fresh })
          return prev
        })
      }, 100)
    } finally {
      setUploadingCog(false)
    }
  }

  const deleteAttachment = async (cogId: string, attachmentIndex: number) => {
    const cog = cogsList.find((c) => c.id === cogId)
    if (!cog?.facture) return
    const remaining = cog.facture.filter((_, i) => i !== attachmentIndex)
    // Optimistic update
    mutateCogs((prev) =>
      (prev ?? []).map((c) => c.id === cogId ? { ...c, facture: remaining.length > 0 ? remaining : undefined } : c)
    )
    try {
      // PATCH Airtable: send remaining attachment ids to keep
      await fetch(`/api/cogs/${cogId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeAttachmentIndex: attachmentIndex }),
      })
      await fetch('/api/admin/refresh', { method: 'POST' })
      await revalidateCogs()
    } catch {
      revalidateCogs()
    }
  }

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    let list = cogsList
    if (activeTab !== 'Tous') list = list.filter((c) => c.statut === activeTab)
    if (projetFilter) list = list.filter((c) => c.projetId === projetFilter)
    if (ressourceFilter) list = list.filter((c) => c.ressourceName === ressourceFilter)
    if (categorieFilter) list = list.filter((c) => c.categorie === categorieFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((c) =>
        c.ressourceName?.toLowerCase().includes(q) ||
        c.clientName?.toLowerCase().includes(q) ||
        c.projetName?.toLowerCase().includes(q) ||
        c.projetRef?.toLowerCase().includes(q) ||
        c.numeroCommande?.toLowerCase().includes(q) ||
        c.categorie?.toLowerCase().includes(q)
      )
    }
    if (sortField) {
      list = [...list].sort((a, b) => {
        const aVal = a[sortField]
        const bVal = b[sortField]
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        const cmp = typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal), 'fr')
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [cogsList, activeTab, projetFilter, ressourceFilter, categorieFilter, search, sortField, sortDir])

  const filteredRessources = useMemo(() => {
    if (!ressourceSearch) return ressourceList
    const q = ressourceSearch.toLowerCase()
    return ressourceList.filter(
      (r) => r.name.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) || r.categorie?.some((c) => c.toLowerCase().includes(q))
    )
  }, [ressourceList, ressourceSearch])

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
        revalidateCogs()
      }
    } catch {} finally { setSubmitting(false) }
  }

  const resetForm = () => {
    setFormProjetId('')
    setFormRessourceId('')
    setFormMontant('')
    setFormCommentaire('')
    setRessourceSearch('')
  }

  const openCogPanel = (cog: Cogs) => {
    setSelectedCog(cog)
    setEditNumFacture(cog.numeroFacture || '')
    setEditCommentaire(cog.commentaire || '')
  }

  if (loading && !cogs) {
    return (
      <div className="p-6 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-96 bg-gray-100 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error && !cogs) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <AlertTriangle className="w-10 h-10 text-orange-400 mb-3" />
          <p className="text-lg font-medium mb-1">Impossible de charger les COGS</p>
          <button onClick={() => revalidateCogs()} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition mt-3">
            <RefreshCw className="w-4 h-4" /> Réessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh)] overflow-hidden">
      {/* Main content */}
      <div className="flex-1 overflow-auto min-w-0">
        <div className="p-6 md:p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">COGS</h1>
              <p className="text-sm text-gray-500 mt-0.5">{cogsList.length} dépense{cogsList.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await fetch('/api/admin/refresh', { method: 'POST' })
                  await revalidateCogs()
                }}
                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                title="Synchroniser avec Airtable"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
              >
                <Plus className="w-4 h-4" /> Nouvelle dépense
              </button>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="space-y-3 mb-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher une dépense, ressource, projet..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status tabs */}
              <div className="flex gap-1 flex-wrap">
                {statutTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${
                      activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tab}
                    {tab !== 'Tous' && (
                      <span className="ml-1 opacity-75">{cogsList.filter((c) => c.statut === tab).length}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Project filter */}
              <div className="w-48">
                <ComboSelect
                  options={cogsProjetOptions}
                  value={projetFilter}
                  onChange={setProjetFilter}
                  placeholder="Tous les projets"
                  clearable
                  size="sm"
                />
              </div>

              {/* Ressource filter */}
              <div className="w-44">
                <ComboSelect
                  options={cogsRessourceOptions}
                  value={ressourceFilter}
                  onChange={setRessourceFilter}
                  placeholder="Ressource"
                  clearable
                  size="sm"
                />
              </div>

              {/* Catégorie filter */}
              <div className="w-44">
                <ComboSelect
                  options={cogsCategories.map((c) => ({ value: c, label: c }))}
                  value={categorieFilter}
                  onChange={setCategorieFilter}
                  placeholder="Catégorie"
                  clearable
                  size="sm"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">Aucune dépense</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      {[
                        { key: 'projetRef', label: 'Code / Projet', align: 'left' },
                        { key: 'ressourceName', label: 'Ressource', align: 'left' },
                        { key: 'categorie', label: 'Catégorie', align: 'left' },
                        { key: 'montantBudgeteSales', label: 'HT sales', align: 'right' },
                        { key: 'montantEngageProd', label: 'HT engagé', align: 'right' },
                        { key: 'statut', label: 'Statut', align: 'center' },
                      ].map(({ key, label, align }) => (
                        <th
                          key={key}
                          className={`px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 transition ${
                            align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                          }`}
                          onClick={() => toggleSort(key as typeof sortField)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            {sortField === key ? (
                              sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-30" />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((c) => (
                      <tr
                        key={c.id}
                        className={`group hover:bg-gray-50/50 transition cursor-pointer ${selectedCog?.id === c.id ? 'bg-indigo-50' : ''}`}
                        onClick={() => openCogPanel(c)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setContextMenu({ x: e.clientX, y: e.clientY, cog: c })
                        }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            {c.projetRef && <span className="text-xs font-mono text-gray-500">{c.projetRef}</span>}
                            {c.numeroCommande && (
                              <span className="text-xs font-mono font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                {c.numeroCommande}
                              </span>
                            )}
                            {!c.projetRef && !c.numeroCommande && <span className="text-xs text-gray-400">—</span>}
                          </div>
                          <div className="text-sm text-gray-900 truncate max-w-[200px]">{c.projetName || '—'}</div>
                          {c.clientName && <div className="text-xs text-indigo-600">{c.clientName}</div>}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setRessourceFilter(ressourceFilter === c.ressourceName ? '' : (c.ressourceName || ''))
                            }}
                            className={`text-left hover:text-indigo-600 transition ${ressourceFilter === c.ressourceName ? 'text-indigo-600 font-medium' : ''}`}
                            title="Filtrer par ressource"
                          >
                            {c.ressourceName || '—'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          {c.categorie ? (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.categorie}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-500 tabular-nums">{fmt(c.montantBudgeteSales)}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 tabular-nums">{fmt(c.montantEngageProd)}</td>
                        <td className="px-4 py-3 text-center">
                          {c.statut ? (
                            <span className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full ${statutColors[c.statut] || 'bg-gray-100 text-gray-600'}`}>
                              {c.statut}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile backdrop */}
      {selectedCog && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setSelectedCog(null)} />
      )}

      {/* Side panel */}
      <div
        className={`fixed md:relative right-0 top-0 h-full z-40 md:z-0 bg-white border-l border-gray-200 shadow-xl md:shadow-none overflow-y-auto transition-all duration-300 ease-in-out ${
          selectedCog
            ? 'w-full md:w-[420px] translate-x-0 opacity-100'
            : 'w-0 md:w-0 translate-x-full md:translate-x-full opacity-0'
        }`}
      >
        {selectedCog && (
          <CogSidePanel
            cog={selectedCog}
            onClose={() => setSelectedCog(null)}
            editNumFacture={editNumFacture}
            setEditNumFacture={setEditNumFacture}
            editCommentaire={editCommentaire}
            setEditCommentaire={setEditCommentaire}
            onSave={saveCogEdits}
            saving={savingCog}
            onUpload={handleUpload}
            uploading={uploadingCog}
            onDeleteAttachment={deleteAttachment}
          />
        )}
      </div>

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
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowModal(false); resetForm() }} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Nouvelle dépense</h2>
              <button onClick={() => { setShowModal(false); resetForm() }} className="p-1 rounded-lg hover:bg-gray-100 transition">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projet <span className="text-red-500">*</span></label>
                <ComboSelect
                  options={projetComboOptions}
                  value={formProjetId}
                  onChange={setFormProjetId}
                  placeholder="Sélectionner un projet"
                  clearable
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ressource <span className="text-red-500">*</span></label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" placeholder="Rechercher une ressource..." value={ressourceSearch}
                    onChange={(e) => setRessourceSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <select value={formRessourceId} onChange={(e) => setFormRessourceId(e.target.value)} size={5}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Sélectionner une ressource</option>
                  {filteredRessources.map((r) => <option key={r.id} value={r.id}>{r.name}{r.categorie?.length ? ` (${r.categorie.join(', ')})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant HT engagé <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={formMontant}
                    onChange={(e) => setFormMontant(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commentaire</label>
                <textarea rows={3} placeholder="Ajouter un commentaire..." value={formCommentaire}
                  onChange={(e) => setFormCommentaire(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowModal(false); resetForm() }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Annuler</button>
              <button onClick={handleSubmit} disabled={!formProjetId || !formRessourceId || !formMontant || submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
                {submitting ? 'Création...' : 'Créer la dépense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── COGS Side Panel ─── */

function CogSidePanel({
  cog,
  onClose,
  editNumFacture,
  setEditNumFacture,
  editCommentaire,
  setEditCommentaire,
  onSave,
  saving,
  onUpload,
  uploading,
  onDeleteAttachment,
}: {
  cog: Cogs
  onClose: () => void
  editNumFacture: string
  setEditNumFacture: (v: string) => void
  editCommentaire: string
  setEditCommentaire: (v: string) => void
  onSave: () => void
  saving: boolean
  onUpload: (files: File[]) => Promise<void>
  uploading: boolean
  onDeleteAttachment: (cogId: string, index: number) => void
}) {
  const [viewer, setViewer] = useState<{ url: string; filename: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const doUpload = async (files: File[]) => {
    setUploadError(null)
    try {
      await onUpload(files)
    } catch (err) {
      console.error('Upload error:', err)
      setUploadError('Erreur lors de l\'envoi. Réessayez.')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) doUpload(files)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) doUpload(files)
    e.target.value = ''
  }

  return (
    <>
      <div className="p-6">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="pr-8 mb-5">
          <div className="flex items-center gap-2 mb-1">
            {cog.projetRef && <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{cog.projetRef}</span>}
            {cog.statut && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statutColors[cog.statut] || 'bg-gray-100 text-gray-600'}`}>
                {cog.statut}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-gray-900">{cog.ressourceName || 'Dépense'}</h2>
          {cog.projetName && <p className="text-sm text-gray-500">{cog.projetName}</p>}
          {cog.clientName && <p className="text-xs text-indigo-600">{cog.clientName}</p>}
        </div>

        {/* Details */}
        <div className="space-y-4">
          {/* Montants */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Montant HT engagé</p>
                <p className="text-sm font-semibold text-gray-800">{fmt(cog.montantEngageProd)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Montant TTC</p>
                <p className="text-sm font-semibold text-gray-800">{fmt(cog.montantTTC)}</p>
              </div>
              {cog.montantBudgeteSales != null && (
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Budget sales</p>
                  <p className="text-sm font-semibold text-gray-800">{fmt(cog.montantBudgeteSales)}</p>
                </div>
              )}
              {cog.tva != null && (
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">TVA</p>
                  <p className="text-sm font-semibold text-gray-800">{cog.tva}%</p>
                </div>
              )}
            </div>
          </div>

          {/* Info rows */}
          <div className="space-y-2">
            {cog.categorie && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Catégorie</span>
                <span className="font-medium text-gray-700">{cog.categorie}</span>
              </div>
            )}
            {cog.numeroCommande && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">N° commande</span>
                <span className="font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">{cog.numeroCommande}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">BDC envoyé</span>
              <span>{cog.bdcEnvoye ? <Check className="w-4 h-4 text-green-600" /> : <span className="text-gray-300">Non</span>}</span>
            </div>
            {cog.methodePaiement && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Méthode paiement</span>
                <span className="text-gray-700">{cog.methodePaiement}</span>
              </div>
            )}
            {cog.createdAt && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Créé le</span>
                <span className="text-gray-700">{new Date(cog.createdAt).toLocaleDateString('fr-FR')}</span>
              </div>
            )}
          </div>

          {/* Facture (attachment) */}
          <div>
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Facture</h4>

            {cog.facture && cog.facture.length > 0 && (
              <div className="space-y-1 mb-2">
                {cog.facture.map((f, i) => (
                  <div key={i} className="flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setViewer({ url: f.url, filename: f.filename })}
                      className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 transition group text-left"
                    >
                      <FileText className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 shrink-0" />
                      <span className="text-sm text-gray-700 group-hover:text-indigo-700 truncate">{f.filename}</span>
                      <Upload className="w-3 h-3 text-gray-300 group-hover:text-indigo-400 shrink-0 rotate-180 ml-auto" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAttachment(cog.id, i)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition shrink-0"
                      title="Supprimer ce fichier"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Drag & drop upload zone */}
            {uploadError && (
              <p className="text-xs text-red-500 mb-2 px-1">{uploadError}</p>
            )}
            <div
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true) }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true) }}
              onDragLeave={(e) => {
                // Only clear when leaving the zone itself, not its children
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
              }}
              onDrop={handleDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${
                dragging
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
              } ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-indigo-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs font-medium">Envoi en cours...</span>
                </div>
              ) : (
                <>
                  <CloudUpload className={`w-6 h-6 mx-auto mb-1 ${dragging ? 'text-indigo-500' : 'text-gray-300'}`} />
                  <p className={`text-xs font-medium ${dragging ? 'text-indigo-600' : 'text-gray-400'}`}>
                    {dragging ? 'Déposez ici' : 'Glisser-déposer ou cliquer'}
                  </p>
                  <p className="text-[10px] text-gray-300 mt-0.5">PDF, images — plusieurs fichiers acceptés</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="*/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Editable: N° facture */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">N° de facture</label>
            <input
              type="text"
              value={editNumFacture}
              onChange={(e) => setEditNumFacture(e.target.value)}
              placeholder="Ex: FAC-2024-001"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Editable: Commentaire */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Commentaire</label>
            <textarea
              value={editCommentaire}
              onChange={(e) => setEditCommentaire(e.target.value)}
              rows={3}
              placeholder="Notes..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Save button */}
          {(editNumFacture !== (cog.numeroFacture || '') || editCommentaire !== (cog.commentaire || '')) && (
            <button
              onClick={onSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>

      {/* File viewer modal */}
      {viewer && (
        <FileViewer
          url={viewer.url}
          filename={viewer.filename}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  )
}
