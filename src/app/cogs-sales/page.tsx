'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Wallet,
  Search,
  Loader2,
  Filter,
  X,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Check,
} from 'lucide-react'
import type { Cogs, Projet, Ressource } from '@/types'

type View = 'todo' | 'all'

const fmt = (n?: number | null) =>
  n != null && !isNaN(n)
    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
    : '—'

const fmtPct = (n?: number | null) =>
  n != null && !isNaN(n) && isFinite(n)
    ? `${(n * 100).toFixed(1).replace('.', ',')} %`
    : '—'

const SALES_OPTIONS = [
  'Malik Goulamhoussen',
  'Fabien Dhondt',
  'Laurine Angelini',
  'Rodolphe Le Dortz',
  'Julien Munier',
  'Amandine',
  'Maxime Robé',
  'Marlène',
]

type ProjetRow = Projet & {
  cogsList: Cogs[]
  cogsSumSales: number
  cogsCount: number
  ecart: number
  tauxCogs: number | null
}

export default function CogsSalesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const userName = session?.user?.name || ''
  const userRole = (session?.user as { role?: string })?.role
  const isAdmin = userRole === 'Admin'

  const [view, setView] = useState<View>('todo')
  const [search, setSearch] = useState('')
  const [salesOverride, setSalesOverride] = useState('')
  const effectiveSales = isAdmin && salesOverride ? salesOverride : userName

  const [projets, setProjets] = useState<Projet[]>([])
  const [cogs, setCogs] = useState<Cogs[]>([])
  const [ressources, setRessources] = useState<Ressource[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Redirect non-auth
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchData = useCallback(async () => {
    if (!effectiveSales) return
    setLoading(true)
    try {
      const [projRes, cogsRes, resRes] = await Promise.all([
        fetch(`/api/projets?sales=${encodeURIComponent(effectiveSales)}&all=1`, { cache: 'no-store' }),
        fetch(`/api/cogs?sales=${encodeURIComponent(effectiveSales)}`, { cache: 'no-store' }),
        fetch('/api/ressources', { cache: 'no-store' }),
      ])
      if (projRes.ok) setProjets(await projRes.json())
      if (cogsRes.ok) setCogs(await cogsRes.json())
      if (resRes.ok) setRessources(await resRes.json())
    } finally {
      setLoading(false)
    }
  }, [effectiveSales])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Group COGS by project
  const cogsByProjet = useMemo(() => {
    const map = new Map<string, Cogs[]>()
    for (const c of cogs) {
      if (!c.projetId) continue
      const arr = map.get(c.projetId) || []
      arr.push(c)
      map.set(c.projetId, arr)
    }
    return map
  }, [cogs])

  // Unique categories (from Ressources table)
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const r of ressources) for (const c of r.categorie || []) set.add(c)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [ressources])

  const rows = useMemo<ProjetRow[]>(() => {
    return projets
      .map((p) => {
        const list = cogsByProjet.get(p.id) || []
        const cogsSumSales = list.reduce((s, c) => s + (c.montantBudgeteSales || 0), 0)
        const cogsBudget = p.cogsBudget || 0
        const ecart = cogsSumSales - cogsBudget
        const offreHT = p.offreFinale || p.offreInitiale || 0
        const tauxCogs = offreHT > 0 ? cogsBudget / offreHT : null
        return { ...p, cogsList: list, cogsSumSales, cogsCount: list.length, ecart, tauxCogs }
      })
  }, [projets, cogsByProjet])

  const visibleRows = useMemo(() => {
    let list = rows
    if (view === 'todo') {
      list = list.filter((r) => (r.cogsBudget || 0) > 0 && r.cogsCount === 0)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.nom?.toLowerCase().includes(q) ||
          r.ref?.toLowerCase().includes(q) ||
          r.clientName?.toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => {
      // To-do first, then by name
      if (view !== 'todo') {
        const at = (a.cogsBudget || 0) > 0 && a.cogsCount === 0 ? 0 : 1
        const bt = (b.cogsBudget || 0) > 0 && b.cogsCount === 0 ? 0 : 1
        if (at !== bt) return at - bt
      }
      return (a.nom || '').localeCompare(b.nom || '')
    })
  }, [rows, view, search])

  const counts = useMemo(() => ({
    todo: rows.filter((r) => (r.cogsBudget || 0) > 0 && r.cogsCount === 0).length,
    all: rows.length,
  }), [rows])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onCogsAdded = async () => {
    // Refetch cogs (and projets for potential budget edits)
    await fetchData()
  }

  if (status === 'loading' || (loading && projets.length === 0)) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    )
  }

  if (rows.length === 0 && !isAdmin) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Saisie COGS</h1>
          <p className="text-sm text-gray-500">
            Aucun projet n&apos;est associé à vous en tant que Sales dans Airtable.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      {/* Header */}
      <div className="flex items-start md:items-center justify-between flex-col md:flex-row gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Saisie COGS</h1>
          </div>
          <p className="text-sm text-gray-500">
            {isAdmin && salesOverride
              ? `Projets de ${salesOverride}`
              : 'Saisissez les dépenses prévues sur vos projets signés.'}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={salesOverride}
              onChange={(e) => setSalesOverride(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Moi ({userName})</option>
              {SALES_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {salesOverride && (
              <button
                onClick={() => setSalesOverride('')}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('todo')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
            view === 'todo'
              ? 'bg-amber-500 text-white'
              : counts.todo > 0
                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          À faire <span className="ml-1 opacity-75">{counts.todo}</span>
        </button>
        <button
          onClick={() => setView('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
            view === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Tous mes projets <span className="ml-1 opacity-75">{counts.all}</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher un projet, client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>

      {/* Rows */}
      {visibleRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center text-gray-400">
          {view === 'todo' ? (
            <>
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-300" />
              <p className="text-sm font-medium text-gray-600">Rien à faire — tout est saisi.</p>
            </>
          ) : (
            <>
              <Wallet className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Aucun projet.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRows.map((r) => (
            <ProjetCard
              key={r.id}
              row={r}
              expanded={expanded.has(r.id)}
              onToggle={() => toggleExpand(r.id)}
              categories={categories}
              onChange={onCogsAdded}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── ProjetCard ─── */

function ProjetCard({
  row,
  expanded,
  onToggle,
  categories,
  onChange,
}: {
  row: ProjetRow
  expanded: boolean
  onToggle: () => void
  categories: string[]
  onChange: () => Promise<void> | void
}) {
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetValue, setBudgetValue] = useState(row.cogsBudget != null ? String(row.cogsBudget) : '')
  const [savingBudget, setSavingBudget] = useState(false)

  // Quick-add form state
  const [formCategorie, setFormCategorie] = useState('')
  const [formMontant, setFormMontant] = useState('')
  const [formCommentaire, setFormCommentaire] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const offreHT = row.offreFinale || row.offreInitiale || 0
  const ecartColor =
    row.cogsCount === 0
      ? 'text-gray-400'
      : Math.abs(row.ecart) < 1
        ? 'text-green-600'
        : row.ecart > 0
          ? 'text-red-600'
          : 'text-amber-600'

  const tauxColor =
    row.tauxCogs == null
      ? 'text-gray-400'
      : row.tauxCogs > 0.5
        ? 'text-red-600'
        : row.tauxCogs > 0.35
          ? 'text-amber-600'
          : 'text-green-600'

  const saveBudget = async () => {
    const parsed = budgetValue === '' ? null : parseFloat(budgetValue)
    const next = parsed != null && !isNaN(parsed) ? parsed : null
    const current = row.cogsBudget ?? null
    if (next === current) { setEditingBudget(false); return }
    setSavingBudget(true)
    try {
      const res = await fetch('/api/projets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, cogsBudget: next }),
      })
      if (res.ok) {
        await onChange()
        setEditingBudget(false)
      }
    } finally {
      setSavingBudget(false)
    }
  }

  const submitCogs = async () => {
    if (!formCategorie || !formMontant) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/cogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projetId: row.id,
          categorie: formCategorie,
          montantBudgeteSales: parseFloat(formMontant),
          commentaire: formCommentaire || undefined,
        }),
      })
      if (!res.ok) {
        const txt = await res.text()
        setSubmitError(txt || 'Erreur à la création')
        return
      }
      setFormCategorie('')
      setFormMontant('')
      setFormCommentaire('')
      await onChange()
    } finally {
      setSubmitting(false)
    }
  }

  const deleteCog = async (id: string) => {
    const res = await fetch(`/api/cogs/${id}`, { method: 'DELETE' })
    if (res.ok) await onChange()
  }

  const isTodo = (row.cogsBudget || 0) > 0 && row.cogsCount === 0

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition ${isTodo ? 'border-amber-200' : 'border-gray-100'}`}>
      {/* Summary row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 hover:bg-gray-50/50 flex items-center gap-3 transition"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {row.ref && <span className="text-[11px] font-mono text-gray-500">{row.ref}</span>}
            <span className="text-sm font-semibold text-gray-900 truncate">{row.nom}</span>
            {row.clientName && <span className="text-xs text-indigo-600">· {row.clientName}</span>}
            {row.agence && <span className="text-[10px] uppercase tracking-wider text-gray-400">{row.agence}</span>}
            {isTodo && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" /> À faire
              </span>
            )}
          </div>
        </div>
        {/* Metrics */}
        <div className="hidden sm:flex items-center gap-5 shrink-0 text-[11px]">
          <Metric label="Offre HT" value={fmt(offreHT || null)} />
          <Metric label="Budget COGS" value={fmt(row.cogsBudget)} />
          <Metric label="Saisi" value={fmt(row.cogsSumSales)} />
          <Metric
            label="Écart"
            value={row.cogsCount === 0 ? '—' : (row.ecart > 0 ? '+' : '') + fmt(row.ecart)}
            valueClass={ecartColor}
          />
          <Metric
            label="Taux"
            value={fmtPct(row.tauxCogs)}
            valueClass={tauxColor}
          />
          <span className="text-xs text-gray-400">{row.cogsCount} dépense{row.cogsCount !== 1 ? 's' : ''}</span>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/30 space-y-4">
          {/* Budget + taux row (inline-edit budget) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <MetricBlock label="Offre HT" value={fmt(offreHT || null)} />
            <MetricBlock
              label="Budget COGS"
              value={
                editingBudget ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={budgetValue}
                      onChange={(e) => setBudgetValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveBudget() }}
                      autoFocus
                      placeholder="0"
                      className="w-24 text-sm font-semibold border border-indigo-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={saveBudget}
                      disabled={savingBudget}
                      className="p-1 text-indigo-600 hover:bg-indigo-100 rounded"
                    >
                      {savingBudget ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setBudgetValue(row.cogsBudget != null ? String(row.cogsBudget) : ''); setEditingBudget(false) }}
                      className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-gray-900">{fmt(row.cogsBudget)}</span>
                    <button
                      type="button"
                      onClick={() => setEditingBudget(true)}
                      className="p-0.5 text-gray-300 hover:text-indigo-600 rounded"
                      title="Modifier le budget COGS"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )
              }
            />
            <MetricBlock label="Somme HT Sales" value={fmt(row.cogsSumSales)} />
            <MetricBlock
              label="Écart"
              value={
                <span className={ecartColor}>
                  {row.cogsCount === 0 ? '—' : (row.ecart > 0 ? '+' : '') + fmt(row.ecart)}
                </span>
              }
            />
            <MetricBlock
              label="Taux COGS"
              value={<span className={tauxColor}>{fmtPct(row.tauxCogs)}</span>}
              hint={offreHT > 0 ? `Budget / Offre HT` : 'Offre HT manquante'}
            />
          </div>

          {/* Quick-add form */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nouvelle dépense
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_2fr_auto] gap-2">
              <select
                value={formCategorie}
                onChange={(e) => setFormCategorie(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Catégorie…</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="HT sales"
                  value={formMontant}
                  onChange={(e) => setFormMontant(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
              </div>
              <input
                type="text"
                placeholder="Commentaire (optionnel)"
                value={formCommentaire}
                onChange={(e) => setFormCommentaire(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && formCategorie && formMontant) submitCogs() }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={submitCogs}
                disabled={!formCategorie || !formMontant || submitting}
                className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Ajouter
              </button>
            </div>
            {submitError && <p className="text-xs text-red-500 mt-2">{submitError}</p>}
            <p className="text-[11px] text-gray-400 mt-2">
              Statut auto : &gt; 200 € → <span className="font-medium text-pink-600">A Approuver</span>, sinon <span className="font-medium text-blue-600">Estimée</span>.
            </p>
          </div>

          {/* Existing COGS list */}
          {row.cogsList.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="px-3 py-2 text-left font-medium">Catégorie</th>
                    <th className="px-3 py-2 text-left font-medium">Ressource</th>
                    <th className="px-3 py-2 text-right font-medium">HT Sales</th>
                    <th className="px-3 py-2 text-left font-medium">Statut</th>
                    <th className="px-3 py-2 text-left font-medium">Commentaire</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {row.cogsList.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-gray-700">
                        {c.categorie ? (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.categorie}</span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{c.ressourceName || '—'}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums">
                        {fmt(c.montantBudgeteSales)}
                      </td>
                      <td className="px-3 py-2">
                        {c.statut && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            c.statut === 'Estimée' ? 'bg-blue-100 text-blue-800'
                              : c.statut?.startsWith('A Approuver') ? 'bg-pink-100 text-pink-800'
                              : c.statut === 'Engagée' ? 'bg-yellow-100 text-yellow-800'
                              : c.statut === 'A payer' ? 'bg-orange-100 text-orange-800'
                              : c.statut === 'Payée' ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {c.statut}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs truncate max-w-[240px]" title={c.commentaire}>
                        {c.commentaire || '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => deleteCog(c.id)}
                          className="p-1 text-gray-300 hover:text-red-500 rounded"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Metric helpers ─── */

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 leading-none mb-0.5">{label}</div>
      <div className={`font-semibold tabular-nums ${valueClass || 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function MetricBlock({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
      <div className="text-sm">{value}</div>
      {hint && <div className="text-[10px] text-gray-300 mt-0.5">{hint}</div>}
    </div>
  )
}
