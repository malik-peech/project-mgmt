'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Search, Users, Mail, Phone, CreditCard, FileText, ChevronDown, ChevronUp, Plus, MapPin, Star, Pencil, MessageSquare, LayoutGrid, List } from 'lucide-react'
import { useData } from '@/hooks/useData'
import type { Ressource } from '@/types'
import AddPrestataireModal from '@/components/AddPrestataireModal'
import RessourceEditPanel from '@/components/RessourceEditPanel'
import ComboSelect from '@/components/ComboSelect'

const STATUT_BADGE: Record<string, string> = {
  'Validé': 'bg-green-100 text-green-700',
  'Auto-validé': 'bg-emerald-100 text-emerald-700',
  'Réserve': 'bg-amber-100 text-amber-700',
  'Quality check to do': 'bg-pink-100 text-pink-700',
  'Non validé': 'bg-red-100 text-red-700',
  'Blacklisté': 'bg-gray-200 text-gray-600',
}

const PRIORITY_CATEGORIES = [
  'Cadreur', 'Cadreur/Monteur', 'Concepteur-Rédacteur', 'Droniste',
  'Expert podcast', 'Réalisateur', 'Photographe', 'Preneur de son', 'Motion 3D',
]

const categoryColors: Record<string, string> = {
  'Cadreur': 'bg-sky-100 text-sky-700 ring-sky-200',
  'Cadreur/Monteur': 'bg-blue-100 text-blue-700 ring-blue-200',
  'Concepteur-Rédacteur': 'bg-violet-100 text-violet-700 ring-violet-200',
  'Droniste': 'bg-cyan-100 text-cyan-700 ring-cyan-200',
  'Expert podcast': 'bg-rose-100 text-rose-700 ring-rose-200',
  'Réalisateur': 'bg-indigo-100 text-indigo-700 ring-indigo-200',
  'Photographe': 'bg-amber-100 text-amber-700 ring-amber-200',
  'Preneur de son': 'bg-lime-100 text-lime-700 ring-lime-200',
  'Motion 3D': 'bg-purple-100 text-purple-700 ring-purple-200',
  'Motion design': 'bg-purple-50 text-purple-600',
  'Montage': 'bg-blue-50 text-blue-600',
  'Voix off': 'bg-pink-50 text-pink-600',
  'Illustration': 'bg-orange-50 text-orange-600',
  'Graphisme': 'bg-amber-50 text-amber-600',
  'Direction artistique': 'bg-indigo-50 text-indigo-600',
  'Son': 'bg-lime-50 text-lime-600',
  'Traduction': 'bg-emerald-50 text-emerald-600',
  'Production': 'bg-sky-50 text-sky-600',
}

function getCategoryColor(cat: string): string {
  return categoryColors[cat] ?? 'bg-gray-100 text-gray-600'
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function RessourcesPage() {
  const { data: session } = useSession()
  const ready = !!session?.user?.name
  const userRole = (session?.user as { role?: string })?.role
  // RH & Admin get the back-office: every resource (incl. non-validé /
  // blacklisted) + full edit.
  const canEdit = userRole === 'RH' || userRole === 'Admin'

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [paysFilter, setPaysFilter] = useState('')
  const [villeFilter, setVilleFilter] = useState('')
  const [statutFilter, setStatutFilter] = useState('')
  const [selected, setSelected] = useState<Ressource | null>(null)
  const [editing, setEditing] = useState<Ressource | null>(null)
  const [showOtherCategories, setShowOtherCategories] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  // View mode (grid/list) — everyone, persisted in localStorage.
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid'
    return localStorage.getItem('ressources_view') === 'list' ? 'list' : 'grid'
  })
  useEffect(() => {
    try { localStorage.setItem('ressources_view', viewMode) } catch { /* ignore */ }
  }, [viewMode])

  const { data: ressources, loading, revalidate } = useData<Ressource[]>(
    ready ? `/api/ressources${canEdit ? '?all=1' : ''}` : null,
    { key: `ressources-${canEdit ? 'all' : 'valid'}`, enabled: ready, staleTime: 60_000 }
  )

  // PM view = only "Validé" resources. RH/Admin see every resource.
  const list = useMemo(() =>
    canEdit ? (ressources ?? []) : (ressources ?? []).filter((r) => r.statut === 'Validé'),
    [ressources, canEdit]
  )

  // Keep the open side panel in sync after an edit/revalidate.
  const selectedFresh = useMemo(
    () => (selected ? (ressources ?? []).find((r) => r.id === selected.id) || selected : null),
    [ressources, selected]
  )

  // Full option lists (from every resource) for the RH edit form + datalists.
  const { allCategories, allPays, allVilles } = useMemo(() => {
    const cats = new Set<string>(), pays = new Set<string>(), villes = new Set<string>()
    for (const r of ressources ?? []) {
      if (r.categorie) for (const c of r.categorie) cats.add(c)
      if (r.pays) pays.add(r.pays)
      if (r.ville) villes.add(r.ville)
    }
    const sortFr = (a: string, b: string) => a.localeCompare(b, 'fr')
    return {
      allCategories: Array.from(cats).sort(sortFr),
      allPays: Array.from(pays).sort(sortFr),
      allVilles: Array.from(villes).sort(sortFr),
    }
  }, [ressources])

  // All unique categories split into priority and other
  const { priorityCats, otherCats } = useMemo(() => {
    const set = new Set<string>()
    for (const r of list) {
      if (r.categorie) for (const c of r.categorie) set.add(c)
    }
    const all = Array.from(set).sort()
    return {
      priorityCats: PRIORITY_CATEGORIES.filter((c) => all.includes(c)),
      otherCats: all.filter((c) => !PRIORITY_CATEGORIES.includes(c)),
    }
  }, [list])

  // Pays options (from all validated resources)
  const paysOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of list) if (r.pays) set.add(r.pays)
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map((p) => ({ value: p, label: p }))
  }, [list])

  // Ville options — restricted to the selected pays so the two filters cross
  const villeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of list) {
      if (paysFilter && r.pays !== paysFilter) continue
      if (r.ville) set.add(r.ville)
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map((v) => ({ value: v, label: v }))
  }, [list, paysFilter])

  // Statut breakdown (RH/Admin filter). Ordered, with live counts.
  const statutCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of list) {
      const st = r.statut || '—'
      map.set(st, (map.get(st) ?? 0) + 1)
    }
    const order = ['Validé', 'Auto-validé', 'Réserve', 'Quality check to do', 'Non validé', 'Blacklisté']
    const known = order.filter((s) => map.has(s)).map((s) => ({ statut: s, count: map.get(s)! }))
    const others = Array.from(map.keys())
      .filter((s) => !order.includes(s))
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map((s) => ({ statut: s, count: map.get(s)! }))
    return [...known, ...others]
  }, [list])

  const filtered = useMemo(() => {
    let result = list
    if (categoryFilter) result = result.filter((r) => r.categorie?.includes(categoryFilter))
    if (paysFilter) result = result.filter((r) => r.pays === paysFilter)
    if (villeFilter) result = result.filter((r) => r.ville === villeFilter)
    if (statutFilter) result = result.filter((r) => (r.statut || '—') === statutFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.categorie?.some((c) => c.toLowerCase().includes(q)) ||
          r.pays?.toLowerCase().includes(q) ||
          r.ville?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q)
      )
    }
    return result
  }, [list, categoryFilter, paysFilter, villeFilter, statutFilter, search])

  // Count per category
  const countFor = (cat: string) => list.filter((r) => r.categorie?.includes(cat)).length

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Main */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Ressources</h1>
              <p className="text-sm text-gray-500 mt-0.5">{list.length} ressource{list.length !== 1 ? 's' : ''}{canEdit ? '' : ' validées'}</p>
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle (grid / list) */}
              <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  title="Vue grille"
                  className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  title="Vue liste"
                  className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                Ajouter une ressource
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher une ressource, email, catégorie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          {/* Location filters (pays / ville) — croisables avec la catégorie */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 text-gray-400 text-xs">
              <MapPin className="w-3.5 h-3.5" />
              <span>Localisation</span>
            </div>
            <div className="w-44">
              <ComboSelect
                options={paysOptions}
                value={paysFilter}
                onChange={(v) => { setPaysFilter(v); setVilleFilter('') }}
                placeholder="Pays"
                clearable
                size="sm"
              />
            </div>
            <div className="w-44">
              <ComboSelect
                options={villeOptions}
                value={villeFilter}
                onChange={setVilleFilter}
                placeholder="Ville"
                clearable
                size="sm"
              />
            </div>
            {(paysFilter || villeFilter) && (
              <button
                onClick={() => { setPaysFilter(''); setVilleFilter('') }}
                className="text-[11px] text-gray-400 hover:text-gray-600 underline"
              >
                Réinitialiser
              </button>
            )}
          </div>

          {/* Statut filter (RH / Admin) */}
          {canEdit && statutCounts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              <span className="text-xs text-gray-400 mr-1">Statut</span>
              <button
                onClick={() => setStatutFilter('')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                  !statutFilter ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Tous ({list.length})
              </button>
              {statutCounts.map(({ statut, count }) => (
                <button
                  key={statut}
                  onClick={() => setStatutFilter(statut === statutFilter ? '' : statut)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                    statutFilter === statut
                      ? `${STATUT_BADGE[statut] || 'bg-gray-200 text-gray-700'} ring-1 ring-offset-1`
                      : `${STATUT_BADGE[statut] || 'bg-gray-100 text-gray-600'} opacity-70 hover:opacity-100`
                  }`}
                >
                  {statut} ({count})
                </button>
              ))}
            </div>
          )}

          {/* Priority categories */}
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCategoryFilter('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  !categoryFilter ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Toutes ({list.length})
              </button>
              {priorityCats.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    categoryFilter === cat
                      ? `${getCategoryColor(cat)} ring-1 shadow-sm`
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {cat} ({countFor(cat)})
                </button>
              ))}
            </div>

            {/* Other categories (collapsible) */}
            {otherCats.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowOtherCategories(!showOtherCategories)}
                  className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1 transition"
                >
                  {showOtherCategories ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  Autres catégories ({otherCats.length})
                </button>
                {showOtherCategories && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {otherCats.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition ${
                          categoryFilter === cat
                            ? `${getCategoryColor(cat)} ring-1`
                            : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                        }`}
                      >
                        {cat} ({countFor(cat)})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Results */}
          {loading && !ressources ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg">Aucune ressource</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(selected?.id === r.id ? null : r)}
                  className={`text-left rounded-xl border overflow-hidden transition-all hover:shadow-lg group ${
                    selected?.id === r.id
                      ? 'border-indigo-300 ring-2 ring-indigo-200 shadow-md'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  {/* Photo or initials */}
                  <div className="aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden relative">
                    {r.photo && r.photo.length > 0 ? (
                      <img
                        src={r.photo[0].url}
                        alt={r.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <span className="text-3xl font-bold text-gray-300">
                        {getInitials(r.name)}
                      </span>
                    )}
                    {canEdit && r.statut && (
                      <span className={`absolute top-1.5 left-1.5 text-[8px] font-medium px-1.5 py-0.5 rounded-full ${STATUT_BADGE[r.statut] || 'bg-gray-100 text-gray-600'}`}>
                        {r.statut}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-gray-900 text-sm truncate">{r.name}</p>
                    {(r.ville || r.pays) && (
                      <p className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{[r.ville, r.pays].filter(Boolean).join(', ')}</span>
                      </p>
                    )}
                    {r.categorie && r.categorie.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {r.categorie.slice(0, 2).map((c) => (
                          <span key={c} className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${getCategoryColor(c)}`}>
                            {c}
                          </span>
                        ))}
                        {r.categorie.length > 2 && (
                          <span className="text-[9px] text-gray-400">+{r.categorie.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* List view */
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(selected?.id === r.id ? null : r)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 transition ${
                    selected?.id === r.id ? 'bg-indigo-50' : 'hover:bg-gray-50/60'
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                    {r.photo && r.photo.length > 0 ? (
                      <img src={r.photo[0].url} alt={r.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[11px] font-bold text-gray-400">{getInitials(r.name)}</span>
                    )}
                  </div>
                  {/* Name + location */}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-sm truncate">{r.name}</p>
                    {(r.ville || r.pays) && (
                      <p className="flex items-center gap-1 text-[11px] text-gray-400 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {[r.ville, r.pays].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  {/* Categories */}
                  <div className="hidden sm:flex flex-wrap gap-1 justify-end max-w-[220px] shrink-0">
                    {(r.categorie ?? []).slice(0, 3).map((c) => (
                      <span key={c} className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${getCategoryColor(c)}`}>{c}</span>
                    ))}
                    {(r.categorie?.length ?? 0) > 3 && <span className="text-[9px] text-gray-400">+{r.categorie!.length - 3}</span>}
                  </div>
                  {/* Rating */}
                  {r.rating != null && (
                    <span className="hidden md:inline-flex items-center gap-0.5 text-xs text-amber-500 shrink-0 w-12 justify-end">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {r.rating.toFixed(1)}
                    </span>
                  )}
                  {/* Statut (RH/Admin) */}
                  {canEdit && (
                    <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full w-[110px] text-center ${r.statut ? (STATUT_BADGE[r.statut] || 'bg-gray-100 text-gray-600') : 'text-gray-300'}`}>
                      {r.statut || '—'}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add resource modal */}
      <AddPrestataireModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={() => revalidate()}
      />

      {/* Side panel */}
      {selected && selectedFresh && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30 md:hidden" onClick={() => setSelected(null)} />
          <div className="fixed md:relative right-0 top-0 h-full z-40 md:z-0 w-full md:w-[360px] bg-white border-l border-gray-200 shadow-xl md:shadow-none overflow-y-auto shrink-0">
            <div className="p-6">
              <div className="absolute top-4 right-4 flex items-center gap-1">
                {canEdit && (
                  <button
                    onClick={() => setEditing(selectedFresh)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Éditer
                  </button>
                )}
                <button
                  onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                >
                  ✕
                </button>
              </div>

              {/* Photo header */}
              {selectedFresh.photo && selectedFresh.photo.length > 0 ? (
                <div className="w-full aspect-[4/3] rounded-xl overflow-hidden mb-4 -mx-0">
                  <img src={selectedFresh.photo[0].url} alt={selectedFresh.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {getInitials(selectedFresh.name)}
                </div>
              )}

              <div className="text-center mb-4 pr-0">
                <h2 className="text-xl font-bold text-gray-900">{selectedFresh.name}</h2>
                {(selectedFresh.ville || selectedFresh.pays) && (
                  <p className="flex items-center justify-center gap-1 text-xs text-gray-400 mt-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {[selectedFresh.ville, selectedFresh.pays].filter(Boolean).join(', ')}
                  </p>
                )}
                {/* Rating */}
                {selectedFresh.rating != null && (
                  <div className="flex items-center justify-center gap-0.5 mt-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`w-4 h-4 ${n <= Math.round(selectedFresh.rating!) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
                      />
                    ))}
                    <span className="text-xs text-gray-400 ml-1">{selectedFresh.rating!.toFixed(1)}</span>
                  </div>
                )}
                {/* Statut + blacklist (RH/Admin) */}
                {canEdit && (
                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    {selectedFresh.statut && (
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUT_BADGE[selectedFresh.statut] || 'bg-gray-100 text-gray-600'}`}>
                        {selectedFresh.statut}
                      </span>
                    )}
                    {selectedFresh.blacklist && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-800 text-white">Blacklist</span>
                    )}
                  </div>
                )}
              </div>

              {selectedFresh.categorie && selectedFresh.categorie.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-center mb-5">
                  {selectedFresh.categorie.map((c) => (
                    <span key={c} className={`text-xs font-medium px-2.5 py-1 rounded-full ${getCategoryColor(c)}`}>
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {selectedFresh.description && (
                <div className="mb-5 bg-gray-50 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedFresh.description}</p>
                </div>
              )}

              <div className="space-y-3">
                {selectedFresh.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-blue-500" />
                    </div>
                    <a href={`mailto:${selectedFresh.email}`} className="text-indigo-600 hover:underline truncate">
                      {selectedFresh.email}
                    </a>
                  </div>
                )}
                {selectedFresh.telephone && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-green-500" />
                    </div>
                    <a href={`tel:${selectedFresh.telephone}`} className="text-gray-700 hover:text-indigo-600">
                      {selectedFresh.telephone}
                    </a>
                  </div>
                )}
                {selectedFresh.iban && (
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <CreditCard className="w-4 h-4 text-amber-500" />
                    </div>
                    <span className="font-mono text-gray-700 break-all text-xs pt-1.5">{selectedFresh.iban}</span>
                  </div>
                )}
                {/* RIB attachment (RH/Admin) */}
                {canEdit && selectedFresh.rib && selectedFresh.rib.length > 0 && (
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex flex-col gap-0.5 pt-1">
                      {selectedFresh.rib.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline text-xs truncate">
                          {a.filename}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Commentaires qualité (depuis les lignes COGS) */}
              {selectedFresh.comments && selectedFresh.comments.length > 0 && (
                <div className="mt-6">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Retours qualité ({selectedFresh.comments.length})
                  </p>
                  <div className="space-y-2">
                    {selectedFresh.comments.map((cm, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          {cm.note != null ? (
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <Star key={n} className={`w-3 h-3 ${n <= Math.round(cm.note!) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                              ))}
                            </div>
                          ) : <span />}
                          {cm.projetRef && <span className="text-[10px] font-mono text-gray-400">{cm.projetRef}</span>}
                        </div>
                        {cm.comment && <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{cm.comment}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* RH edit modal */}
      {editing && (
        <RessourceEditPanel
          ressource={editing}
          allCategories={allCategories}
          allPays={allPays}
          allVilles={allVilles}
          onClose={() => setEditing(null)}
          onSaved={() => revalidate()}
        />
      )}
    </div>
  )
}
