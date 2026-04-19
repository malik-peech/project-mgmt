'use client'

import { useEffect, useState, useRef } from 'react'
import { X, CheckCircle2, Circle, Upload, Loader2, Paperclip, Trash2, Plus } from 'lucide-react'
import ComboSelect from './ComboSelect'
import DatePicker from './DatePicker'
import type { Projet, Attachment, Client } from '@/types'
import { missingOnboardingFields, ONBOARDING_FIELD_LABELS } from '@/lib/onboarding'

interface Mensuel { id: string; name: string }

interface Props {
  projet: Projet
  onClose: () => void
  onSaved: (updated: Projet) => void
  clients: Client[]
  mensuels: Mensuel[]
  pmOptions: string[]
  onClientCreated: (c: Client) => void
}

const CURRENCIES = ['EUR', 'USD', 'CHF']
const ORIGINES = ['Client existant', 'Nouveau client']
const AGENCES = ['Peech', 'Newic', 'Meecro', 'Creespy']
const TYPES_CONTACT = ['Compta', 'Client']

type FormState = {
  moisSignatureIds: string[]
  currency: string
  clientId: string
  origine: string
  agence: string
  numeroDevis: string
  cogsBudget: string
  timeCreaBudget: string
  travelBudget: string
  timeProdBudget: string
  timeDaBudget: string
  dateFinalisationPrevue: string
  dureeContrat: string
  libelleFacture: string
  contactCompta: string
  typeDeContact: string
  pm: string
}

function initForm(p: Projet): FormState {
  return {
    moisSignatureIds: p.moisSignatureIds || [],
    currency: p.currency || '',
    clientId: p.clientId || '',
    origine: p.origine || '',
    agence: p.agence || '',
    numeroDevis: p.numeroDevis || '',
    cogsBudget: p.cogsBudget != null ? String(p.cogsBudget) : '',
    timeCreaBudget: p.timeCreaBudget != null ? String(p.timeCreaBudget) : '',
    travelBudget: p.travelBudget != null ? String(p.travelBudget) : '',
    timeProdBudget: p.timeProdBudget != null ? String(p.timeProdBudget) : '',
    timeDaBudget: p.timeDaBudget != null ? String(p.timeDaBudget) : '',
    dateFinalisationPrevue: p.dateFinalisationPrevue || '',
    dureeContrat: p.dureeContrat != null ? String(p.dureeContrat) : '',
    libelleFacture: p.libelleFacture || '',
    contactCompta: p.contactCompta || '',
    typeDeContact: p.typeDeContact || '',
    pm: p.pm || '',
  }
}

export default function OnboardingPanel({
  projet,
  onClose,
  onSaved,
  clients,
  mensuels,
  pmOptions,
  onClientCreated,
}: Props) {
  const [form, setForm] = useState<FormState>(() => initForm(projet))
  const [devisFiles, setDevisFiles] = useState<Attachment[]>(projet.devisSigne || [])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)
  const [showMoisPicker, setShowMoisPicker] = useState(false)
  // Track client IDs created in this session — we only surface the
  // official-info form for brand-new clients, not for every existing client.
  const [newClientIds, setNewClientIds] = useState<string[]>([])
  const [clientInfo, setClientInfo] = useState({
    officialSiren: '',
    nameOfficial: '',
    address: '',
    postalCode: '',
    city: '',
    countryAlpha2: '',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Re-init when projet changes
  useEffect(() => {
    setForm(initForm(projet))
    setDevisFiles(projet.devisSigne || [])
    setNewClientIds([])
    setClientInfo({
      officialSiren: '',
      nameOfficial: '',
      address: '',
      postalCode: '',
      city: '',
      countryAlpha2: '',
    })
  }, [projet.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const showClientInfoSection = !!form.clientId && newClientIds.includes(form.clientId)

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  // Build a preview Projet to compute missing fields in real time
  const previewProjet: Projet = {
    ...projet,
    moisSignatureIds: form.moisSignatureIds,
    currency: form.currency as Projet['currency'],
    clientId: form.clientId,
    origine: form.origine as Projet['origine'],
    agence: form.agence,
    numeroDevis: form.numeroDevis,
    cogsBudget: form.cogsBudget === '' ? undefined : Number(form.cogsBudget),
    timeCreaBudget: form.timeCreaBudget === '' ? undefined : Number(form.timeCreaBudget),
    travelBudget: form.travelBudget === '' ? undefined : Number(form.travelBudget),
    timeProdBudget: form.timeProdBudget === '' ? undefined : Number(form.timeProdBudget),
    timeDaBudget: form.timeDaBudget === '' ? undefined : Number(form.timeDaBudget),
    dateFinalisationPrevue: form.dateFinalisationPrevue,
    dureeContrat: form.dureeContrat === '' ? undefined : Number(form.dureeContrat),
    libelleFacture: form.libelleFacture,
    contactCompta: form.contactCompta,
    typeDeContact: form.typeDeContact as Projet['typeDeContact'],
    pm: form.pm,
    devisSigne: devisFiles,
  }
  const missing = missingOnboardingFields(previewProjet)
  const total = 18
  const filled = total - missing.length
  const pct = Math.round((filled / total) * 100)

  const createClient = async () => {
    if (!newClientName.trim()) return
    setCreatingClient(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName.trim() }),
      })
      if (res.ok) {
        const client: Client = await res.json()
        onClientCreated(client)
        update('clientId', client.id)
        setNewClientIds((ids) => (ids.includes(client.id) ? ids : [...ids, client.id]))
        setClientInfo({
          officialSiren: client.officialSiren || '',
          nameOfficial: client.nameOfficial || newClientName.trim(),
          address: client.address || '',
          postalCode: client.postalCode || '',
          city: client.city || '',
          countryAlpha2: client.countryAlpha2 || '',
        })
        setNewClientName('')
        setShowNewClient(false)
      }
    } finally {
      setCreatingClient(false)
    }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const fd = new FormData()
      for (const f of Array.from(files)) fd.append('files', f)
      const res = await fetch(`/api/onboarding/${projet.id}/upload`, { method: 'POST', body: fd })
      if (res.ok) {
        const json = await res.json()
        const updatedAttachments = (json.fields?.['Devis signé'] as Attachment[]) || []
        setDevisFiles(updatedAttachments)
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const deleteAttachment = async (att: Attachment & { id?: string }) => {
    const qs = att.id ? `attachmentId=${att.id}` : `attachmentUrl=${encodeURIComponent(att.url)}`
    const res = await fetch(`/api/onboarding/${projet.id}/upload?${qs}`, { method: 'DELETE' })
    if (res.ok) setDevisFiles((curr) => curr.filter((a) => a.url !== att.url))
  }

  const save = async () => {
    setSaving(true)
    try {
      const body = {
        moisSignatureIds: form.moisSignatureIds,
        currency: form.currency || null,
        clientId: form.clientId || null,
        origine: form.origine || null,
        agence: form.agence || null,
        numeroDevis: form.numeroDevis || null,
        cogsBudget: form.cogsBudget === '' ? null : form.cogsBudget,
        timeCreaBudget: form.timeCreaBudget === '' ? null : form.timeCreaBudget,
        travelBudget: form.travelBudget === '' ? null : form.travelBudget,
        timeProdBudget: form.timeProdBudget === '' ? null : form.timeProdBudget,
        timeDaBudget: form.timeDaBudget === '' ? null : form.timeDaBudget,
        dateFinalisationPrevue: form.dateFinalisationPrevue || null,
        dureeContrat: form.dureeContrat === '' ? null : form.dureeContrat,
        libelleFacture: form.libelleFacture || null,
        contactCompta: form.contactCompta || null,
        typeDeContact: form.typeDeContact || null,
        pm: form.pm || null,
      }
      const res = await fetch(`/api/onboarding/${projet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        if (showClientInfoSection && form.clientId) {
          const clientRes = await fetch(`/api/clients/${form.clientId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clientInfo),
          })
          if (!clientRes.ok) {
            const err = await clientRes.text()
            alert(`Erreur (infos client): ${err}`)
            return
          }
        }
        // Build the optimistic updated projet from current form state so the
        // list reflects changes instantly (no 3-5s wait on Airtable round-trip).
        onSaved(previewProjet)
      } else {
        const err = await res.text()
        alert(`Erreur: ${err}`)
      }
    } finally {
      setSaving(false)
    }
  }

  // Sort mensuels descending (most recent first)
  const sortedMensuels = [...mensuels].sort((a, b) => b.name.localeCompare(a.name))
  const selectedMoisNames = form.moisSignatureIds
    .map((id) => mensuels.find((m) => m.id === id)?.name)
    .filter(Boolean)

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }))
  const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }))
  const origineOptions = ORIGINES.map((o) => ({ value: o, label: o }))
  const agenceOptions = AGENCES.map((a) => ({ value: a, label: a }))
  const typeContactOptions = TYPES_CONTACT.map((t) => ({ value: t, label: t }))
  const pmDropdownOptions = pmOptions.map((p) => ({ value: p, label: p }))

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-[640px] bg-gray-50 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {projet.ref && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-semibold">
                  {projet.ref}
                </span>
              )}
              {projet.statut && (
                <span className="text-xs text-gray-500">{projet.statut}</span>
              )}
            </div>
            <h2 className="text-lg font-bold text-gray-900 truncate">{projet.nom}</h2>
            {projet.clientName && <p className="text-sm text-gray-500 truncate">{projet.clientName}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-gray-700">Progression onboarding</span>
            <span className="text-gray-500">{filled}/{total} champs · {pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-indigo-500' : 'bg-amber-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Form content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* SECTION: Informations client */}
          <Section title="Informations client">
            <Field label="Client" required missing={missing.includes('clientLink')}>
              {showNewClient ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createClient()}
                    placeholder="Nom du nouveau client"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                  <button
                    onClick={createClient}
                    disabled={creatingClient || !newClientName.trim()}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {creatingClient ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer'}
                  </button>
                  <button
                    onClick={() => { setShowNewClient(false); setNewClientName('') }}
                    className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <ComboSelect
                    options={clientOptions}
                    value={form.clientId}
                    onChange={(v) => update('clientId', v)}
                    placeholder="Choisir un client…"
                    clearable
                    className="flex-1"
                  />
                  <button
                    onClick={() => setShowNewClient(true)}
                    className="shrink-0 px-3 py-2 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Nouveau
                  </button>
                </div>
              )}
            </Field>

            <Field label="Origine" required missing={missing.includes('origine')}>
              <ComboSelect
                options={origineOptions}
                value={form.origine}
                onChange={(v) => update('origine', v)}
                placeholder="Client existant / Nouveau"
                clearable
              />
            </Field>

            <Field label="Agence" required missing={missing.includes('agence')}>
              <ComboSelect
                options={agenceOptions}
                value={form.agence}
                onChange={(v) => update('agence', v)}
                placeholder="Peech / Newic / …"
                clearable
              />
            </Field>

            <Field label="Mois de signature" required missing={missing.includes('moisSignature')}>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMoisPicker((s) => !s)}
                  className="w-full flex items-center justify-between gap-2 border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm text-left hover:border-gray-300"
                >
                  <span className={selectedMoisNames.length > 0 ? 'text-gray-900' : 'text-gray-400'}>
                    {selectedMoisNames.length > 0 ? selectedMoisNames.join(', ') : 'Choisir un ou plusieurs mois…'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {form.moisSignatureIds.length > 0 ? `${form.moisSignatureIds.length} sélectionné(s)` : ''}
                  </span>
                </button>
                {showMoisPicker && (
                  <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
                    {sortedMensuels.length === 0 ? (
                      <p className="p-3 text-sm text-gray-400 text-center">Aucun mois disponible</p>
                    ) : (
                      sortedMensuels.map((m) => {
                        const selected = form.moisSignatureIds.includes(m.id)
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              update(
                                'moisSignatureIds',
                                selected
                                  ? form.moisSignatureIds.filter((id) => id !== m.id)
                                  : [...form.moisSignatureIds, m.id]
                              )
                            }}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                              selected ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-gray-50'
                            }`}
                          >
                            <span>{m.name}</span>
                            {selected && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                        )
                      })
                    )}
                    <div className="sticky bottom-0 p-2 bg-white border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setShowMoisPicker(false)}
                        className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-700"
                      >
                        Fermer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Field>
          </Section>

          {/* SECTION: Informations officielles client (nouveau client créé) */}
          {showClientInfoSection && (
            <Section title="Informations officielles client">
              <p className="-mt-1 text-xs text-gray-500">
                Nouveau client — complétez les infos légales pour la facturation.
              </p>
              <Field label="Official SIREN">
                <input
                  type="text"
                  value={clientInfo.officialSiren}
                  onChange={(e) => setClientInfo((c) => ({ ...c, officialSiren: e.target.value }))}
                  placeholder="ex. 552120222"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
              <Field label="Nom officiel (raison sociale)">
                <input
                  type="text"
                  value={clientInfo.nameOfficial}
                  onChange={(e) => setClientInfo((c) => ({ ...c, nameOfficial: e.target.value }))}
                  placeholder="ex. SNCF Voyageurs SA"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
              <Field label="Adresse">
                <input
                  type="text"
                  value={clientInfo.address}
                  onChange={(e) => setClientInfo((c) => ({ ...c, address: e.target.value }))}
                  placeholder="ex. 2 place aux Étoiles"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Code postal">
                  <input
                    type="text"
                    value={clientInfo.postalCode}
                    onChange={(e) => setClientInfo((c) => ({ ...c, postalCode: e.target.value }))}
                    placeholder="ex. 93200"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </Field>
                <Field label="Ville">
                  <input
                    type="text"
                    value={clientInfo.city}
                    onChange={(e) => setClientInfo((c) => ({ ...c, city: e.target.value }))}
                    placeholder="ex. Saint-Denis"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </Field>
              </div>
              <Field label="Pays (code ISO α-2)">
                <input
                  type="text"
                  maxLength={2}
                  value={clientInfo.countryAlpha2}
                  onChange={(e) => setClientInfo((c) => ({ ...c, countryAlpha2: e.target.value.toUpperCase() }))}
                  placeholder="ex. FR"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                />
              </Field>
            </Section>
          )}

          {/* SECTION: Devis */}
          <Section title="Devis">
            <Field label="Numéro de devis" required missing={missing.includes('numeroDevis')}>
              <input
                type="text"
                value={form.numeroDevis}
                onChange={(e) => update('numeroDevis', e.target.value)}
                placeholder="ex. DEV-2026-042"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </Field>

            <Field label="Devise" required missing={missing.includes('currency')}>
              <ComboSelect
                options={currencyOptions}
                value={form.currency}
                onChange={(v) => update('currency', v)}
                placeholder="EUR / USD / CHF"
                clearable
              />
            </Field>

            <Field label="Devis signé (PDF)" required missing={missing.includes('devisSigne')}>
              <div className="space-y-2">
                {devisFiles.length > 0 && (
                  <div className="space-y-1.5">
                    {devisFiles.map((att, i) => (
                      <div key={`${att.url}-${i}`} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                        <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 text-sm text-indigo-600 hover:underline truncate"
                        >
                          {att.filename}
                        </a>
                        <button
                          onClick={() => deleteAttachment(att)}
                          className="p-1 text-gray-400 hover:text-red-500"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                  id={`devis-upload-${projet.id}`}
                />
                <label
                  htmlFor={`devis-upload-${projet.id}`}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer transition"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Upload…
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" /> Ajouter un fichier
                    </>
                  )}
                </label>
              </div>
            </Field>
          </Section>

          {/* SECTION: Budgets */}
          <Section title="Budgets">
            <div className="grid grid-cols-2 gap-3">
              <Field label="COGS (€)" required missing={missing.includes('cogsBudget')}>
                <input
                  type="number"
                  value={form.cogsBudget}
                  onChange={(e) => update('cogsBudget', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
              <Field label="Travel (€)" required missing={missing.includes('travelBudget')}>
                <input
                  type="number"
                  value={form.travelBudget}
                  onChange={(e) => update('travelBudget', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
              <Field label="Time Créa (h)" required missing={missing.includes('timeCreaBudget')}>
                <input
                  type="number"
                  value={form.timeCreaBudget}
                  onChange={(e) => update('timeCreaBudget', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
              <Field label="Time Prod (h)" required missing={missing.includes('timeProdBudget')}>
                <input
                  type="number"
                  value={form.timeProdBudget}
                  onChange={(e) => update('timeProdBudget', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
              <Field label="Time DA (h)" required missing={missing.includes('timeDaBudget')}>
                <input
                  type="number"
                  value={form.timeDaBudget}
                  onChange={(e) => update('timeDaBudget', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
            </div>
          </Section>

          {/* SECTION: Contrat */}
          <Section title="Contrat">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date finalisation prévue" required missing={missing.includes('dateFinalisationPrevue')}>
                <DatePicker
                  value={form.dateFinalisationPrevue}
                  onChange={(v) => update('dateFinalisationPrevue', v)}
                  placeholder="Choisir…"
                  clearable
                />
              </Field>
              <Field label="Durée contrat (mois)" required missing={missing.includes('dureeContrat')}>
                <input
                  type="number"
                  value={form.dureeContrat}
                  onChange={(e) => update('dureeContrat', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
            </div>
          </Section>

          {/* SECTION: Facturation */}
          <Section title="Facturation">
            <Field label="Libellé facture" required missing={missing.includes('libelleFacture')}>
              <input
                type="text"
                value={form.libelleFacture}
                onChange={(e) => update('libelleFacture', e.target.value)}
                placeholder="ex. Prestation vidéo — Q1 2026"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </Field>
            <Field label="Contact compta" required missing={missing.includes('contactCompta')}>
              <textarea
                value={form.contactCompta}
                onChange={(e) => update('contactCompta', e.target.value)}
                rows={2}
                placeholder="Nom, email, téléphone…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </Field>
            <Field label="Type de contact" required missing={missing.includes('typeDeContact')}>
              <ComboSelect
                options={typeContactOptions}
                value={form.typeDeContact}
                onChange={(v) => update('typeDeContact', v)}
                placeholder="Compta / Client"
                clearable
              />
            </Field>
          </Section>

          {/* SECTION: Équipe */}
          <Section title="Équipe">
            <Field label="PM (manual)" required missing={missing.includes('pm')}>
              <ComboSelect
                options={pmDropdownOptions}
                value={form.pm}
                onChange={(v) => update('pm', v)}
                placeholder="Affecter un PM…"
                clearable
              />
            </Field>
          </Section>

          {/* Missing fields recap */}
          {missing.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-800 mb-1.5">
                Champs à compléter ({missing.length})
              </p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {missing.map((m) => (
                  <li key={m} className="flex items-center gap-1.5">
                    <Circle className="w-2.5 h-2.5 shrink-0" /> {ONBOARDING_FIELD_LABELS[m]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            {missing.length === 0 ? (
              <span className="text-green-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Onboarding complet
              </span>
            ) : (
              <span>{missing.length} champ{missing.length > 1 ? 's' : ''} restant{missing.length > 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Annuler
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  children,
  required,
  missing,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
  missing?: boolean
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1.5">
        {missing ? (
          <Circle className="w-2.5 h-2.5 text-amber-500" />
        ) : required ? (
          <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
        ) : null}
        {label}
        {required && <span className="text-amber-500">*</span>}
      </label>
      {children}
    </div>
  )
}
