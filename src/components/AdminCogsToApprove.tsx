'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileSignature,
  Loader2,
  Search,
  Wallet,
} from 'lucide-react'
import type { Cogs, StatutCogs } from '@/types'

interface ProjetRow {
  id: string
  ref?: string
  nom: string
  clientName?: string
  pm?: string
  pm2?: string
  agence?: string
  statut?: string
  bdc?: string
  numeroCommande?: string
  cogsBudget?: number
  offreInitiale?: number
  offreFinale?: number
  toApproveCount: number
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

const STATUT_COGS_OPTIONS: StatutCogs[] = [
  'A Approuver',
  'A Approuver (CDP)',
  'A Approuver (CSM)',
  'Estimée',
  'Engagée',
  'A payer',
  'Autorisée via flash',
  'Payée',
  'Annulée',
  'Refusée',
  'Stand-by',
]

const STATUT_COGS_BADGE: Record<string, string> = {
  'A Approuver': 'bg-pink-100 text-pink-800',
  'A Approuver (CDP)': 'bg-pink-100 text-pink-800',
  'A Approuver (CSM)': 'bg-teal-100 text-teal-800',
  'Estimée': 'bg-blue-100 text-blue-800',
  'Engagée': 'bg-yellow-100 text-yellow-800',
  'A payer': 'bg-orange-100 text-orange-800',
  'Autorisée via flash': 'bg-indigo-100 text-indigo-800',
  'Payée': 'bg-green-100 text-green-800',
  'Annulée': 'bg-red-100 text-red-800',
  'Refusée': 'bg-red-100 text-red-800',
  'Stand-by': 'bg-gray-100 text-gray-800',
}

const STATUT_PROJET_BADGE: Record<string, string> = {
  'En cours': 'bg-yellow-300 text-yellow-900',
  'Finalisation': 'bg-orange-300 text-orange-900',
  'Stand-by': 'bg-pink-300 text-pink-900',
  'Tentative': 'bg-cyan-300 text-cyan-900',
  'Intention': 'bg-violet-300 text-violet-900',
  'Done': 'bg-purple-300 text-purple-900',
}

const APPROUVER_STATUTS = new Set([
  'A Approuver',
  'A Approuver (CDP)',
  'A Approuver (CSM)',
])

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

  const patchCog = async (cogId: string, projetId: string, body: Record<string, unknown>) => {
    setActingId(cogId)
    try {
      const res = await fetch(`/api/cogs/${cogId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        alert('Erreur')
        return
      }
      // Update the COG locally
      setRows((prev) => {
        const next: ProjetRow[] = []
        for (const r of prev) {
          if (r.id !== projetId) {
            next.push(r)
            continue
          }
          const updatedList = r.cogsList.map((c) =>
            c.id === cogId
              ? {
                  ...c,
                  ...(body.statut !== undefined ? { statut: body.statut as StatutCogs } : {}),
                  ...(body.autorisationVanessa !== undefined
                    ? { autorisationVanessa: (body.autorisationVanessa as number | null) ?? undefined }
                    : {}),
                }
              : c,
          )
          const toApproveCount = updatedList.filter(
            (c) => c.statut && APPROUVER_STATUTS.has(c.statut),
          ).length
          // If no more "A Approuver" lines remain on this project, drop the project
          if (toApproveCount === 0) continue
          next.push({ ...r, cogsList: updatedList, toApproveCount })
        }
        return next
      })
      // Recompute counts client-side
      setCounts((c) => {
        if (body.statut && !APPROUVER_STATUTS.has(body.statut as string)) {
          return { ...c, cogs: Math.max(0, c.cogs - 1) }
        }
        return c
      })
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
            <h2 className="text-2xl font-bold text-gray-900">Autorisation COGS</h2>
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
              onPatchCog={(cogId, body) => patchCog(cogId, r.id, body)}
              actingId={actingId}
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
  onPatchCog,
  actingId,
}: {
  row: ProjetRow
  expanded: boolean
  onToggle: () => void
  onPatchCog: (cogId: string, body: Record<string, unknown>) => void
  actingId: string | null
}) {
  const cogsSumToApprove = row.cogsList.reduce(
    (s, c) =>
      s +
      (c.statut && APPROUVER_STATUTS.has(c.statut)
        ? c.montantBudgeteSales || c.montantEngageProd || 0
        : 0),
    0,
  )
  const cogsSumAll = row.cogsList.reduce(
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
            {row.statut && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  STATUT_PROJET_BADGE[row.statut] || 'bg-gray-100 text-gray-600'
                }`}
              >
                {row.statut}
              </span>
            )}
            {row.bdc && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200"
                title={row.numeroCommande ? `N° commande : ${row.numeroCommande}` : undefined}
              >
                <FileSignature className="w-3 h-3" /> BDC: {row.bdc}
              </span>
            )}
            {row.pm && (
              <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                PM {row.pm}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-pink-700 bg-pink-100 px-1.5 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> {row.toApproveCount} à valider
            </span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-5 shrink-0 text-[11px]">
          <Metric label="Offre HT" value={fmt(offreHT || null)} />
          <Metric label="Budget COGS" value={fmt(row.cogsBudget)} />
          <Metric label="Saisi" value={fmt(cogsSumAll)} />
          <Metric label="À approuver" value={fmt(cogsSumToApprove)} />
          <Metric label="Taux" value={fmtPct(tauxCogs)} valueClass={tauxColor} />
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/30 space-y-4">
          {/* Metric blocks */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <MetricBlock label="Offre HT" value={fmt(offreHT || null)} />
            <MetricBlock label="Budget COGS" value={fmt(row.cogsBudget)} />
            <MetricBlock label="Total saisi" value={fmt(cogsSumAll)} />
            <MetricBlock label="À approuver" value={fmt(cogsSumToApprove)} />
            <MetricBlock
              label="Taux COGS"
              value={<span className={tauxColor}>{fmtPct(tauxCogs)}</span>}
              hint={offreHT > 0 ? 'Budget / Offre HT' : 'Offre HT manquante'}
            />
          </div>

          {/* BDC info bar */}
          {(row.bdc || row.numeroCommande) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <FileSignature className="w-3.5 h-3.5" /> BDC : {row.bdc || '—'}
              </span>
              {row.numeroCommande && (
                <span>
                  N° commande : <span className="font-mono">{row.numeroCommande}</span>
                </span>
              )}
            </div>
          )}

          {/* COGS table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-2 text-left font-medium">Catégorie</th>
                  <th className="px-3 py-2 text-left font-medium">Ressource</th>
                  <th className="px-3 py-2 text-right font-medium">HT Sales</th>
                  <th className="px-3 py-2 text-right font-medium">HT Prod</th>
                  <th className="px-3 py-2 text-left font-medium w-[160px]">Statut</th>
                  <th className="px-3 py-2 text-left font-medium w-[180px]">Autorisation Vanessa</th>
                  <th className="px-3 py-2 text-left font-medium">Commentaire</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {row.cogsList.map((c) => (
                  <CogsRow
                    key={c.id}
                    cog={c}
                    acting={actingId === c.id}
                    onPatch={(body) => onPatchCog(c.id, body)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── CogsRow with editable statut + autorisation Vanessa ─── */

function CogsRow({
  cog,
  acting,
  onPatch,
}: {
  cog: Cogs
  acting: boolean
  onPatch: (body: Record<string, unknown>) => void
}) {
  const [autorValue, setAutorValue] = useState<string>(
    cog.autorisationVanessa != null ? String(cog.autorisationVanessa) : '',
  )
  const [autorDirty, setAutorDirty] = useState(false)

  // Sync external updates (after PATCH success)
  useEffect(() => {
    if (!autorDirty) {
      setAutorValue(cog.autorisationVanessa != null ? String(cog.autorisationVanessa) : '')
    }
  }, [cog.autorisationVanessa, autorDirty])

  const saveAutor = () => {
    const trimmed = autorValue.trim()
    const parsed = trimmed === '' ? null : Number(trimmed)
    if (parsed != null && (typeof parsed !== 'number' || isNaN(parsed))) return
    onPatch({ autorisationVanessa: parsed })
    setAutorDirty(false)
  }

  const fillSuggested = () => {
    const suggested = cog.montantBudgeteSales ?? cog.montantEngageProd ?? 0
    setAutorValue(String(suggested))
    setAutorDirty(true)
    onPatch({ autorisationVanessa: suggested })
    setAutorDirty(false)
  }

  const isToApprove = cog.statut && APPROUVER_STATUTS.has(cog.statut)

  return (
    <tr className={`hover:bg-gray-50/50 ${isToApprove ? '' : 'opacity-80'}`}>
      <td className="px-3 py-2 text-gray-700">
        {cog.categorie ? (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {cog.categorie}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2 text-gray-600 text-xs">{cog.ressourceName || '—'}</td>
      <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums">
        {fmt(cog.montantBudgeteSales)}
      </td>
      <td className="px-3 py-2 text-right text-gray-700 tabular-nums">
        {fmt(cog.montantEngageProd)}
      </td>
      <td className="px-3 py-2">
        <select
          value={cog.statut || ''}
          onChange={(e) => onPatch({ statut: e.target.value })}
          disabled={acting}
          className={`w-full text-[10px] font-medium rounded-full px-2 py-1 border-0 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer disabled:opacity-50 ${
            STATUT_COGS_BADGE[cog.statut || ''] || 'bg-gray-100 text-gray-600'
          }`}
        >
          {STATUT_COGS_OPTIONS.map((s) => (
            <option key={s} value={s} className="bg-white text-gray-900">
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <input
              type="number"
              inputMode="decimal"
              value={autorValue}
              onChange={(e) => {
                setAutorValue(e.target.value)
                setAutorDirty(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveAutor()
              }}
              onBlur={() => {
                if (autorDirty) saveAutor()
              }}
              placeholder="—"
              disabled={acting}
              className="w-full text-xs border border-gray-200 rounded-md pl-2 pr-5 py-1 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">€</span>
          </div>
          {isToApprove && (
            <button
              type="button"
              onClick={fillSuggested}
              disabled={acting}
              title={`Autoriser ${fmt(cog.montantBudgeteSales ?? cog.montantEngageProd ?? 0)}`}
              className="inline-flex items-center px-1.5 py-1 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            </button>
          )}
        </div>
      </td>
      <td
        className="px-3 py-2 text-gray-500 text-xs truncate max-w-[200px]"
        title={cog.commentaire}
      >
        {cog.commentaire || '—'}
      </td>
    </tr>
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
