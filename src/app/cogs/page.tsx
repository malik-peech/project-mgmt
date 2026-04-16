'use client'

import { useState, useMemo, useEffect, useRef, Suspense, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useData } from '@/hooks/useData'
import {
  Plus, X, Search, Check, FileText, Copy, Trash2, RefreshCw, AlertTriangle, Loader2, Upload, CloudUpload,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ChevronDown, Rows3, Rows2,
} from 'lucide-react'
import ContextMenu from '@/components/ContextMenu'
import ComboSelect from '@/components/ComboSelect'
import FileViewer from '@/components/FileViewer'
import ResizeHandle from '@/components/ResizeHandle'
import { useColumnWidths } from '@/hooks/useColumnWidths'
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

const statutTabs: string[] = ['Tous', 'A Approuver (CDP)', 'Engagée', 'À compléter', 'A payer', 'Payée']
const statutOptions: string[] = [
  'A Approuver (CDP)', 'A Approuver (CSM)', 'A Approuver', 'Estimée', 'Engagée',
  'A payer', 'Autorisée via flash', 'Payée', 'Annulée', 'Refusée', 'Stand-by',
]

const fmt = (n?: number) =>
  n != null
    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
    : '—'

export default function CogsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-6 md:p-8"><div className="animate-pulse space-y-4"><div className="h-8 bg-gray-200 rounded w-48" /><div className="h-96 bg-gray-100 rounded-xl" /></div></div>}>
      <CogsPage />
    </Suspense>
  )
}

function CogsPage() {
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
  const [expandedProjetId, setExpandedProjetId] = useState<string | null>(null)
  const [condensed, setCondensed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('cogs_condensed') === '1'
  })
  const [rowUploadingId, setRowUploadingId] = useState<string | null>(null)
  const [rowDragOverId, setRowDragOverId] = useState<string | null>(null)

  useEffect(() => {
    try { localStorage.setItem('cogs_condensed', condensed ? '1' : '0') } catch {}
  }, [condensed])

  // Column widths (persisted in localStorage). Covers the main COGS table.
  const cogsColDefaults = useMemo(
    () => ({
      projetRef: 260,
      ressourceName: 180,
      categorie: 160,
      montantBudgeteSales: 110,
      montantEngageProd: 110,
      facture: 180,
      statut: 140,
    }),
    []
  )
  const { widths: colW, startResize: startColResize } = useColumnWidths('cogs.table.widths', cogsColDefaults)
  const searchParams = useSearchParams()

  // Modal state
  const [formProjetId, setFormProjetId] = useState('')
  const [formCategorie, setFormCategorie] = useState('')
  const [formRessourceId, setFormRessourceId] = useState('')
  const [formMontant, setFormMontant] = useState('')
  const [formCommentaire, setFormCommentaire] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cog: Cogs } | null>(null)

  // Side panel edit state
  const [editNumFacture, setEditNumFacture] = useState('')
  const [editCommentaire, setEditCommentaire] = useState('')
  const [editMontantHT, setEditMontantHT] = useState('')
  const [editTva, setEditTva] = useState('')
  const [editQualiteNote, setEditQualiteNote] = useState<number | null>(null)
  const [editQualiteComment, setEditQualiteComment] = useState('')
  const [editRessourceId, setEditRessourceId] = useState('')
  const [editMethodePaiement, setEditMethodePaiement] = useState('')
  const [savingCog, setSavingCog] = useState(false)

  const userName = session?.user?.name || ''
  const userRole = (session?.user as { role?: string })?.role || 'PM'
  const pmParam = userRole === 'PM' && userName
    ? `pm=${encodeURIComponent(userName)}`
    : userRole === 'DA' && userName
    ? `da=${encodeURIComponent(userName)}`
    : ''
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
    ready ? '/api/ressources' : null,
    { key: 'ressources-all', enabled: ready, staleTime: 60_000 }
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

  // Handle URL params (projetId and cogId from project side panel)
  const [urlParamsApplied, setUrlParamsApplied] = useState(false)
  useEffect(() => {
    if (urlParamsApplied || !cogs) return
    const urlProjetId = searchParams.get('projetId')
    const urlCogId = searchParams.get('cogId')
    if (urlProjetId) setProjetFilter(urlProjetId)
    if (urlCogId) {
      const cog = cogs.find((c) => c.id === urlCogId)
      if (cog) {
        openCogPanel(cog)
        setUrlParamsApplied(true)
      }
    } else if (urlProjetId) {
      setUrlParamsApplied(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cogs, searchParams])

  // Activate "À autoriser" view when arriving via ?view=a-autoriser (admin sub-nav link)
  useEffect(() => {
    if (searchParams.get('view') === 'a-autoriser' && userRole === 'Admin') {
      setActiveTab('À autoriser')
    }
  }, [searchParams, userRole])

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

  // Inline-update a single field (used by À autoriser table)
  const updateCogField = async (cogId: string, body: Record<string, unknown>) => {
    // Optimistic update
    mutateCogs((prev) =>
      (prev ?? []).map((c) => (c.id === cogId ? { ...c, ...body } as Cogs : c))
    )
    try {
      await fetch(`/api/cogs/${cogId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      revalidateCogs()
    } catch {
      revalidateCogs()
    }
  }

  const saveCogEdits = async () => {
    if (!selectedCog) return
    setSavingCog(true)
    try {
      const body: Record<string, unknown> = {}
      if (editNumFacture !== (selectedCog.numeroFacture || '')) body.numeroFacture = editNumFacture
      if (editCommentaire !== (selectedCog.commentaire || '')) body.commentaire = editCommentaire
      const montantHTNum = editMontantHT !== '' ? parseFloat(editMontantHT) : null
      if (montantHTNum !== (selectedCog.montantEngageProd ?? null)) body.montantEngageProd = montantHTNum
      const tvaNum = editTva !== '' ? parseFloat(editTva) : null
      if (tvaNum !== (selectedCog.tva ?? null)) body.tva = tvaNum
      if (editQualiteNote !== (selectedCog.qualiteNote ?? null)) body.qualiteNote = editQualiteNote
      if (editQualiteComment !== (selectedCog.qualiteComment || '')) body.qualiteComment = editQualiteComment
      if (editRessourceId !== (selectedCog.ressourceId || '')) body.ressourceId = editRessourceId || null
      if (editMethodePaiement !== (selectedCog.methodePaiement || '')) body.methodePaiement = editMethodePaiement || null
      if (Object.keys(body).length > 0) {
        const res = await fetch(`/api/cogs/${selectedCog.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.text()
          console.error('[saveCogEdits] failed:', res.status, err)
          alert(`Échec de la sauvegarde:\n${err}`)
          return
        }

        // Verify the Airtable response actually contains the new ressource we asked for
        try {
          const payload = await res.json() as { id: string; fields?: Record<string, unknown> }
          if (body.ressourceId !== undefined && payload.fields) {
            const actualLinks = payload.fields['Ressource'] as string[] | undefined
            const expected = body.ressourceId || null
            const got = actualLinks?.[0] || null
            if (expected !== got) {
              alert(
                `⚠ Airtable n'a pas persisté la ressource.\n` +
                `Envoyé: ${expected}\nAirtable a retourné: ${got}\n\n` +
                `Cela vient probablement d'une automatisation Airtable ou d'une restriction sur le champ Ressource (lecture seule ?).`
              )
            }
          }
        } catch {}

        await revalidateCogs()
      }
    } catch (e) {
      console.error('[saveCogEdits] error:', e)
    } finally {
      setSavingCog(false)
    }
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
      // Server already refreshed the COGS table before returning; just revalidate client cache.
      const cogId = selectedCog.id
      await revalidateCogs()
      mutateCogs((prev) => {
        const fresh = prev?.find((c) => c.id === cogId)
        if (fresh) setSelectedCog({ ...fresh })
        return prev
      })
    } finally {
      setUploadingCog(false)
    }
  }

  /** Upload a file directly to a COGS row from the table (drag & drop). */
  const uploadToRow = async (cogId: string, files: File[]) => {
    if (files.length === 0) return
    setRowUploadingId(cogId)
    try {
      const fd = new FormData()
      for (const f of files) fd.append('files', f, f.name)
      const res = await fetch(`/api/cogs/${cogId}/upload`, { method: 'POST', body: fd })
      if (!res.ok) {
        console.error('Row upload failed:', await res.text())
        return
      }
      await revalidateCogs()
    } finally {
      setRowUploadingId(null)
      setRowDragOverId(null)
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
    if (activeTab === 'À compléter') {
      // "A payer" COGS that are missing required fields
      list = list.filter((c) => {
        if (c.statut !== 'A payer') return false
        const missing = !c.montantEngageProd || !c.ressourceName || c.tva == null || c.qualiteNote == null || !c.qualiteComment || !c.facture || c.facture.length === 0
        return missing
      })
    } else if (activeTab === 'À autoriser') {
      // COGS with numéro de commande = 0 and statut not finalized
      list = list.filter((c) => {
        if (c.statut === 'Payée' || c.statut === 'Annulée') return false
        const num = (c.numeroCommande || '').trim()
        return num === '0' || num === ''
      })
    } else if (activeTab !== 'Tous') {
      list = list.filter((c) => c.statut === activeTab)
    }
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
        c.categorie?.toLowerCase().includes(q) ||
        c.pm?.toLowerCase().includes(q)
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

  // All unique categories from resources (for the modal category picker)
  const allRessourceCategories = useMemo(() => {
    const set = new Set<string>()
    for (const r of ressourceList) {
      if (r.categorie) r.categorie.forEach((c) => set.add(c))
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [ressourceList])

  // Resources filtered by selected category in the modal
  const filteredRessources = useMemo(() => {
    if (!formCategorie) return ressourceList
    return ressourceList.filter(
      (r) => r.categorie?.some((c) => c === formCategorie)
    )
  }, [ressourceList, formCategorie])

  // ComboSelect options for resources in the modal
  const ressourceComboOptions = useMemo(() =>
    filteredRessources.map((r) => ({
      value: r.id,
      label: r.name,
      sub: r.categorie?.join(', ') || undefined,
    })),
    [filteredRessources]
  )

  const handleSubmit = async () => {
    if (!formProjetId || !formCategorie || !formMontant) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/cogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projetId: formProjetId,
          ressourceId: formRessourceId || undefined,
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
    setFormCategorie('')
    setFormRessourceId('')
    setFormMontant('')
    setFormCommentaire('')
  }

  const openCogPanel = (cog: Cogs) => {
    setSelectedCog(cog)
    setEditNumFacture(cog.numeroFacture || '')
    setEditCommentaire(cog.commentaire || '')
    setEditMontantHT(cog.montantEngageProd != null ? String(cog.montantEngageProd) : '')
    setEditTva(cog.tva != null ? String(cog.tva) : '')
    setEditQualiteNote(cog.qualiteNote ?? null)
    setEditQualiteComment(cog.qualiteComment || '')
    setEditRessourceId(cog.ressourceId || '')
    setEditMethodePaiement(cog.methodePaiement || '')
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
                onClick={() => setCondensed((v) => !v)}
                className={`p-2 rounded-lg transition border ${
                  condensed
                    ? 'text-indigo-600 bg-indigo-50 border-indigo-200'
                    : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 border-transparent'
                }`}
                title={condensed ? 'Vue aérée' : 'Vue condensée'}
              >
                {condensed ? <Rows3 className="w-4 h-4" /> : <Rows2 className="w-4 h-4" />}
              </button>
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
                      activeTab === tab
                        ? tab === 'À compléter' ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white'
                        : tab === 'À compléter' && cogsList.filter((c) => c.statut === 'A payer' && (!c.numeroFacture || c.qualiteNote == null || !c.qualiteComment || !c.methodePaiement || c.tva == null || !c.facture || c.facture.length === 0)).length > 0
                          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tab}
                    {tab !== 'Tous' && (
                      <span className="ml-1 opacity-75">
                        {tab === 'À compléter'
                          ? cogsList.filter((c) => c.statut === 'A payer' && (!c.numeroFacture || c.qualiteNote == null || !c.qualiteComment || !c.methodePaiement || c.tva == null || !c.facture || c.facture.length === 0)).length
                          : cogsList.filter((c) => c.statut === tab).length
                        }
                      </span>
                    )}
                  </button>
                ))}
                {/* Admin-only: À autoriser */}
                {userRole === 'Admin' && (
                  <button
                    onClick={() => setActiveTab('À autoriser')}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${
                      activeTab === 'À autoriser'
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                    }`}
                  >
                    À autoriser
                    <span className="ml-1 opacity-75">
                      {cogsList.filter((c) => {
                        if (c.statut === 'Payée' || c.statut === 'Annulée') return false
                        const n = (c.numeroCommande || '').trim()
                        return n === '0' || n === ''
                      }).length}
                    </span>
                  </button>
                )}
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
          ) : activeTab === 'À autoriser' ? (
            <AutoriserTable
              rows={filtered}
              expandedProjetId={expandedProjetId}
              setExpandedProjetId={setExpandedProjetId}
              onUpdateField={updateCogField}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className={`w-full ${condensed ? 'text-[13px]' : 'text-sm'}`} style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: colW.projetRef }} />
                    <col style={{ width: colW.ressourceName }} />
                    <col style={{ width: colW.categorie }} />
                    <col style={{ width: colW.montantBudgeteSales }} />
                    <col style={{ width: colW.montantEngageProd }} />
                    <col style={{ width: colW.facture }} />
                    <col style={{ width: colW.statut }} />
                  </colgroup>
                  <thead>
                    <tr className={`border-b border-gray-100 bg-gray-50/50 ${condensed ? '' : ''}`}>
                      {([
                        { key: 'projetRef', label: 'Code / Projet', align: 'left', noSort: false },
                        { key: 'ressourceName', label: 'Ressource', align: 'left', noSort: false },
                        { key: 'categorie', label: 'Catégorie', align: 'left', noSort: false },
                        { key: 'montantBudgeteSales', label: 'HT sales', align: 'right', noSort: false },
                        { key: 'montantEngageProd', label: 'HT engagé', align: 'right', noSort: false },
                        { key: 'facture', label: 'Facture', align: 'left', noSort: true },
                        { key: 'statut', label: 'Statut', align: 'center', noSort: false },
                      ] as const).map(({ key, label, align, noSort }) => (
                        <th
                          key={key}
                          className={`relative ${condensed ? 'px-3 py-1.5' : 'px-4 py-3'} font-medium text-gray-500 text-xs uppercase tracking-wider select-none transition ${
                            noSort ? '' : 'cursor-pointer hover:text-gray-700'
                          } ${
                            align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                          }`}
                          onClick={() => !noSort && toggleSort(key as typeof sortField)}
                        >
                          <span className="inline-flex items-center gap-1 truncate">
                            {label}
                            {!noSort && (sortField === key ? (
                              sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-30" />
                            ))}
                          </span>
                          <ResizeHandle onMouseDown={(e) => startColResize(key as keyof typeof colW, e)} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((c) => {
                      const facture = c.facture?.[0]
                      const rowPad = condensed ? 'px-3 py-1.5' : 'px-4 py-3'
                      const isDragOver = rowDragOverId === c.id
                      const isUploadingRow = rowUploadingId === c.id
                      return (
                      <tr
                        key={c.id}
                        className={`group transition cursor-pointer ${selectedCog?.id === c.id ? 'bg-indigo-50' : 'hover:bg-gray-50/50'} ${isDragOver ? '!bg-indigo-100 ring-2 ring-indigo-300' : ''}`}
                        onClick={() => openCogPanel(c)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setContextMenu({ x: e.clientX, y: e.clientY, cog: c })
                        }}
                        onDragEnter={(e) => {
                          if (!e.dataTransfer.types.includes('Files')) return
                          e.preventDefault()
                          setRowDragOverId(c.id)
                        }}
                        onDragOver={(e) => {
                          if (!e.dataTransfer.types.includes('Files')) return
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'copy'
                        }}
                        onDragLeave={(e) => {
                          // only reset when we actually leave the row, not its children
                          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                            setRowDragOverId((curr) => (curr === c.id ? null : curr))
                          }
                        }}
                        onDrop={(e) => {
                          if (!e.dataTransfer.types.includes('Files')) return
                          e.preventDefault()
                          e.stopPropagation()
                          const files = Array.from(e.dataTransfer.files)
                          if (files.length > 0) uploadToRow(c.id, files)
                        }}
                      >
                        <td className={`${rowPad} overflow-hidden`}>
                          {condensed ? (
                            <div className="flex items-center gap-2 min-w-0">
                              {c.projetRef && <span className="text-[11px] font-mono text-gray-500 shrink-0">{c.projetRef}</span>}
                              {c.numeroCommande && (
                                <span className="text-[10px] font-mono font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0">
                                  {c.numeroCommande}
                                </span>
                              )}
                              <span className="truncate text-gray-900">{c.projetName || '—'}</span>
                              {c.clientName && <span className="text-xs text-indigo-600 shrink-0">· {c.clientName}</span>}
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                {c.projetRef && <span className="text-xs font-mono text-gray-500">{c.projetRef}</span>}
                                {c.numeroCommande && (
                                  <span className="text-xs font-mono font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                    {c.numeroCommande}
                                  </span>
                                )}
                                {!c.projetRef && !c.numeroCommande && <span className="text-xs text-gray-400">—</span>}
                              </div>
                              <div className="text-sm text-gray-900 truncate">{c.projetName || '—'}</div>
                              {c.clientName && <div className="text-xs text-indigo-600 truncate">{c.clientName}</div>}
                            </>
                          )}
                        </td>
                        <td className={`${rowPad} text-gray-700 overflow-hidden`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setRessourceFilter(ressourceFilter === c.ressourceName ? '' : (c.ressourceName || ''))
                            }}
                            className={`w-full text-left truncate hover:text-indigo-600 transition ${ressourceFilter === c.ressourceName ? 'text-indigo-600 font-medium' : ''}`}
                            title={c.ressourceName || ''}
                          >
                            {c.ressourceName || '—'}
                          </button>
                        </td>
                        <td className={`${rowPad} overflow-hidden`}>
                          {c.categorie ? (
                            <span className="inline-block max-w-full truncate align-middle text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full" title={c.categorie}>{c.categorie}</span>
                          ) : '—'}
                        </td>
                        <td className={`${rowPad} text-right font-medium text-gray-500 tabular-nums`}>{fmt(c.montantBudgeteSales)}</td>
                        <td className={`${rowPad} text-right font-medium text-gray-900 tabular-nums`}>{fmt(c.montantEngageProd)}</td>
                        <td className={`${rowPad} overflow-hidden`}>
                          <div className="flex items-center gap-1 min-w-0">
                            {isUploadingRow ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600">
                                <Loader2 className="w-3 h-3 animate-spin" /> Envoi…
                              </span>
                            ) : facture ? (
                              <a
                                href={facture.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline min-w-0 max-w-full"
                                title={facture.filename}
                              >
                                <FileText className="w-3 h-3 shrink-0" />
                                <span className="truncate">{facture.filename}</span>
                                {(c.facture!.length > 1) && (
                                  <span className="text-gray-400 shrink-0">+{c.facture!.length - 1}</span>
                                )}
                              </a>
                            ) : (
                              <span className={`inline-flex items-center gap-1 text-[11px] ${isDragOver ? 'text-indigo-600' : 'text-gray-300'}`}>
                                <CloudUpload className="w-3 h-3" />
                                {isDragOver ? 'Déposer' : 'Glisser ici'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`${rowPad} text-center overflow-hidden`}>
                          {c.statut ? (
                            <span className={`inline-block max-w-full truncate align-middle text-[11px] font-medium px-2.5 py-0.5 rounded-full ${statutColors[c.statut] || 'bg-gray-100 text-gray-600'}`} title={c.statut}>
                              {c.statut}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    )})}
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
            editMontantHT={editMontantHT}
            setEditMontantHT={setEditMontantHT}
            editTva={editTva}
            setEditTva={setEditTva}
            editQualiteNote={editQualiteNote}
            setEditQualiteNote={setEditQualiteNote}
            editQualiteComment={editQualiteComment}
            setEditQualiteComment={setEditQualiteComment}
            editRessourceId={editRessourceId}
            setEditRessourceId={setEditRessourceId}
            editMethodePaiement={editMethodePaiement}
            setEditMethodePaiement={setEditMethodePaiement}
            ressourceList={ressourceList}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie <span className="text-red-500">*</span></label>
                <select value={formCategorie} onChange={(e) => { setFormCategorie(e.target.value); setFormRessourceId('') }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Sélectionner une catégorie</option>
                  {allRessourceCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ressource</label>
                <ComboSelect
                  options={ressourceComboOptions}
                  value={formRessourceId}
                  onChange={setFormRessourceId}
                  placeholder={formCategorie ? `Rechercher dans ${formCategorie}...` : 'Sélectionner d\'abord une catégorie'}
                  clearable
                />
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
              <button onClick={handleSubmit} disabled={!formProjetId || !formCategorie || !formMontant || submitting}
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

/* ─── À autoriser Table (admin) ─── */

type AutoriserGroup = {
  key: string
  projetId?: string
  projetRef?: string
  projetName?: string
  clientName?: string
  pm?: string
  montantBudgeteSales?: number
  totalEngage: number
  cogs: Cogs[]
}

function AutoriserTable({
  rows,
  expandedProjetId,
  setExpandedProjetId,
  onUpdateField,
}: {
  rows: Cogs[]
  expandedProjetId: string | null
  setExpandedProjetId: (id: string | null) => void
  onUpdateField: (cogId: string, body: Record<string, unknown>) => Promise<void>
}) {
  const [viewer, setViewer] = useState<{ url: string; filename: string } | null>(null)

  // Group by project so each project shows a single row, with cogs as children.
  const groups = useMemo<AutoriserGroup[]>(() => {
    const map = new Map<string, AutoriserGroup>()
    for (const c of rows) {
      const key = c.projetId || `orphan-${c.id}`
      let g = map.get(key)
      if (!g) {
        g = {
          key,
          projetId: c.projetId,
          projetRef: c.projetRef,
          projetName: c.projetName,
          clientName: c.clientName,
          pm: c.pm,
          montantBudgeteSales: c.montantBudgeteSales,
          totalEngage: 0,
          cogs: [],
        }
        map.set(key, g)
      }
      g.cogs.push(c)
      g.totalEngage += c.montantEngageProd || 0
    }
    return Array.from(map.values())
  }, [rows])

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="w-7 px-2 py-2" />
              <th className="px-2 py-2 text-left font-medium">Projet</th>
              <th className="px-2 py-2 text-left font-medium">Client</th>
              <th className="px-2 py-2 text-left font-medium">PM</th>
              <th className="px-2 py-2 text-right font-medium">HT sales</th>
              <th className="px-2 py-2 text-right font-medium">HT engagé</th>
              <th className="px-2 py-2 text-left font-medium">Autor. Vanessa</th>
              <th className="px-2 py-2 text-left font-medium">Ressource</th>
              <th className="px-2 py-2 text-left font-medium">Facture</th>
              <th className="px-2 py-2 text-left font-medium">Statut</th>
              <th className="px-2 py-2 text-left font-medium">Paiement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {groups.map((g) => {
              const isExpanded = expandedProjetId === g.key
              return (
                <Fragment key={g.key}>
                  {/* Parent row: one per project */}
                  <tr
                    className="group hover:bg-gray-50/50 transition cursor-pointer"
                    onClick={() => setExpandedProjetId(isExpanded ? null : g.key)}
                  >
                    <td className="w-7 px-2 py-1.5 text-gray-400 align-middle">
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        {g.projetRef && <span className="text-[11px] font-mono text-gray-500">{g.projetRef}</span>}
                        <span className="text-xs font-medium text-gray-900 truncate max-w-[200px]">{g.projetName || '—'}</span>
                        <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-100">
                          {g.cogs.length}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-gray-700 text-xs truncate max-w-[120px]">{g.clientName || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-700 text-xs truncate max-w-[100px]">{g.pm || '—'}</td>
                    <td className="px-2 py-1.5 text-right text-xs text-gray-500 tabular-nums">{fmt(g.montantBudgeteSales)}</td>
                    <td className="px-2 py-1.5 text-right text-xs font-medium text-gray-900 tabular-nums">{fmt(g.totalEngage)}</td>
                    <td className="px-2 py-1.5" />
                    <td className="px-2 py-1.5" />
                    <td className="px-2 py-1.5" />
                    <td className="px-2 py-1.5" />
                    <td className="px-2 py-1.5" />
                  </tr>

                  {/* Child rows: one per cog of the project */}
                  {isExpanded && g.cogs.map((c) => (
                    <tr key={c.id} className="bg-indigo-50/20 hover:bg-indigo-50/40 transition">
                      <td className="w-7 px-2 py-1.5 align-middle">
                        <span className="inline-block w-3.5 h-3.5 border-l-2 border-b-2 border-indigo-200 ml-1 rounded-bl" />
                      </td>
                      <td className="px-2 py-1.5" colSpan={3} />
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5 text-right text-xs text-gray-700 tabular-nums">{fmt(c.montantEngageProd)}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={c.autorisationVanessa ?? ''}
                          onBlur={(e) => {
                            const raw = e.target.value.trim()
                            const parsed = raw === '' ? null : Number(raw)
                            const next = parsed === null || isNaN(parsed) ? null : parsed
                            const current = c.autorisationVanessa ?? null
                            if (next !== current) onUpdateField(c.id, { autorisationVanessa: next })
                          }}
                          placeholder="…"
                          className="w-20 text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-gray-700 text-xs truncate max-w-[120px]">{c.ressourceName || '—'}</td>
                      <td className="px-2 py-1.5">
                        {c.facture && c.facture.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setViewer({ url: c.facture![0].url, filename: c.facture![0].filename })}
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                            title={c.facture[0].filename}
                          >
                            <FileText className="w-3 h-3" />
                            <span className="truncate max-w-[80px]">{c.facture[0].filename}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={c.statut || ''}
                          onChange={(e) => onUpdateField(c.id, { statut: e.target.value })}
                          className={`text-[10px] rounded-full px-1.5 py-0.5 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${statutColors[c.statut || ''] || 'bg-gray-50 text-gray-600'}`}
                        >
                          <option value="">—</option>
                          {statutOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-gray-700 text-[11px] truncate max-w-[90px]">{c.methodePaiement || '—'}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {viewer && (
        <FileViewer url={viewer.url} filename={viewer.filename} onClose={() => setViewer(null)} />
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
  editMontantHT,
  setEditMontantHT,
  editTva,
  setEditTva,
  editQualiteNote,
  setEditQualiteNote,
  editQualiteComment,
  setEditQualiteComment,
  editRessourceId,
  setEditRessourceId,
  editMethodePaiement,
  setEditMethodePaiement,
  ressourceList,
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
  editMontantHT: string
  setEditMontantHT: (v: string) => void
  editTva: string
  setEditTva: (v: string) => void
  editQualiteNote: number | null
  setEditQualiteNote: (v: number | null) => void
  editQualiteComment: string
  setEditQualiteComment: (v: string) => void
  editRessourceId: string
  setEditRessourceId: (v: string) => void
  editMethodePaiement: string
  setEditMethodePaiement: (v: string) => void
  ressourceList: Ressource[]
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

  const panelRessourceOptions = useMemo(() =>
    ressourceList.map((r) => ({
      value: r.id,
      label: r.name,
      sub: r.categorie?.join(', ') || undefined,
    })),
    [ressourceList]
  )

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
          {/* Ressource */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Ressource</label>
            <ComboSelect
              options={panelRessourceOptions}
              value={editRessourceId}
              onChange={setEditRessourceId}
              placeholder="Sélectionner une ressource..."
              clearable
            />
          </div>

          {/* Montants — HT → TVA → TTC, all in € */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Montant HT engagé</label>
              <div className="relative">
                <input
                  type="number"
                  value={editMontantHT}
                  onChange={(e) => setEditMontantHT(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 pr-7 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">TVA</label>
              <div className="relative">
                <input
                  type="number"
                  value={editTva}
                  onChange={(e) => setEditTva(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 pr-7 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
              </div>
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
            {cog.createdAt && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Créé le</span>
                <span className="text-gray-700">{new Date(cog.createdAt).toLocaleDateString('fr-FR')}</span>
              </div>
            )}
          </div>

          {/* Méthode de paiement (editable) */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Méthode de paiement</label>
            <ComboSelect
              options={[
                'Virement', 'Paypal', 'CB', 'Malt', 'Déjà payé', 'Process spécifique', 'Upwork',
              ].map((v) => ({ value: v, label: v }))}
              value={editMethodePaiement}
              onChange={setEditMethodePaiement}
              placeholder="Sélectionner une méthode…"
              clearable
            />
          </div>

          {/* Qualité (note) — étoiles */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Qualité (note)</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setEditQualiteNote(editQualiteNote === star ? null : star)}
                  className={`text-2xl transition ${editQualiteNote != null && star <= editQualiteNote ? 'text-amber-400' : 'text-gray-200 hover:text-amber-300'}`}
                >
                  ★
                </button>
              ))}
              {editQualiteNote != null && (
                <span className="ml-2 text-sm text-gray-500 self-center">{editQualiteNote}/5</span>
              )}
            </div>
          </div>

          {/* Qualité (commentaire) */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Qualité (commentaire)</label>
            <textarea
              value={editQualiteComment}
              onChange={(e) => setEditQualiteComment(e.target.value)}
              rows={2}
              placeholder="Appréciation sur la prestation..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
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
          {(
            editNumFacture !== (cog.numeroFacture || '') ||
            editCommentaire !== (cog.commentaire || '') ||
            editMontantHT !== (cog.montantEngageProd != null ? String(cog.montantEngageProd) : '') ||
            editTva !== (cog.tva != null ? String(cog.tva) : '') ||
            editQualiteNote !== (cog.qualiteNote ?? null) ||
            editQualiteComment !== (cog.qualiteComment || '') ||
            editRessourceId !== (cog.ressourceId || '') ||
            editMethodePaiement !== (cog.methodePaiement || '')
          ) && (
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
