'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Lightbulb,
  Plus,
  Search,
  Loader2,
  X,
  CheckCircle2,
  Circle,
  Trash2,
  Calendar as CalendarIcon,
  Users,
  Briefcase,
  Building2,
  Sparkles,
  Filter,
  Paperclip,
  Upload,
  AlertCircle,
} from 'lucide-react'
import ComboSelect from '@/components/ComboSelect'
import DatePicker from '@/components/DatePicker'
import {
  INTENTIONS_STATUTS,
  INTENTIONS_HEADCOUNTS,
  INTENTIONS_ORIGINES,
  INTENTIONS_CONTEXTES,
  INTENTIONS_SALES,
  matchIntentionsSales,
  type Intention,
  type IntentionMonth,
  type IntentionStatut,
} from '@/lib/intentions'

type Tab = 'toOnboard' | 'enProduction' | 'attenteDecision' | 'all'

const STATUT_COLORS: Record<string, string> = {
  'En production': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Attente décision': 'bg-purple-100 text-purple-800 border-purple-200',
  Perdu: 'bg-red-100 text-red-800 border-red-200',
  Gagné: 'bg-green-100 text-green-800 border-green-200',
  Abandonné: 'bg-gray-100 text-gray-700 border-gray-200',
  'Ready to send / present': 'bg-cyan-100 text-cyan-800 border-cyan-200',
}

const fmtCurrency = (n?: number | null) =>
  n != null && !isNaN(n)
    ? new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(n)
    : '—'

const fmtDate = (s?: string) => {
  if (!s) return ''
  const parts = s.substring(0, 10).split('-').map(Number)
  if (parts.length < 3 || parts.some(isNaN)) return s
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function IntentionsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const userName = session?.user?.name || ''
  const userRole = (session?.user as { role?: string })?.role
  const isAdmin = userRole === 'Admin'

  const detectedSales = useMemo(() => matchIntentionsSales(userName), [userName])
  const [salesFilter, setSalesFilter] = useState<string>('') // empty = all (admin); auto-set on mount
  const [tab, setTab] = useState<Tab>('toOnboard')
  const [search, setSearch] = useState('')
  const [intentions, setIntentions] = useState<Intention[]>([])
  const [counts, setCounts] = useState({
    total: 0,
    toOnboard: 0,
    enProduction: 0,
    attenteDecision: 0,
  })
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState<IntentionMonth[]>([])
  const [selected, setSelected] = useState<Intention | null>(null)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // Set initial sales filter: admin → all, else → matched
  useEffect(() => {
    if (!userName) return
    if (isAdmin) {
      setSalesFilter('') // all
    } else {
      setSalesFilter(detectedSales || userName)
    }
  }, [userName, isAdmin, detectedSales])

  const fetchData = useCallback(async () => {
    if (!userName) return
    setLoading(true)
    try {
      const qs = isAdmin && !salesFilter ? 'all=1' : `sales=${encodeURIComponent(salesFilter || userName)}`
      const res = await fetch(`/api/intentions?${qs}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setIntentions(data.intentions || [])
        setCounts(data.counts || { total: 0, toOnboard: 0, enProduction: 0, attenteDecision: 0 })
      }
    } finally {
      setLoading(false)
    }
  }, [userName, isAdmin, salesFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Load months once
  useEffect(() => {
    fetch('/api/intentions/months', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMonths(d.months || []))
      .catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    let list = intentions
    if (tab === 'toOnboard') list = list.filter((i) => !i.onboardingOk)
    else if (tab === 'enProduction')
      list = list.filter((i) => i.onboardingOk && i.statut === 'En production')
    else if (tab === 'attenteDecision')
      list = list.filter((i) => i.onboardingOk && i.statut === 'Attente décision')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (i) =>
          (i.client || '').toLowerCase().includes(q) ||
          (i.projet || '').toLowerCase().includes(q) ||
          (i.brief || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [intentions, tab, search])

  if (status === 'loading' || !userName) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Intentions</h1>
              <p className="text-sm text-gray-500">
                Suivi des intentions commerciales en cours
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Nouvelle intention
          </button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard
            label="À onboarder"
            value={counts.toOnboard}
            color="amber"
            icon={<AlertCircle className="w-4 h-4" />}
          />
          <KpiCard
            label="En production"
            value={counts.enProduction}
            color="yellow"
            icon={<Sparkles className="w-4 h-4" />}
          />
          <KpiCard
            label="Attente décision"
            value={counts.attenteDecision}
            color="purple"
            icon={<CalendarIcon className="w-4 h-4" />}
          />
          <KpiCard
            label="Total intentions"
            value={counts.total}
            color="indigo"
            icon={<Lightbulb className="w-4 h-4" />}
          />
        </div>

        {/* Tabs + filters */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
            <TabButton active={tab === 'toOnboard'} onClick={() => setTab('toOnboard')} count={counts.toOnboard}>
              À onboarder
            </TabButton>
            <TabButton
              active={tab === 'enProduction'}
              onClick={() => setTab('enProduction')}
              count={counts.enProduction}
            >
              En production
            </TabButton>
            <TabButton
              active={tab === 'attenteDecision'}
              onClick={() => setTab('attenteDecision')}
              count={counts.attenteDecision}
            >
              Attente décision
            </TabButton>
            <TabButton active={tab === 'all'} onClick={() => setTab('all')} count={counts.total}>
              Toutes
            </TabButton>

            <div className="ml-auto flex items-center gap-2">
              {isAdmin && (
                <div className="w-44">
                  <ComboSelect
                    options={[
                      { value: '', label: 'Tous les sales' },
                      ...INTENTIONS_SALES.map((s) => ({ value: s, label: s })),
                    ]}
                    value={salesFilter}
                    onChange={setSalesFilter}
                    placeholder="Sales"
                    size="sm"
                  />
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher…"
                  className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Lightbulb className="w-10 h-10 mb-2 text-gray-300" />
              <p className="text-sm">Aucune intention dans cet onglet</p>
              {tab === 'toOnboard' && (
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Créer une intention
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((i) => (
                <li
                  key={i.id}
                  onClick={() => setSelected(i)}
                  className="px-4 py-3 hover:bg-indigo-50/40 cursor-pointer transition"
                >
                  <div className="flex items-start gap-3">
                    {/* Progress dots */}
                    <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
                      <ProgressDot done={!!i.clientOkPourPresentation} />
                      <ProgressDot done={!!i.budgetCommunique} />
                      <ProgressDot done={!!i.onboardingOk} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 truncate">
                          {i.client || '—'}
                        </span>
                        {i.projet && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-gray-700 truncate">{i.projet}</span>
                          </>
                        )}
                        {i.statut && (
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                              STATUT_COLORS[i.statut] || 'bg-gray-100 text-gray-700 border-gray-200'
                            }`}
                          >
                            {i.statut}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        {i.sales && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {i.sales}
                          </span>
                        )}
                        {i.headcount && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {i.headcount} pers.
                          </span>
                        )}
                        {i.monthNames && i.monthNames.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3" />
                            {i.monthNames.join(', ')}
                          </span>
                        )}
                        {i.budgetEstime != null && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            {fmtCurrency(i.budgetEstime)}
                          </span>
                        )}
                        {i.pieces && i.pieces.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Paperclip className="w-3 h-3" />
                            {i.pieces.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Side panel for editing */}
      {selected && (
        <IntentionPanel
          intention={selected}
          months={months}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null)
            fetchData()
          }}
          onDeleted={() => {
            setSelected(null)
            fetchData()
          }}
        />
      )}

      {/* New intention modal */}
      {showNew && (
        <NewIntentionModal
          months={months}
          defaultSales={salesFilter || detectedSales || ''}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

/* ----------------------- helper components ----------------------- */

function KpiCard({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: number
  color: 'indigo' | 'amber' | 'yellow' | 'purple'
  icon: React.ReactNode
}) {
  const COLORS: Record<string, string> = {
    indigo: 'from-indigo-50 to-indigo-100/60 text-indigo-700 ring-indigo-200',
    amber: 'from-amber-50 to-amber-100/60 text-amber-700 ring-amber-200',
    yellow: 'from-yellow-50 to-yellow-100/60 text-yellow-700 ring-yellow-200',
    purple: 'from-purple-50 to-purple-100/60 text-purple-700 ring-purple-200',
  }
  return (
    <div
      className={`rounded-xl bg-gradient-to-br ${COLORS[color]} ring-1 ring-inset px-4 py-3 flex items-center justify-between`}
    >
      <div>
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide opacity-80">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
      {count != null && (
        <span
          className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
            active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function ProgressDot({ done }: { done: boolean }) {
  return done ? (
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
  ) : (
    <Circle className="w-3.5 h-3.5 text-gray-300" />
  )
}

/* ----------------------- side panel ----------------------- */

type PanelProps = {
  intention: Intention
  months: IntentionMonth[]
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

function IntentionPanel({ intention, months, onClose, onSaved, onDeleted }: PanelProps) {
  const [form, setForm] = useState<Intention>(intention)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Persist a single field on blur or toggle.
  const save = async (patch: Partial<Intention>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/intentions/${intention.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        setForm((f) => ({ ...f, ...patch }))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (files: FileList) => {
    if (!files.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      Array.from(files).forEach((f) => fd.append('files', f))
      const res = await fetch(`/api/intentions/${intention.id}/upload`, {
        method: 'POST',
        body: fd,
      })
      if (res.ok) {
        const data = await res.json()
        const fields = data.fields as { Pièces?: { id?: string; url: string; filename: string }[] }
        setForm((f) => ({ ...f, pieces: fields?.Pièces || f.pieces }))
      }
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = async (attachmentId: string) => {
    const res = await fetch(
      `/api/intentions/${intention.id}/upload?attachmentId=${encodeURIComponent(attachmentId)}`,
      { method: 'DELETE' },
    )
    if (res.ok) {
      setForm((f) => ({ ...f, pieces: (f.pieces || []).filter((a) => a.id !== attachmentId) }))
    }
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer cette intention ?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/intentions/${intention.id}`, { method: 'DELETE' })
      if (res.ok) onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-[640px] max-w-full h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white z-10 border-b border-gray-100 px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {form.client || 'Intention'}
            </h2>
            <p className="text-sm text-gray-500 truncate">{form.projet || '—'}</p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
              title="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Onboarding toggle hero */}
          <div
            className={`rounded-xl border-2 p-4 transition ${
              form.onboardingOk
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900">
                  {form.onboardingOk ? 'Onboarding terminé' : 'Onboarding en attente'}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {form.onboardingOk
                    ? 'Cette intention est suivie sur le dashboard.'
                    : 'Coche pour la faire passer dans le suivi actif.'}
                </div>
              </div>
              <button
                onClick={() => save({ onboardingOk: !form.onboardingOk })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  form.onboardingOk
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-amber-600 text-white hover:bg-amber-700'
                }`}
              >
                {form.onboardingOk ? '✓ Onboardé' : 'Marquer onboardé'}
              </button>
            </div>
          </div>

          {/* Milestones */}
          <Section title="Étapes commerciales">
            <ToggleRow
              label="Client OK pour une présentation"
              checked={!!form.clientOkPourPresentation}
              onChange={(v) => save({ clientOkPourPresentation: v })}
            />
            <ToggleRow
              label="Budget communiqué par le client"
              checked={!!form.budgetCommunique}
              onChange={(v) => save({ budgetCommunique: v })}
            />
            <ToggleRow
              label="Client OK pour un call brief"
              checked={!!form.clientOkPourCallBrief}
              onChange={(v) => save({ clientOkPourCallBrief: v })}
            />
          </Section>

          {/* Identification */}
          <Section title="Identification">
            <Field label="Client">
              <input
                type="text"
                value={form.client || ''}
                onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
                onBlur={() => form.client !== intention.client && save({ client: form.client })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </Field>
            <Field label="Projet">
              <input
                type="text"
                value={form.projet || ''}
                onChange={(e) => setForm((f) => ({ ...f, projet: e.target.value }))}
                onBlur={() => form.projet !== intention.projet && save({ projet: form.projet })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </Field>
            <Field label="Sales">
              <ComboSelect
                options={INTENTIONS_SALES.map((s) => ({ value: s, label: s }))}
                value={form.sales || ''}
                onChange={(v) => save({ sales: v })}
                placeholder="-- Sales --"
                clearable
              />
            </Field>
            <Field label="Statut">
              <ComboSelect
                options={INTENTIONS_STATUTS.map((s) => ({ value: s, label: s }))}
                value={form.statut || ''}
                onChange={(v) => save({ statut: (v as IntentionStatut) || undefined })}
                placeholder="-- Statut --"
                clearable
              />
            </Field>
          </Section>

          {/* Contexte & cadrage */}
          <Section title="Contexte & cadrage">
            <Field label="Headcount client">
              <ComboSelect
                options={INTENTIONS_HEADCOUNTS.map((h) => ({ value: h, label: h }))}
                value={form.headcount || ''}
                onChange={(v) => save({ headcount: v })}
                placeholder="-- Tranche --"
                clearable
              />
            </Field>
            <Field label="Origine">
              <ComboSelect
                options={INTENTIONS_ORIGINES.map((o) => ({ value: o, label: o }))}
                value={form.origine || ''}
                onChange={(v) => save({ origine: v })}
                placeholder="-- Origine --"
                clearable
              />
            </Field>
            <Field label="Contexte">
              <ComboSelect
                options={INTENTIONS_CONTEXTES.map((c) => ({ value: c, label: c.trim() }))}
                value={form.contexte || ''}
                onChange={(v) => save({ contexte: v })}
                placeholder="-- Contexte --"
                clearable
              />
            </Field>
            <Field label="Mois de signature visé">
              <MonthMultiSelect
                value={form.monthIds || []}
                months={months}
                onChange={(ids) => save({ monthIds: ids } as Partial<Intention>)}
              />
            </Field>
            <Field label="Budget estimé (€)">
              <input
                type="number"
                value={form.budgetEstime ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    budgetEstime: e.target.value === '' ? undefined : Number(e.target.value),
                  }))
                }
                onBlur={() =>
                  form.budgetEstime !== intention.budgetEstime &&
                  save({ budgetEstime: form.budgetEstime })
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </Field>
            <Field label="Deadline">
              <DatePicker
                value={form.deadline || ''}
                onChange={(v) => save({ deadline: v })}
                placeholder="Deadline"
              />
            </Field>
          </Section>

          {/* Brief */}
          <Section title="Brief">
            <textarea
              rows={5}
              value={form.brief || ''}
              onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))}
              onBlur={() => form.brief !== intention.brief && save({ brief: form.brief })}
              placeholder="Décrire le besoin client, le contexte, les contraintes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Section>

          {/* Pieces */}
          <Section title="Pièces jointes">
            <div className="space-y-2">
              {(form.pieces || []).map((a) => (
                <div
                  key={a.id || a.url}
                  className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-indigo-600 hover:underline truncate"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    {a.filename}
                  </a>
                  {a.id && (
                    <button
                      onClick={() => removeAttachment(a.id!)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <label className="flex items-center justify-center gap-2 px-3 py-3 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer transition">
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {uploading ? 'Upload…' : 'Ajouter une pièce jointe'}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleUpload(e.target.files)}
                />
              </label>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition ${
        checked
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span className="text-sm">{label}</span>
      {checked ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
      ) : (
        <Circle className="w-4 h-4 text-gray-300" />
      )}
    </button>
  )
}

function MonthMultiSelect({
  value,
  months,
  onChange,
}: {
  value: string[]
  months: IntentionMonth[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = months.filter((m) => value.includes(m.id))
  const available = months.filter((m) => !value.includes(m.id))

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1.5 min-h-[28px]">
        {selected.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full"
          >
            {m.name}
            <button
              onClick={() => onChange(value.filter((id) => id !== m.id))}
              className="hover:text-indigo-900"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {selected.length === 0 && (
          <span className="text-xs text-gray-400">Aucun mois sélectionné</span>
        )}
      </div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Ajouter un mois
      </button>
      {open && (
        <div className="mt-1 max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-sm">
          {available.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Aucun mois disponible</div>
          ) : (
            available.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onChange([...value, m.id])
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50"
              >
                {m.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* ----------------------- new modal ----------------------- */

function NewIntentionModal({
  months,
  defaultSales,
  onClose,
  onCreated,
}: {
  months: IntentionMonth[]
  defaultSales: string
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<Partial<Intention>>({
    sales: defaultSales || undefined,
    statut: 'Attente décision',
  })
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!form.client?.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/intentions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-indigo-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Nouvelle intention</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <Field label="Client *">
            <input
              autoFocus
              type="text"
              value={form.client || ''}
              onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
              placeholder="Nom du client"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>
          <Field label="Projet">
            <input
              type="text"
              value={form.projet || ''}
              onChange={(e) => setForm((f) => ({ ...f, projet: e.target.value }))}
              placeholder="Intitulé du projet"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sales">
              <ComboSelect
                options={INTENTIONS_SALES.map((s) => ({ value: s, label: s }))}
                value={form.sales || ''}
                onChange={(v) => setForm((f) => ({ ...f, sales: v }))}
                placeholder="Sales"
                clearable
              />
            </Field>
            <Field label="Statut">
              <ComboSelect
                options={INTENTIONS_STATUTS.map((s) => ({ value: s, label: s }))}
                value={form.statut || ''}
                onChange={(v) =>
                  setForm((f) => ({ ...f, statut: (v as IntentionStatut) || undefined }))
                }
                placeholder="Statut"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Headcount client">
              <ComboSelect
                options={INTENTIONS_HEADCOUNTS.map((h) => ({ value: h, label: h }))}
                value={form.headcount || ''}
                onChange={(v) => setForm((f) => ({ ...f, headcount: v }))}
                placeholder="Tranche"
                clearable
              />
            </Field>
            <Field label="Origine">
              <ComboSelect
                options={INTENTIONS_ORIGINES.map((o) => ({ value: o, label: o }))}
                value={form.origine || ''}
                onChange={(v) => setForm((f) => ({ ...f, origine: v }))}
                placeholder="Origine"
                clearable
              />
            </Field>
          </div>
          <Field label="Contexte">
            <ComboSelect
              options={INTENTIONS_CONTEXTES.map((c) => ({ value: c, label: c.trim() }))}
              value={form.contexte || ''}
              onChange={(v) => setForm((f) => ({ ...f, contexte: v }))}
              placeholder="Contexte"
              clearable
            />
          </Field>
          <Field label="Mois de signature visé">
            <MonthMultiSelect
              value={form.monthIds || []}
              months={months}
              onChange={(ids) => setForm((f) => ({ ...f, monthIds: ids }))}
            />
          </Field>
          <Field label="Brief">
            <textarea
              rows={4}
              value={form.brief || ''}
              onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))}
              placeholder="Décrire le besoin, le contexte, les contraintes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </Field>

          <div className="text-xs text-gray-400 italic pt-2">
            Les pièces jointes peuvent être ajoutées après la création, depuis le panneau de
            l&apos;intention.
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={submitting || !form.client?.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg text-sm font-medium transition"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Créer l&apos;intention
          </button>
        </div>
      </div>
    </div>
  )
}
