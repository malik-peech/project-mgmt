'use client'

import { useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Search, Users, Mail, Phone, CreditCard, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { useData } from '@/hooks/useData'
import type { Ressource } from '@/types'

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

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selected, setSelected] = useState<Ressource | null>(null)
  const [showOtherCategories, setShowOtherCategories] = useState(false)

  const { data: ressources, loading } = useData<Ressource[]>(
    ready ? '/api/ressources' : null,
    { key: 'ressources-all', enabled: ready, staleTime: 60_000 }
  )

  // Filter only "Validé" resources
  const list = useMemo(() =>
    (ressources ?? []).filter((r) => r.statut === 'Validé'),
    [ressources]
  )

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

  const filtered = useMemo(() => {
    let result = list
    if (categoryFilter) result = result.filter((r) => r.categorie?.includes(categoryFilter))
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.categorie?.some((c) => c.toLowerCase().includes(q)) ||
          r.description?.toLowerCase().includes(q)
      )
    }
    return result
  }, [list, categoryFilter, search])

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
              <p className="text-sm text-gray-500 mt-0.5">{list.length} ressource{list.length !== 1 ? 's' : ''} validées</p>
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

          {/* Grid */}
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
          ) : (
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
                  <div className="aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden">
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
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-gray-900 text-sm truncate">{r.name}</p>
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
          )}
        </div>
      </div>

      {/* Side panel */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30 md:hidden" onClick={() => setSelected(null)} />
          <div className="fixed md:relative right-0 top-0 h-full z-40 md:z-0 w-full md:w-[360px] bg-white border-l border-gray-200 shadow-xl md:shadow-none overflow-y-auto shrink-0">
            <div className="p-6">
              <button
                onClick={() => setSelected(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                ✕
              </button>

              {/* Photo header */}
              {selected.photo && selected.photo.length > 0 ? (
                <div className="w-full aspect-[4/3] rounded-xl overflow-hidden mb-4 -mx-0">
                  <img src={selected.photo[0].url} alt={selected.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {getInitials(selected.name)}
                </div>
              )}

              <div className="text-center mb-4 pr-0">
                <h2 className="text-xl font-bold text-gray-900">{selected.name}</h2>
              </div>

              {selected.categorie && selected.categorie.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-center mb-5">
                  {selected.categorie.map((c) => (
                    <span key={c} className={`text-xs font-medium px-2.5 py-1 rounded-full ${getCategoryColor(c)}`}>
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {selected.description && (
                <div className="mb-5 bg-gray-50 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selected.description}</p>
                </div>
              )}

              <div className="space-y-3">
                {selected.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-blue-500" />
                    </div>
                    <a href={`mailto:${selected.email}`} className="text-indigo-600 hover:underline truncate">
                      {selected.email}
                    </a>
                  </div>
                )}
                {selected.telephone && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-green-500" />
                    </div>
                    <a href={`tel:${selected.telephone}`} className="text-gray-700 hover:text-indigo-600">
                      {selected.telephone}
                    </a>
                  </div>
                )}
                {selected.iban && (
                  <div className="flex items-start gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <CreditCard className="w-4 h-4 text-amber-500" />
                    </div>
                    <span className="font-mono text-gray-700 break-all text-xs pt-1.5">{selected.iban}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
