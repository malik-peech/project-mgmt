'use client'

import { useState, useRef } from 'react'
import { X, Loader2, UploadCloud, FileText, Trash2, Plus } from 'lucide-react'
import type { Ressource } from '@/types'

const STATUT_OPTIONS = ['Validé', 'Auto-validé', 'Réserve', 'Quality check to do', 'Non validé', 'Blacklisté']

/**
 * RH back-office edit panel for a resource. Modal form covering contact,
 * catégorie, pays/ville, statut, blacklist, bank details (IBAN / Paypal /
 * instructions) and RIB / Photo attachments.
 */
export default function RessourceEditPanel({
  ressource,
  allCategories,
  allPays,
  allVilles,
  onClose,
  onSaved,
}: {
  ressource: Ressource
  allCategories: string[]
  allPays: string[]
  allVilles: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(ressource.name || '')
  const [email, setEmail] = useState(ressource.email || '')
  const [telephone, setTelephone] = useState(ressource.telephone || '')
  const [contactPrincipal, setContactPrincipal] = useState(ressource.contactPrincipal || '')
  const [categorie, setCategorie] = useState<string[]>(ressource.categorie || [])
  const [newCat, setNewCat] = useState('')
  const [pays, setPays] = useState(ressource.pays || '')
  const [ville, setVille] = useState(ressource.ville || '')
  const [statut, setStatut] = useState(ressource.statut || '')
  const [blacklist, setBlacklist] = useState(!!ressource.blacklist)
  const [iban, setIban] = useState(ressource.iban || '')
  const [paypal, setPaypal] = useState(ressource.paypal || '')
  const [instructionsPaiement, setInstructionsPaiement] = useState(ressource.instructionsPaiement || '')
  const [ribFile, setRibFile] = useState<File | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ribRef = useRef<HTMLInputElement | null>(null)
  const photoRef = useRef<HTMLInputElement | null>(null)

  const addCat = (c: string) => {
    const v = c.trim()
    if (v && !categorie.includes(v)) setCategorie([...categorie, v])
    setNewCat('')
  }

  const deleteAttachment = async (field: 'RIB' | 'Photo', index: number) => {
    setSaving(true)
    try {
      const body = field === 'RIB' ? { removeRibIndex: index } : { removePhotoIndex: index }
      await fetch(`/api/ressources/${ressource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      onSaved()
    } catch {
      /* ignore */
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/ressources/${ressource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, telephone, contactPrincipal,
          categorie, pays, ville, statut, blacklist,
          iban, paypal, instructionsPaiement,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)

      // Upload new attachments (if any)
      for (const [field, file] of [['RIB', ribFile], ['Photo', photoFile]] as const) {
        if (!file) continue
        const fd = new FormData()
        fd.append('field', field)
        fd.append('files', file, file.name)
        const upRes = await fetch(`/api/ressources/${ressource.id}/upload`, { method: 'POST', body: fd })
        if (!upRes.ok) throw new Error(`Upload ${field} échoué`)
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">Éditer la ressource</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Nom">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Téléphone">
              <input value={telephone} onChange={(e) => setTelephone(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Contact principal (si société)">
            <input value={contactPrincipal} onChange={(e) => setContactPrincipal(e.target.value)} className={inputCls} />
          </Field>

          {/* Catégorie */}
          <Field label="Catégorie">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {categorie.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                  {c}
                  <button onClick={() => setCategorie(categorie.filter((x) => x !== c))} className="hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {categorie.length === 0 && <span className="text-xs text-gray-400">Aucune catégorie</span>}
            </div>
            <div className="flex gap-2">
              <input
                list="cat-list"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(newCat) } }}
                placeholder="Ajouter une catégorie…"
                className={inputCls}
              />
              <datalist id="cat-list">
                {allCategories.map((c) => <option key={c} value={c} />)}
              </datalist>
              <button onClick={() => addCat(newCat)} className="shrink-0 inline-flex items-center gap-1 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </Field>

          {/* Localisation */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pays">
              <input list="pays-list" value={pays} onChange={(e) => setPays(e.target.value)} className={inputCls} />
              <datalist id="pays-list">{allPays.map((p) => <option key={p} value={p} />)}</datalist>
            </Field>
            <Field label="Ville">
              <input list="ville-list" value={ville} onChange={(e) => setVille(e.target.value)} className={inputCls} />
              <datalist id="ville-list">{allVilles.map((v) => <option key={v} value={v} />)}</datalist>
            </Field>
          </div>

          {/* Statut + blacklist */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label="Statut">
              <select value={statut} onChange={(e) => setStatut(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {STATUT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2 cursor-pointer">
              <input type="checkbox" checked={blacklist} onChange={(e) => setBlacklist(e.target.checked)} className="w-4 h-4 rounded" />
              Blacklist
            </label>
          </div>

          {/* Coordonnées bancaires */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Coordonnées de paiement</p>
            <Field label="IBAN">
              <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="FR76…" className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Paypal">
              <input value={paypal} onChange={(e) => setPaypal(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Instructions spécifiques de paiement">
              <textarea value={instructionsPaiement} onChange={(e) => setInstructionsPaiement(e.target.value)} rows={2} className={inputCls} />
            </Field>

            {/* RIB attachments */}
            <Field label="RIB">
              {ressource.rib && ressource.rib.length > 0 && (
                <div className="space-y-1 mb-2">
                  {ressource.rib.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline truncate">
                        <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{a.filename}</span>
                      </a>
                      <button onClick={() => deleteAttachment('RIB', i)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <FilePicker inputRef={ribRef} file={ribFile} onPick={setRibFile} accept="application/pdf,image/*" />
            </Field>

            {/* Photo attachments */}
            <Field label="Photo">
              {ressource.photo && ressource.photo.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  {ressource.photo.map((a, i) => (
                    <div key={i} className="relative">
                      <img src={a.url} alt={a.filename} className="w-12 h-12 rounded object-cover" />
                      <button onClick={() => deleteAttachment('Photo', i)} className="absolute -top-1 -right-1 bg-white rounded-full text-gray-400 hover:text-red-500 shadow">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <FilePicker inputRef={photoRef} file={photoFile} onPick={setPhotoFile} accept="image/*" />
            </Field>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition disabled:opacity-50">
            Annuler
          </button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

function FilePicker({
  inputRef, file, onPick, accept,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  file: File | null
  onPick: (f: File | null) => void
  accept?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <input ref={inputRef} type="file" accept={accept} onChange={(e) => onPick(e.target.files?.[0] || null)} className="hidden" />
      <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition">
        <UploadCloud className="w-3.5 h-3.5" />
        {file ? 'Changer' : 'Ajouter un fichier'}
      </button>
      {file && <span className="text-xs text-gray-600 truncate flex-1">{file.name}</span>}
      {file && (
        <button type="button" onClick={() => onPick(null)} className="text-gray-400 hover:text-red-500" title="Retirer">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
