'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  Wallet,
  X,
} from 'lucide-react'
import type { Cogs } from '@/types'

interface ProjetRow {
  id: string
  ref?: string
  nom: string
  clientName?: string
  pm?: string
  pm2?: string
  agence?: string
  statut?: string
  cogsBudget?: number
  offreInitiale?: number
  offreFinale?: number
  cogsList: Cogs[]
}

interface ApiResponse {
  rows: ProjetRow[]
  counts: { projets: number; cogs: number; total: number }
}

const fmt = (n?: number | null) =>
  n != null && !isNaN(n)
    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
    : '—'

const fmtPct = (n?: number | null) =>
  n != null && !isNaN(n) && isFinite(n)
    ? `${(n * 100).toFixed(1).replace('.', ',')} %`
    : '—'

const STATUT_BADGE: Record<string, string> = {
  'A Approuver': 'bg-pink-100 text-pink-800',
  'A Approuver (CDP)': 'bg-pink-100 text-pink-800',
  'A Approuver (CSM)': 'bg-teal-100 text-teal-800',
}

export default function AdminCogsToApprove() {
  const [rows, setRows] = useState<ProjetRow[]>([])
  const [counts, setCounts] = useState({ projets: 0, cogs: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [actingId, setActingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/cogs-to-approve', { cache: 'no-store' })
      if (res.ok) {
        const json = (await res.json()) as ApiResponse
        setRows(json.rows || [])
        setCounts(json.counts || { projets: 0, cogs: 0, total: 0 })
        if ((json.rows || []).length > 0 && (json.rows || []).length <= 8) {
          setExpanded(new Set(json.rows.map((r) => r.id)))
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visibleRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(
      (r) =>
        r.nom?.toLowerCase().includes(q) ||
        r.ref?.toLowerCase().includes(q) ||
        r.clientName?.toLowerCase().includes(q) ||
        r.cogsList.some(
          (c) =>
            c.ressourceName?.toLowerCase().includes(q) ||
            c.categorie?.toLowerCase().includes(q),
        ),
    )
  }, [rows, search])

  const patchStatut = async (cogId: string, projetId: string, statut: string) => {
    setActingId(cogId)
    try {
      const res = await fetch(`/api/cogs/${cogId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      })
      if (!res.ok) {
        alert('Erreur')
        return
      }
      // Optimistically remove the COG from the row.
      setRows((prev) => {
        const next: ProjetRow[] = []
        for (const r of prev) {
          if (r.id !== projetId) {
            next.push(r)
            continue
          }
          const remaining = r.cogsList.filter((c) => c.id !== cogId)
          if (remaining.length > 0) next.push({ ...r, cogsList: remaining })
        }
        return next
      })
      setCounts((c) => ({ ...c, cogs: Math.max(0, c.cogs - 1) }))
    } finally {
      setActingId(null)
    }
  }

  return (
    <div>
      {/* Header — same shape as Saisie COGS */}
      <div className="flex items-start md:items-center justify-between flex-col md:flex-row gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-pink-100 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-pink-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">COGS à autoriser</h2>
          </div>
          <p className="text-sm text-gray-500">
            {counts.cogs === 0
              ? 'Aucune dépense à autoriser pour le moment.'
              : `${counts.cogs} dépense${counts.cogs > 1 ? 's' : ''} en attente sur ${counts.projets} projet${
                  counts.projets > 1 ? 's' : ''
                } · ${fmt(counts.total)} cumulé`}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher un projet, client, ressource, catégorie…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>

      {/* Rows */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center text-gray-400">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-300" />
          <p className="text-sm font-medium text-gray-600">
            {rows.length === 0 ? 'Tous les COGS sont validés 🎉' : 'Aucun résultat.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRows.map((r) => (
            <ProjetCard
              key={r.id}
              row={r}
              expanded={expanded.has(r.id)}
              onToggle={() => toggleExpand(r.id)}
              onApprove={(cogId) => patchStatut(cogId, r.id, 'Engagée')}
              onReject={(cogId) => {
                if (confirm('Refuser cette dépense ?')) patchStatut(cogId, r.id, 'Refusée')
              }}
              actingId={actingId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── ProjetCard (mirrors cogs-sales/page.tsx ProjetCard) ─── */

function ProjetCard({
  row,
  expanded,
  onToggle,
  onApprove,
  onReject,
  actingId,
}: {
  row: ProjetRow
  expanded: boolean
  onToggle: () => void
  onApprove: (cogId: string) => void
  onReject: (cogId: string) => void
  actingId: string | null
}) {
  const cogsSum = row.cogsList.reduce(
    (s, c) => s + (c.montantBudgeteSales || c.montantEngageProd || 0),
    0,
  )
  const offreHT = row.offreFinale || row.offreInitiale || 0
  const tauxCogs = offreHT > 0 ? (row.cogsBudget || 0) / offreHT : null
  const tauxColor =
    tauxCogs == null
      ? 'text-gray-400'
      : tauxCogs > 0.5
        ? 'text-red-600'
        : tauxCogs > 0.35
          ? 'text-amber-600'
          : 'text-green-600'

  return (
    <div className="bg-white rounded-xl border border-pink-200 shadow-sm overflow-hidden transition">
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
            {row.agence && (
              <span className="text-[10px] uppercase tracking-wider text-gray-400">{row.agence}</span>
            )}
            {row.pm && (
              <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                PM {row.pm}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-pink-700 bg-pink-100 px-1.5 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> {row.cogsList.length} à valider
            </span>
          </div>
        </div>
        {/* Metrics — same set as Saisie COGS summary */}
        <div className="hidden sm:flex items-center gap-5 shrink-0 text-[11px]">
          <Metric label="Offre HT" value={fmt(offreHT || null)} />
          <Metric label="Budget COGS" value={fmt(row.cogsBudget)} />
          <Metric label="Saisi" value={fmt(cogsSum)} />
          <Metric label="Taux" value={fmtPct(tauxCogs)} valueClass={tauxColor} />
          <span className="text-xs text-gray-400">
            {row.cogsList.length} dépense{row.cogsList.length !== 1 ? 's' : ''}
          </span>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/30 space-y-4">
          {/* Metric blocks — same row as Saisie COGS */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <MetricBlock label="Offre HT" value={fmt(offreHT || null)} />
            <MetricBlock label="Budget COGS" value={fmt(row.cogsBudget)} />
            <MetricBlock label="Somme à approuver" value={fmt(cogsSum)} />
            <MetricBlock
              label="Reste budget"
              value={fmt((row.cogsBudget || 0) - cogsSum)}
            />
            <MetricBlock
              label="Taux COGS"
              value={<span className={tauxColor}>{fmtPct(tauxCogs)}</span>}
              hint={offreHT > 0 ? 'Budget / Offre HT' : 'Offre HT manquante'}
            />
          </div>

          {/* Existing COGS list (same shape as Saisie COGS table) */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-2 text-left font-medium">Catégorie</th>
                  <th className="px-3 py-2 text-left font-medium">Ressource</th>
                  <th className="px-3 py-2 text-right font-medium">HT Sales</th>
                  <th className="px-3 py-2 text-right font-medium">HT Prod</th>
                  <th className="px-3 py-2 text-left font-medium">Statut</th>
                  <th className="px-3 py-2 text-left font-medium">Commentaire</th>
                  <th className="px-3 py-2 text-right font-medium w-[210px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {row.cogsList.map((c) => {
                  const acting = actingId === c.id
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-gray-700">
                        {c.categorie ? (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {c.categorie}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{c.ressourceName || '—'}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums">
                        {fmt(c.montantBudgeteSales)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 tabular-nums">
                        {fmt(c.montantEngageProd)}
                      </td>
                      <td className="px-3 py-2">
                        {c.statut && (
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              STATUT_BADGE[c.statut] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {c.statut}
                          </span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2 text-gray-500 text-xs truncate max-w-[200px]"
                        title={c.commentaire}
                      >
                        {c.commentaire || '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onApprove(c.id)}
                            disabled={acting}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {acting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Valider
                          </button>
                          <button
                            type="button"
                            onClick={() => onReject(c.id)}
                            disabled={acting}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            title="Refuser"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Metric helpers (mirror cogs-sales) ─── */

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
