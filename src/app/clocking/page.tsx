'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useData } from '@/hooks/useData'
import ComboSelect from '@/components/ComboSelect'
import ContextMenu from '@/components/ContextMenu'
import {
  Clock, ChevronLeft, ChevronRight, Plus, Copy, Trash2, AlertTriangle, Loader2, CalendarDays, ListTodo, FolderKanban,
} from 'lucide-react'
import type { TimeLog, Projet, Task } from '@/types'

// Compact durations for one-click logging from tasks / projects helpers.
const INLINE_DURATIONS: { label: string; seconds: number }[] = [
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
  { label: '2h', seconds: 7200 },
  { label: '4h', seconds: 14400 },
]

// Preset durations (labels align with the Airtable "Time range" options).
const DURATION_PRESETS: { label: string; seconds: number }[] = [
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
  { label: '45 min', seconds: 2700 },
  { label: '1h', seconds: 3600 },
  { label: '1h30', seconds: 5400 },
  { label: '2h', seconds: 7200 },
  { label: '3h', seconds: 10800 },
  { label: '4h', seconds: 14400 },
  { label: '7h', seconds: 25200 },
]
const ALL_PRESET_SECONDS = [300, 600, 900, 1800, 2700, 3600, 5400, 7200, 9000, 10800, 12600, 14400, 18000, 21600, 25200, 28800]
const DAY_TARGET_SECONDS = 25200 // 7h
const HOUR_PX = 42

// ── date helpers (timezone-safe, local) ──
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseLocal = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function startOfWeekMonday(d: Date) {
  const x = new Date(d)
  const dow = (x.getDay() + 6) % 7 // Mon=0
  x.setDate(x.getDate() - dow)
  x.setHours(0, 0, 0, 0)
  return x
}
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
const isToday = (d: Date) => ymd(d) === ymd(new Date())

function fmtDur(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m === 0 ? `${h}h` : `${h}h${pad(m)}`
}
function snapToPreset(seconds: number): number {
  let best = ALL_PRESET_SECONDS[0], bd = Infinity
  for (const s of ALL_PRESET_SECONDS) { const d = Math.abs(s - seconds); if (d < bd) { bd = d; best = s } }
  return best
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven']

export default function ClockingPage() {
  const { data: session } = useSession()
  const userName = session?.user?.name || ''
  const ready = !!userName

  const [view, setView] = useState<'jour' | 'semaine' | 'mois'>('semaine')
  const [anchor, setAnchor] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [addDate, setAddDate] = useState<string>(() => ymd(new Date()))
  const [projetId, setProjetId] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; log: TimeLog } | null>(null)
  // Date (YYYY-MM-DD) for the click-to-add popup, or null when closed.
  const [addModal, setAddModal] = useState<string | null>(null)

  // Visible range → [from, to]
  const [from, to] = useMemo<[string, string]>(() => {
    if (view === 'jour') return [ymd(anchor), ymd(anchor)]
    if (view === 'semaine') { const mon = startOfWeekMonday(anchor); return [ymd(mon), ymd(addDays(mon, 6))] }
    // mois: cover the grid (from Monday of the 1st week to Sunday of the last)
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    return [ymd(startOfWeekMonday(first)), ymd(addDays(startOfWeekMonday(last), 6))]
  }, [view, anchor])

  const { data, mutate, revalidate, loading } = useData<{ linked: boolean; entries: TimeLog[] }>(
    ready ? `/api/timelog?user=${encodeURIComponent(userName)}&from=${from}&to=${to}` : null,
    { key: `timelog-${userName}-${from}-${to}`, enabled: ready }
  )
  const { data: projets } = useData<Projet[]>(
    ready ? '/api/projets' : null,
    { key: 'projets-all', enabled: ready, staleTime: 60_000 }
  )
  const { data: tasks } = useData<Task[]>(
    ready ? `/api/tasks?pm=${encodeURIComponent(userName)}` : null,
    { key: `tasks-clocking-${userName}`, enabled: ready, staleTime: 60_000 }
  )

  const linked = data?.linked !== false
  const entries = useMemo(() => data?.entries ?? [], [data])

  const byDate = useMemo(() => {
    const m = new Map<string, TimeLog[]>()
    for (const e of entries) {
      const list = m.get(e.date) ?? []
      list.push(e)
      m.set(e.date, list)
    }
    return m
  }, [entries])

  const totalFor = useCallback((dateStr: string) =>
    (byDate.get(dateStr) ?? []).reduce((s, e) => s + (e.durationSeconds || 0), 0), [byDate])

  // Projets du PM (statut ≠ Done) + le projet générique 1789.
  const myProjects = useMemo(() => {
    const all = projets ?? []
    const mine = all.filter((p) => p.statut !== 'Done' && p.pm === userName)
    const p1789 = all.find((p) => p.ref === '1789')
    return p1789 && !mine.some((p) => p.id === p1789.id) ? [...mine, p1789] : mine
  }, [projets, userName])

  const projetOptions = useMemo(() =>
    myProjects.map((p) => ({
      value: p.id,
      label: `${p.ref ? p.ref + ' · ' : ''}${p.nom || '—'}`,
      sub: [p.ref, p.clientName].filter(Boolean).join(' · ') || undefined,
    })),
    [myProjects]
  )

  // The user's tasks grouped by day (dueDate), to surface "what I did that day".
  const tasksByDate = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tasks ?? []) {
      if (t.assigneManuel !== userName) continue
      const d = (t.dueDate || '').substring(0, 10)
      if (!d) continue
      const list = m.get(d) ?? []
      list.push(t)
      m.set(d, list)
    }
    return m
  }, [tasks, userName])

  // ── mutations ──
  const createLog = async (dateStr: string, durationSeconds: number, projId: string, description: string) => {
    if (!projId) return
    setSaving(true)
    try {
      const res = await fetch('/api/timelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userName, date: dateStr, durationSeconds, projetId: projId, description: description || null }),
      })
      if (res.ok) {
        const created = (await res.json()) as TimeLog
        mutate((prev) => ({ linked: true, entries: [...(prev?.entries ?? []), created] }))
      }
    } finally { setSaving(false) }
  }

  const patchLog = async (id: string, body: Partial<{ date: string; durationSeconds: number; projetId: string }>) => {
    mutate((prev) => prev ? { ...prev, entries: prev.entries.map((e) => e.id === id ? { ...e, ...body } as TimeLog : e) } : prev)
    try {
      await fetch(`/api/timelog/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userName, ...body }),
      })
      revalidate()
    } catch { revalidate() }
  }

  const deleteLog = async (id: string) => {
    mutate((prev) => prev ? { ...prev, entries: prev.entries.filter((e) => e.id !== id) } : prev)
    try { await fetch(`/api/timelog/${id}`, { method: 'DELETE' }) } catch { revalidate() }
  }

  const duplicateLog = async (log: TimeLog) => {
    setSaving(true)
    try {
      const res = await fetch('/api/timelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userName, date: log.date, durationSeconds: log.durationSeconds, projetId: log.projetId, description: log.description || null }),
      })
      if (res.ok) {
        const created = (await res.json()) as TimeLog
        mutate((prev) => ({ linked: true, entries: [...(prev?.entries ?? []), created] }))
      }
    } finally { setSaving(false) }
  }

  // ── resize (drag bottom handle to change duration) ──
  const resizeRef = useRef<{ id: string; startY: number; startSec: number } | null>(null)
  const [resizePreview, setResizePreview] = useState<{ id: string; sec: number } | null>(null)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizeRef.current
      if (!r) return
      const dy = e.clientY - r.startY
      const sec = snapToPreset(Math.max(300, r.startSec + dy * (3600 / HOUR_PX)))
      setResizePreview({ id: r.id, sec })
    }
    const onUp = () => {
      const r = resizeRef.current
      const preview = resizePreview
      if (r && preview && preview.id === r.id) patchLog(r.id, { durationSeconds: preview.sec })
      resizeRef.current = null
      setResizePreview(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizePreview])

  const navigate = (dir: -1 | 1) => {
    if (view === 'jour') setAnchor((a) => addDays(a, dir))
    else if (view === 'semaine') setAnchor((a) => addDays(a, dir * 7))
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1))
  }
  const goToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); setAnchor(d); setAddDate(ymd(d)) }

  const rangeLabel = useMemo(() => {
    if (view === 'jour') return parseLocal(ymd(anchor)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    if (view === 'semaine') { const mon = startOfWeekMonday(anchor); return `Semaine du ${mon.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` }
    return anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  }, [view, anchor])

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Clock className="w-6 h-6 text-indigo-600" /> Clocking</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {(['jour', 'semaine', 'mois'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition ${view === v ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={goToday} className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-600">Aujourd&apos;hui</button>
          <button onClick={() => navigate(1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {!linked ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-amber-800">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
          <p className="font-medium">Ton compte n&apos;est pas relié à la table Time log.</p>
          <p className="text-sm mt-1">Contacte un admin pour lier « {userName} » à un membre de l&apos;équipe.</p>
        </div>
      ) : (
        <>
          {/* Quick add bar */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-5 sticky top-0 z-10">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-gray-400 text-xs shrink-0">
                <CalendarDays className="w-4 h-4" />
                <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="w-56">
                <ComboSelect options={projetOptions} value={projetId} onChange={setProjetId} placeholder="Projet…" clearable size="sm" />
              </div>
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Note (optionnel)"
                className="flex-1 min-w-[140px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className="text-[11px] text-gray-400 mr-1">Durée&nbsp;:</span>
              {DURATION_PRESETS.map((p) => (
                <button key={p.label} disabled={!projetId || saving}
                  onClick={() => createLog(addDate, p.seconds, projetId, desc)}
                  title={projetId ? `Ajouter ${p.label}` : 'Choisis d\'abord un projet'}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${projetId && !saving ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>
                  +{p.label}
                </button>
              ))}
              {saving && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
            </div>
            {!projetId && <p className="text-[11px] text-gray-400 mt-1.5">Choisis un projet puis clique une durée pour clocker en un clic.</p>}
          </div>

          {loading && !data ? (
            <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          ) : view === 'semaine' ? (
            <WeekView from={from} byDate={byDate} totalFor={totalFor} tasksByDate={tasksByDate}
              onDayClick={(d) => setAddModal(d)}
              onLogTask={(t, sec) => createLog((t.dueDate || ymd(anchor)).substring(0, 10), sec, t.projetId || '', t.name)}
              onDropToDay={(id, dateStr) => patchLog(id, { date: dateStr })}
              onContext={(e, log) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, log }) }}
              startResize={(id, e, sec) => { resizeRef.current = { id, startY: e.clientY, startSec: sec }; setResizePreview({ id, sec }) }}
              resizePreview={resizePreview}
            />
          ) : view === 'mois' ? (
            <MonthView anchor={anchor} byDate={byDate} totalFor={totalFor}
              onDayClick={(d) => setAddModal(d)}
              onDropToDay={(id, dateStr) => patchLog(id, { date: dateStr })}
            />
          ) : (
            <DayView dateStr={ymd(anchor)} logs={byDate.get(ymd(anchor)) ?? []} total={totalFor(ymd(anchor))}
              dayTasks={tasksByDate.get(ymd(anchor)) ?? []} myProjects={myProjects}
              onAddClick={() => setAddModal(ymd(anchor))}
              onLog={(projId, sec, note) => createLog(ymd(anchor), sec, projId, note)}
              onContext={(e, log) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, log }) }}
              startResize={(id, e, sec) => { resizeRef.current = { id, startY: e.clientY, startSec: sec }; setResizePreview({ id, sec }) }}
              resizePreview={resizePreview}
            />
          )}
        </>
      )}

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}
          items={[
            { label: 'Dupliquer', icon: <Copy className="w-4 h-4" />, onClick: () => duplicateLog(contextMenu.log) },
            { separator: true },
            { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => deleteLog(contextMenu.log.id) },
          ]} />
      )}

      {addModal && (
        <AddLogModal
          date={addModal}
          projetOptions={projetOptions}
          saving={saving}
          onClose={() => setAddModal(null)}
          onCreate={(projId, seconds, note) => { createLog(addModal, seconds, projId, note); setAddModal(null) }}
        />
      )}
    </div>
  )
}

/* ─── Click-to-add popup ─── */
function AddLogModal({ date, projetOptions, saving, onClose, onCreate }: {
  date: string
  projetOptions: { value: string; label: string; sub?: string }[]
  saving: boolean
  onClose: () => void
  onCreate: (projId: string, seconds: number, note: string) => void
}) {
  const [projId, setProjId] = useState('')
  const [note, setNote] = useState('')
  const [h, setH] = useState('')
  const [m, setM] = useState('')
  const customSec = (parseInt(h || '0', 10) * 3600) + (parseInt(m || '0', 10) * 60)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 capitalize">
            Clocker — {parseLocal(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><Plus className="w-5 h-5 rotate-45" /></button>
        </div>

        <label className="block text-xs font-medium text-gray-600 mb-1">Projet</label>
        <ComboSelect options={projetOptions} value={projId} onChange={setProjId} placeholder="Code ou nom du projet…" clearable />

        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optionnel)"
          className="w-full mt-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />

        <p className="text-xs font-medium text-gray-500 mt-4 mb-2">Durée — clique une bulle pour enregistrer</p>
        <div className="grid grid-cols-3 gap-2">
          {DURATION_PRESETS.map((p) => (
            <button key={p.label} disabled={!projId || saving}
              onClick={() => onCreate(projId, p.seconds, note)}
              className={`py-2.5 rounded-xl text-sm font-semibold transition ${projId && !saving ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {/* Durée personnalisée */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-2">Ou durée personnalisée</p>
          <div className="flex items-center gap-2">
            <input type="number" min="0" value={h} onChange={(e) => setH(e.target.value)} placeholder="0"
              className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-sm text-gray-400">h</span>
            <input type="number" min="0" max="59" value={m} onChange={(e) => setM(e.target.value)} placeholder="0"
              className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-sm text-gray-400">min</span>
            <button disabled={!projId || saving || customSec <= 0}
              onClick={() => onCreate(projId, customSec, note)}
              className={`ml-auto px-4 py-1.5 rounded-lg text-sm font-semibold transition ${projId && !saving && customSec > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>
              Ajouter
            </button>
          </div>
        </div>

        {!projId && <p className="text-[11px] text-gray-400 mt-3">Saisis d&apos;abord le projet, puis clique une bulle de temps.</p>}
      </div>
    </div>
  )
}

/* ─── Pill ─── */
function LogPill({ log, height, onContext, onResizeStart, previewSec }: {
  log: TimeLog
  height?: number
  onContext?: (e: React.MouseEvent, log: TimeLog) => void
  onResizeStart?: (id: string, e: React.MouseEvent, sec: number) => void
  previewSec?: number
}) {
  const seconds = previewSec ?? log.durationSeconds
  return (
    <div
      draggable={!!onResizeStart}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', log.id)}
      onContextMenu={(e) => onContext?.(e, log)}
      style={height ? { height } : undefined}
      className="group relative rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] overflow-hidden cursor-grab active:cursor-grabbing"
      title={`${log.projetName || ''} · ${fmtDur(seconds)}${log.description ? ' — ' + log.description : ''}`}
    >
      <div className="flex items-center gap-1 font-medium text-indigo-800">
        {log.projetRef && <span className="font-mono text-[10px] shrink-0">{log.projetRef}</span>}
        <span className="ml-auto shrink-0 tabular-nums">{fmtDur(seconds)}</span>
      </div>
      <div className="truncate text-indigo-600/80">{log.clientName || log.projetName || '—'}</div>
      {log.description && <div className="truncate text-gray-400">{log.description}</div>}
      {onResizeStart && (
        <div
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(log.id, e, log.durationSeconds) }}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-indigo-300/60"
          title="Étirer pour changer la durée"
        />
      )}
    </div>
  )
}

/* ─── One-click duration chips (log from a task/project) ─── */
function QuickChips({ onLog, size = 'sm' }: { onLog: (seconds: number) => void; size?: 'sm' | 'xs' }) {
  const cls = size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[11px]'
  return (
    <div className="flex flex-wrap gap-1 shrink-0">
      {INLINE_DURATIONS.map((d) => (
        <button key={d.label} onClick={(e) => { e.stopPropagation(); onLog(d.seconds) }}
          className={`${cls} rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition font-medium`}>
          {d.label}
        </button>
      ))}
    </div>
  )
}

function DayTotal({ seconds }: { seconds: number }) {
  const color = seconds === 0 ? 'text-red-500' : seconds < DAY_TARGET_SECONDS ? 'text-amber-600' : 'text-green-600'
  return <span className={`text-[11px] font-semibold tabular-nums ${color}`}>{seconds === 0 ? 'Non clocké' : fmtDur(seconds)}</span>
}

/* ─── Week view ─── */
function WeekView({ from, byDate, totalFor, tasksByDate, onDayClick, onLogTask, onDropToDay, onContext, startResize, resizePreview }: {
  from: string
  byDate: Map<string, TimeLog[]>
  totalFor: (d: string) => number
  tasksByDate: Map<string, Task[]>
  onDayClick: (d: string) => void
  onLogTask: (task: Task, seconds: number) => void
  onDropToDay: (id: string, dateStr: string) => void
  onContext: (e: React.MouseEvent, log: TimeLog) => void
  startResize: (id: string, e: React.MouseEvent, sec: number) => void
  resizePreview: { id: string; sec: number } | null
}) {
  const mon = startOfWeekMonday(parseLocal(from))
  const days = Array.from({ length: 5 }, (_, i) => addDays(mon, i))
  const [dragOver, setDragOver] = useState<string | null>(null)
  return (
    <div className="grid grid-cols-5 gap-3">
      {days.map((d, i) => {
        const ds = ymd(d)
        const logs = byDate.get(ds) ?? []
        const total = totalFor(ds)
        const empty = total === 0
        const gap = Math.max(0, DAY_TARGET_SECONDS - total)
        const gapHeight = Math.max(44, Math.round((gap / 3600) * HOUR_PX))
        return (
          <div key={ds}
            onClick={() => onDayClick(ds)}
            onDragOver={(e) => { e.preventDefault(); setDragOver(ds) }}
            onDragLeave={() => setDragOver((c) => c === ds ? null : c)}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onDropToDay(id, ds); setDragOver(null) }}
            title="Cliquer pour clocker sur ce jour"
            className={`rounded-xl border p-2 min-h-[320px] transition cursor-pointer ${dragOver === ds ? 'border-indigo-400 bg-indigo-50/50' : empty ? 'border-red-100 bg-red-50/40 hover:bg-red-50/70' : 'border-gray-100 bg-white hover:bg-gray-50/40'} ${isToday(d) ? 'ring-1 ring-indigo-300' : ''}`}>
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className={`text-xs font-semibold ${isToday(d) ? 'text-indigo-600' : 'text-gray-600'}`}>{WEEKDAY_LABELS[i]} {d.getDate()}</span>
              <DayTotal seconds={total} />
            </div>
            <div className="space-y-1.5">
              {logs.map((log) => {
                const preview = resizePreview?.id === log.id ? resizePreview.sec : undefined
                const sec = preview ?? log.durationSeconds
                const h = Math.max(30, Math.round((sec / 3600) * HOUR_PX))
                return (
                  <div key={log.id} onClick={(e) => e.stopPropagation()}>
                    <LogPill log={log} height={h} onContext={onContext} onResizeStart={startResize} previewSec={preview} />
                  </div>
                )
              })}
              {gap > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDayClick(ds) }}
                  style={{ height: gapHeight }}
                  className="w-full rounded-md border-2 border-dashed border-red-200 bg-red-50/60 hover:bg-red-50 text-red-400 hover:text-red-500 text-[10px] font-medium flex flex-col items-center justify-center gap-0.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {empty ? 'Clique pour clocker' : `Il manque ${fmtDur(gap)}`}
                </button>
              )}
            </div>

            {/* Tasks du jour — clique une durée pour loguer */}
            {(tasksByDate.get(ds) ?? []).length > 0 && (
              <div className="mt-3 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <ListTodo className="w-3 h-3" /> Tasks du jour
                </p>
                <div className="space-y-1.5">
                  {(tasksByDate.get(ds) ?? []).map((t) => (
                    <div key={t.id} className="rounded-md bg-gray-50 px-1.5 py-1">
                      <div className="flex items-center gap-1">
                        {t.projetRef && <span className="font-mono text-[9px] font-bold text-gray-800 shrink-0">{t.projetRef}</span>}
                        {t.clientName && <span className="text-[9px] text-gray-400 truncate">· {t.clientName}</span>}
                      </div>
                      <p className="text-[10px] text-gray-600 truncate mb-1" title={t.name}>{t.name}</p>
                      <QuickChips size="xs" onLog={(sec) => onLogTask(t, sec)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── Month view ─── */
function MonthView({ anchor, byDate, totalFor, onDayClick, onDropToDay }: {
  anchor: Date
  byDate: Map<string, TimeLog[]>
  totalFor: (d: string) => number
  onDayClick: (d: string) => void
  onDropToDay: (id: string, dateStr: string) => void
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const gridStart = startOfWeekMonday(first)
  const weeks: Date[][] = []
  let cur = gridStart
  for (let w = 0; w < 6; w++) {
    const row = Array.from({ length: 5 }, (_, i) => addDays(cur, i))
    weeks.push(row)
    cur = addDays(cur, 7)
    if (cur.getMonth() !== anchor.getMonth() && cur > new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)) break
  }
  const [dragOver, setDragOver] = useState<string | null>(null)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="grid grid-cols-5 border-b border-gray-100 bg-gray-50/50">
        {WEEKDAY_LABELS.map((w) => <div key={w} className="px-2 py-1.5 text-[11px] font-medium text-gray-400 text-center">{w}</div>)}
      </div>
      <div className="grid grid-cols-5">
        {weeks.flat().map((d) => {
          const ds = ymd(d)
          const inMonth = d.getMonth() === anchor.getMonth()
          const total = totalFor(ds)
          const logs = byDate.get(ds) ?? []
          const missing = inMonth && !isWeekend(d) && total === 0
          return (
            <div key={ds}
              onClick={() => onDayClick(ds)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(ds) }}
              onDragLeave={() => setDragOver((c) => c === ds ? null : c)}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onDropToDay(id, ds); setDragOver(null) }}
              title="Cliquer pour clocker sur ce jour"
              className={`min-h-[92px] border-b border-r border-gray-50 p-1.5 cursor-pointer transition ${!inMonth ? 'bg-gray-50/40' : dragOver === ds ? 'bg-indigo-50' : missing ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-gray-50/50'} ${isToday(d) ? 'ring-1 ring-inset ring-indigo-300' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] ${inMonth ? 'text-gray-600' : 'text-gray-300'} ${isToday(d) ? 'font-bold text-indigo-600' : ''}`}>{d.getDate()}</span>
                {inMonth && !isWeekend(d) && <DayTotal seconds={total} />}
              </div>
              <div className="space-y-0.5">
                {logs.slice(0, 3).map((log) => (
                  <div key={log.id} draggable onClick={(e) => e.stopPropagation()} onDragStart={(e) => e.dataTransfer.setData('text/plain', log.id)}
                    className="truncate rounded bg-indigo-50 text-indigo-700 text-[9px] px-1 py-0.5 border border-indigo-100 cursor-grab">
                    {log.projetRef || log.projetName} · {fmtDur(log.durationSeconds)}
                  </div>
                ))}
                {logs.length > 3 && <div className="text-[9px] text-gray-400 px-1">+{logs.length - 3} autres</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Day view ─── */
function DayView({ dateStr, logs, total, dayTasks, myProjects, onAddClick, onLog, onContext, startResize, resizePreview }: {
  dateStr: string
  logs: TimeLog[]
  total: number
  dayTasks: Task[]
  myProjects: Projet[]
  onAddClick: () => void
  onLog: (projId: string, seconds: number, note: string) => void
  onContext: (e: React.MouseEvent, log: TimeLog) => void
  startResize: (id: string, e: React.MouseEvent, sec: number) => void
  resizePreview: { id: string; sec: number } | null
}) {
  const gap = Math.max(0, DAY_TARGET_SECONDS - total)
  const gapHeight = Math.max(56, Math.round((gap / 3600) * HOUR_PX))
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-gray-700 capitalize">{parseLocal(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">objectif 7h</span>
          <DayTotal seconds={total} />
        </div>
      </div>

      <div className="flex gap-6 flex-wrap">
        {/* Timeline column — logged blocks + pale-red missing space */}
        <div className="w-44 shrink-0 space-y-1.5">
          {logs.map((log) => {
            const preview = resizePreview?.id === log.id ? resizePreview.sec : undefined
            const sec = preview ?? log.durationSeconds
            const h = Math.max(30, Math.round((sec / 3600) * HOUR_PX))
            return <LogPill key={log.id} log={log} height={h} onContext={onContext} onResizeStart={startResize} previewSec={preview} />
          })}
          {gap > 0 ? (
            <button onClick={onAddClick} style={{ height: gapHeight }}
              className="w-full rounded-md border-2 border-dashed border-red-200 bg-red-50/60 hover:bg-red-50 text-red-400 hover:text-red-500 text-[11px] font-medium flex flex-col items-center justify-center gap-1 transition">
              <Plus className="w-4 h-4" />
              Il manque {fmtDur(gap)}
              <span className="text-[10px]">clique pour clocker</span>
            </button>
          ) : (
            <div className="w-full rounded-md bg-green-50 text-green-600 text-[11px] font-medium text-center py-2">Objectif atteint ✓</div>
          )}
        </div>

        {/* Detail list */}
        <div className="flex-1 min-w-[200px]">
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Aucun temps clocké ce jour — clique dans la zone rouge pour ajouter.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} onContextMenu={(e) => onContext(e, log)}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 hover:border-indigo-200 px-3 py-2">
                  {log.projetRef && <span className="font-mono text-[11px] text-gray-500 shrink-0">{log.projetRef}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{log.projetName || '—'}{log.clientName ? ` · ${log.clientName}` : ''}</p>
                    {log.description && <p className="text-xs text-gray-400 truncate">{log.description}</p>}
                  </div>
                  <span className="text-sm font-semibold text-indigo-700 tabular-nums shrink-0">{fmtDur(log.durationSeconds)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Helper: tasks of the day + my projects, one-click log */}
        <div className="w-72 shrink-0 space-y-4">
          {dayTasks.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ListTodo className="w-3.5 h-3.5" /> Tasks du jour
              </p>
              <div className="space-y-1.5">
                {dayTasks.map((t) => (
                  <div key={t.id} className="rounded-lg border border-gray-100 px-2.5 py-2">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {t.projetRef && <span className="font-mono text-[10px] font-bold text-gray-800 shrink-0">{t.projetRef}</span>}
                      {t.clientName && <span className="text-[10px] text-gray-400 truncate">· {t.clientName}</span>}
                    </div>
                    <p className="text-xs text-gray-700 truncate mb-1.5" title={t.name}>{t.name}</p>
                    <QuickChips onLog={(sec) => onLog(t.projetId || '', sec, t.name)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FolderKanban className="w-3.5 h-3.5" /> Mes projets
            </p>
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {myProjects.map((p) => (
                <div key={p.id} className="rounded-lg border border-gray-100 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {p.ref && <span className="font-mono text-[10px] text-gray-400 shrink-0">{p.ref}</span>}
                    <span className="text-xs text-gray-700 truncate" title={p.nom}>{p.nom}</span>
                  </div>
                  <QuickChips onLog={(sec) => onLog(p.id, sec, '')} />
                </div>
              ))}
              {myProjects.length === 0 && <p className="text-[11px] text-gray-300">Aucun projet.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
