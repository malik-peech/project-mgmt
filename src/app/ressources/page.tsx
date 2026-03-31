'use client'

import { useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Search, Users, Mail, Phone, CreditCard, FileText } from 'lucide-react'
import { useData } from '@/hooks/useData'
import type { Ressource } from '@/types'

const categoryColors: Record<string, string> = {
  'Motion design': 'bg-violet-100 text-violet-700',
  'Montage': 'bg-blue-100 text-blue-700',
  'Voix off': 'bg-pink-100 text-pink-700',
  'Illustration': 'bg-orange-100 text-orange-700',
  'Graphisme': 'bg-amber-100 text-amber-700',
  'Direction artistique': 'bg-indigo-100 text-indigo-700',
  'Réalisation': 'bg-teal-100 text-teal-700',
  'Chef opérateur': 'bg-cyan-100 text-cyan-700',
  'Son': 'bg-lime-100 text-lime-700',
  'Traduction': 'bg-emerald-100 text-emerald-700',
  'Casting': 'bg-rose-100 text-rose-700',
  'Production': 'bg-sky-100 text-sky-700',
}

function getCategoryColor(cat: string): string {
  return categoryColors[cat] ?? 'bg-gray-100 text-gray-600'
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function RessourcesPage() {
  const { data: session } = useSession()
  const ready = !!session?.user?.name

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selected, setSelected] = useState<Ressource | null>(null)

  const { data: ressources, loading } = useData<Ressource[]>(
    ready ? '/api/ressources' : null,
    { key: 'ressources-all', enabled: ready, staleTime: 60_000 }
  )

  const list = ressources ?? []

  // All unique categories
  const allCategories = useMemo(() => {
    const set = new Set<string>()
    for (const r of list) {
      if (r.categorie) for (const c of r.categorie) set.add(c)
    }
    return Array.from(set).sort()
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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Main */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 md:p-8">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Ressources</h1>
              <p className="text-sm text-gray-500 mt-0.5">{list.length} ressource{list.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Search + category filters */}
          <div className="space-y-3 mb-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher une ressource, email, catégorie..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategoryFilter('')}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  !categoryFilter ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Toutes
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                    categoryFilter === cat ? getCategoryColor(cat) : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          {loading && !ressources ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg">Aucune ressource</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(selected?.id === r.id ? null : r)}
                  className={`text-left p-4 rounded-xl border transition-all hover:shadow-md ${
                    selected?.id === r.id
                      ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
                      {getInitials(r.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{r.name}</p>
                      {r.email && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{r.email}</p>
                      )}
                      {r.categorie && r.categorie.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {r.categorie.map((c) => (
                            <span key={c} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getCategoryColor(c)}`}>
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
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

              <div className="flex items-center gap-4 mb-6 pr-8">
                <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-bold shrink-0">
                  {getInitials(selected.name)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selected.name}</h2>
                  {selected.statut && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${
                      selected.statut === 'Actif' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {selected.statut}
                    </span>
                  )}
                </div>
              </div>

              {selected.categorie && selected.categorie.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Catégories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.categorie.map((c) => (
                      <span key={c} className={`text-xs font-medium px-2.5 py-1 rounded-full ${getCategoryColor(c)}`}>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selected.description && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</p>
                  <div className="flex items-start gap-2 text-sm text-gray-700">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <p className="whitespace-pre-wrap">{selected.description}</p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {selected.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                    <a href={`mailto:${selected.email}`} className="text-indigo-600 hover:underline truncate">
                      {selected.email}
                    </a>
                  </div>
                )}
                {selected.telephone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                    <a href={`tel:${selected.telephone}`} className="text-gray-700 hover:text-indigo-600">
                      {selected.telephone}
                    </a>
                  </div>
                )}
                {selected.iban && (
                  <div className="flex items-start gap-3 text-sm">
                    <CreditCard className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <span className="font-mono text-gray-700 break-all">{selected.iban}</span>
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
