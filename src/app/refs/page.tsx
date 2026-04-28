'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Loader2,
  X,
  Star,
  Film,
  Filter,
  ChevronDown,
  ChevronUp,
  Send,
  ExternalLink,
  Sparkles,
  Building2,
  Tag,
  Calendar as CalendarIcon,
  Layers,
  RotateCcw,
  Play,
} from 'lucide-react'
import { vimeoThumb, vimeoEmbedFull } from '@/lib/vimeo'
import type { Reference } from '@/types'

type Facet = { value: string; count: number }
type Facets = {
  industries: Facet[]
  styles: Facet[]
  formats: Facet[]
  useCases: Facet[]
  types: Facet[]
  bus: Facet[]
  moods: Facet[]
  durees: Facet[]
  years: Facet[]
}

type Filters = {
  q: string
  industry: string
  style: string
  format: string
  useCase: string
  typeProjet: string
  bu: string
  yearFrom: string
  yearTo: string
  minRating: string
  diffusableOnly: boolean
  hasVimeo: boolean
}

const EMPTY_FILTERS: Filters = {
  q: '',
  industry: '',
  style: '',
  format: '',
  useCase: '',
  typeProjet: '',
  bu: '',
  yearFrom: '',
  yearTo: '',
  minRating: '',
  diffusableOnly: false,
  hasVimeo: true,
}

const PAGE_SIZE = 60

export default function RefsPage() {
  const { status } = useSession()
  const router = useRouter()

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [searchInput, setSearchInput] = useState('')
  const [refs, setRefs] = useState<Reference[]>([])
  const [total, setTotal] = useState(0)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selected, setSelected] = useState<Reference | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // Debounce free-text search
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === searchInput ? f : { ...f, q: searchInput }))
    }, 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const buildQs = useCallback((f: Filters, off: number) => {
    const qs = new URLSearchParams()
    if (f.q) qs.set('q', f.q)
    if (f.industry) qs.set('industry', f.industry)
    if (f.style) qs.set('style', f.style)
    if (f.format) qs.set('format', f.format)
    if (f.useCase) qs.set('useCase', f.useCase)
    if (f.typeProjet) qs.set('typeProjet', f.typeProjet)
    if (f.bu) qs.set('bu', f.bu)
    if (f.yearFrom) qs.set('yearFrom', f.yearFrom)
    if (f.yearTo) qs.set('yearTo', f.yearTo)
    if (f.minRating) qs.set('minRating', f.minRating)
    if (f.diffusableOnly) qs.set('diffusableOnly', '1')
    if (f.hasVimeo) qs.set('hasVimeo', '1')
    qs.set('offset', String(off))
    qs.set('limit', String(PAGE_SIZE))
    return qs.toString()
  }, [])

  // Fetch on filter change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setOffset(0)
    fetch(`/api/references?${buildQs(filters, 0)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setRefs(data.references || [])
        setTotal(data.total || 0)
        setFacets(data.facets || null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters, buildQs])

  const loadMore = async () => {
    if (loadingMore || refs.length >= total) return
    setLoadingMore(true)
    const nextOffset = offset + PAGE_SIZE
    try {
      const res = await fetch(`/api/references?${buildQs(filters, nextOffset)}`, {
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        setRefs((cur) => [...cur, ...(data.references || [])])
        setOffset(nextOffset)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }))
  }

  const reset = () => {
    setFilters(EMPTY_FILTERS)
    setSearchInput('')
  }

  const activeFilterCount = useMemo(() => {
    let n = 0
    const f = filters
    if (f.industry) n++
    if (f.style) n++
    if (f.format) n++
    if (f.useCase) n++
    if (f.typeProjet) n++
    if (f.bu) n++
    if (f.yearFrom || f.yearTo) n++
    if (f.minRating) n++
    if (f.diffusableOnly) n++
    if (!f.hasVimeo) n++
    return n
  }, [filters])

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Belle Base</h1>
              <p className="text-sm text-gray-500">
                {loading ? 'Chargement…' : `${total} références filtrées`}
              </p>
            </div>
          </div>
          <a
            href="/assistant"
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 text-sm text-gray-700 rounded-lg transition"
          >
            <Sparkles className="w-4 h-4" />
            Assistant chat
          </a>
        </div>

        {/* Search bar */}
        <div className="mb-5 flex items-center gap-3">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Rechercher dans la Belle Base (titre, client, mood, secteur…)"
              className="w-full pl-10 pr-3 py-2.5 text-sm border border-gray-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Réinitialiser ({activeFilterCount})
            </button>
          )}
        </div>

        <div className="grid grid-cols-12 gap-5">
          {/* Filters sidebar */}
          <aside className="col-span-12 md:col-span-3 lg:col-span-3 xl:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sticky top-4">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">Filtres</span>
              </div>

              <div className="space-y-3">
                <ToggleFilter
                  label="Diffusable uniquement"
                  checked={filters.diffusableOnly}
                  onChange={(v) => setFilter('diffusableOnly', v)}
                />
                <ToggleFilter
                  label="Avec vidéo Vimeo"
                  checked={filters.hasVimeo}
                  onChange={(v) => setFilter('hasVimeo', v)}
                />

                <RatingFilter
                  value={filters.minRating}
                  onChange={(v) => setFilter('minRating', v)}
                />

                <YearRangeFilter
                  from={filters.yearFrom}
                  to={filters.yearTo}
                  options={facets?.years || []}
                  onChange={(from, to) => {
                    setFilter('yearFrom', from)
                    setFilter('yearTo', to)
                  }}
                />

                <FacetGroup
                  label="Industry"
                  icon={<Building2 className="w-3.5 h-3.5" />}
                  facets={facets?.industries || []}
                  value={filters.industry}
                  onChange={(v) => setFilter('industry', v)}
                />
                <FacetGroup
                  label="Style"
                  icon={<Sparkles className="w-3.5 h-3.5" />}
                  facets={facets?.styles || []}
                  value={filters.style}
                  onChange={(v) => setFilter('style', v)}
                />
                <FacetGroup
                  label="Type de projet"
                  icon={<Layers className="w-3.5 h-3.5" />}
                  facets={facets?.types || []}
                  value={filters.typeProjet}
                  onChange={(v) => setFilter('typeProjet', v)}
                />
                <FacetGroup
                  label="Use case"
                  icon={<Tag className="w-3.5 h-3.5" />}
                  facets={facets?.useCases || []}
                  value={filters.useCase}
                  onChange={(v) => setFilter('useCase', v)}
                />
                <FacetGroup
                  label="Format"
                  icon={<Film className="w-3.5 h-3.5" />}
                  facets={facets?.formats || []}
                  value={filters.format}
                  onChange={(v) => setFilter('format', v)}
                />
                <FacetGroup
                  label="Business Unit"
                  icon={<Building2 className="w-3.5 h-3.5" />}
                  facets={facets?.bus || []}
                  value={filters.bu}
                  onChange={(v) => setFilter('bu', v)}
                />
              </div>
            </div>
          </aside>

          {/* Grid */}
          <main className="col-span-12 md:col-span-9 lg:col-span-9 xl:col-span-10">
            {loading ? (
              <div className="flex items-center justify-center py-24 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Chargement de la Belle Base…
              </div>
            ) : refs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400 bg-white rounded-xl border border-gray-200">
                <Film className="w-12 h-12 mb-3 text-gray-300" />
                <p className="text-sm">Aucune référence ne correspond à ces filtres</p>
                <button
                  onClick={reset}
                  className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Réinitialiser les filtres
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {refs.map((r) => (
                    <RefCard key={r.id} reference={r} onClick={() => setSelected(r)} />
                  ))}
                </div>
                {refs.length < total && (
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-indigo-400 text-sm text-gray-700 hover:text-indigo-600 rounded-lg shadow-sm transition disabled:opacity-50"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Chargement…
                        </>
                      ) : (
                        <>Charger plus ({total - refs.length} restantes)</>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {selected && (
        <RefDetailPanel reference={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

/* ─────────── Card with hover preview ─────────── */

function RefCard({
  reference,
  onClick,
}: {
  reference: Reference
  onClick: () => void
}) {
  const thumb = vimeoThumb(reference.vimeoUrl)

  return (
    <div
      onClick={onClick}
      className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-indigo-300 overflow-hidden cursor-pointer transition"
    >
      <div className="aspect-video relative bg-gray-900 overflow-hidden">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={reference.titre}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <Film className="w-8 h-8" />
          </div>
        )}

        {/* Play overlay (visible on hover) */}
        {reference.vimeoUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
            <div className="w-12 h-12 rounded-full bg-white/95 shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all">
              <Play className="w-5 h-5 text-gray-900 fill-gray-900 ml-0.5" />
            </div>
          </div>
        )}

        {/* Top-left badges */}
        <div className="absolute top-2 left-2 flex gap-1 z-10">
          {reference.pitch && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white shadow-sm">
              PITCH
            </span>
          )}
          {reference.frontEvidence?.sentCount &&
            reference.frontEvidence.sentCount >= 3 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white shadow-sm">
                <Send className="w-2.5 h-2.5" />
                {reference.frontEvidence.sentCount}
              </span>
            )}
        </div>

        {/* Top-right rating */}
        {reference.rating != null && reference.rating > 0 && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-semibold backdrop-blur-sm">
            <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
            {reference.rating}
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="font-semibold text-gray-900 text-sm truncate flex-1">
            {reference.clientName || '—'}
          </div>
          {reference.year && (
            <span className="text-[11px] text-gray-400 shrink-0">{reference.year}</span>
          )}
        </div>
        <div className="text-xs text-gray-600 line-clamp-2 leading-snug min-h-[2.4em]">
          {reference.titre}
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {reference.industry && (
            <Chip color="indigo">{reference.industry}</Chip>
          )}
          {reference.style && <Chip color="rose">{reference.style}</Chip>}
          {reference.typeProjet?.[0] && (
            <Chip color="gray">{reference.typeProjet[0]}</Chip>
          )}
        </div>
      </div>
    </div>
  )
}

function Chip({
  children,
  color = 'gray',
}: {
  children: React.ReactNode
  color?: 'indigo' | 'rose' | 'gray' | 'emerald'
}) {
  const COLORS = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  }
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border ${COLORS[color]} truncate max-w-full`}
    >
      {children}
    </span>
  )
}

/* ─────────── Filter components ─────────── */

function ToggleFilter({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-xs text-gray-700 group-hover:text-gray-900">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-indigo-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  )
}

function RatingFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const current = Number(value) || 0
  return (
    <div>
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        Rating min
      </div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(current === n ? '' : String(n))}
            className={`p-0.5 transition ${
              n <= current ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'
            }`}
            title={`${n}+`}
          >
            <Star className={`w-4 h-4 ${n <= current ? 'fill-current' : ''}`} />
          </button>
        ))}
        {current > 0 && (
          <button
            onClick={() => onChange('')}
            className="text-[10px] text-gray-400 hover:text-gray-600 ml-1"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

function YearRangeFilter({
  from,
  to,
  options,
  onChange,
}: {
  from: string
  to: string
  options: Facet[]
  onChange: (from: string, to: string) => void
}) {
  const years = options.map((o) => Number(o.value)).filter(Boolean).sort((a, b) => b - a)
  if (years.length === 0) return null
  return (
    <div>
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
        <CalendarIcon className="w-3 h-3" />
        Année
      </div>
      <div className="flex items-center gap-1">
        <select
          value={from}
          onChange={(e) => onChange(e.target.value, to)}
          className="flex-1 text-xs border border-gray-200 rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">De</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400">–</span>
        <select
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
          className="flex-1 text-xs border border-gray-200 rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">À</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function FacetGroup({
  label,
  icon,
  facets,
  value,
  onChange,
}: {
  label: string
  icon?: React.ReactNode
  facets: Facet[]
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? facets : facets.slice(0, 6)
  if (facets.length === 0) return null

  return (
    <div className="border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          {icon}
          {label}
          {value && (
            <span className="ml-1 text-indigo-600 normal-case font-normal">· 1</span>
          )}
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {visible.map((f) => (
            <button
              key={f.value}
              onClick={() => onChange(value === f.value ? '' : f.value)}
              className={`w-full text-left px-2 py-1 text-xs rounded transition flex items-center justify-between ${
                value === f.value
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="truncate">{f.value}</span>
              <span className="text-[10px] text-gray-400 ml-1 shrink-0">{f.count}</span>
            </button>
          ))}
          {facets.length > 6 && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium pl-2 pt-0.5"
            >
              {showAll ? 'Voir moins' : `+ ${facets.length - 6} de plus`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ─────────── Detail panel ─────────── */

function RefDetailPanel({
  reference,
  onClose,
}: {
  reference: Reference
  onClose: () => void
}) {
  const embed = vimeoEmbedFull(reference.vimeoUrl)
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-[720px] max-w-full h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white z-10 border-b border-gray-100 px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {reference.clientName || '—'}
            </h2>
            <p className="text-sm text-gray-500 truncate">{reference.titre}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {embed ? (
            <div className="aspect-video bg-black rounded-xl overflow-hidden">
              <iframe
                src={embed}
                className="w-full h-full"
                allow="autoplay; fullscreen"
                allowFullScreen
                frameBorder={0}
              />
            </div>
          ) : (
            <div className="aspect-video bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
              <Film className="w-10 h-10" />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {reference.vimeoUrl && (
              <a
                href={reference.vimeoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ouvrir sur Vimeo
              </a>
            )}
            {reference.canvaPageUrl && (
              <a
                href={reference.canvaPageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Page Canva
              </a>
            )}
            <a
              href={`https://airtable.com/appEVRkaM6cM2EeDs/tblm0ysiZEAPk37vt/${reference.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-medium rounded-lg transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Airtable
            </a>
          </div>

          {reference.pitch && (
            <DetailSection title="Pitch">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {reference.pitch}
              </p>
            </DetailSection>
          )}

          {reference.testimonial && (
            <DetailSection title="Témoignage client">
              <blockquote className="border-l-4 border-emerald-300 pl-3 text-sm text-gray-700 italic leading-relaxed">
                {reference.testimonial}
              </blockquote>
            </DetailSection>
          )}

          {reference.frontEvidence?.sentCount && (
            <DetailSection title="Usage Sales (Front)">
              <p className="text-sm text-gray-700">
                Envoyée <strong>{reference.frontEvidence.sentCount}×</strong>
                {reference.frontEvidence.lastSentAt &&
                  ` (dernière : ${new Date(reference.frontEvidence.lastSentAt).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })})`}
              </p>
              {reference.frontEvidence.recipientDomains &&
                reference.frontEvidence.recipientDomains.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Destinataires : {reference.frontEvidence.recipientDomains.slice(0, 5).join(', ')}
                  </p>
                )}
            </DetailSection>
          )}

          <DetailSection title="Métadonnées">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Meta label="Année" value={reference.year} />
              <Meta label="Industry" value={reference.industry} />
              <Meta label="Use case" value={reference.useCase} />
              <Meta label="Style" value={reference.style || reference.mainStyle} />
              <Meta label="Format" value={reference.format} />
              <Meta label="Durée" value={reference.duree} />
              <Meta label="Narration" value={reference.narration} />
              <Meta label="Type projet" value={reference.typeProjet?.join(', ')} />
              <Meta label="BU" value={reference.bu?.join(', ')} />
              <Meta label="Mood & Tone" value={reference.moodTone?.join(', ')} />
              <Meta label="Langue" value={reference.langue?.join(', ')} />
              <Meta label="Diffusable" value={reference.diffusable} />
            </dl>
          </DetailSection>
        </div>
      </div>
    </div>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {title}
      </h3>
      {children}
    </div>
  )
}

function Meta({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null
  return (
    <>
      <dt className="text-gray-500 text-xs">{label}</dt>
      <dd className="text-gray-900 text-xs font-medium truncate">{String(value)}</dd>
    </>
  )
}
