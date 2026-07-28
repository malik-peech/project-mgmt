'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useData } from '@/hooks/useData'
import ComboSelect from '@/components/ComboSelect'
import ContextMenu from '@/components/ContextMenu'
import {
  Clock, ChevronLeft, ChevronRight, Plus, Copy, Trash2, AlertTriangle, Loader2, CalendarDays,
} from 'lucide-react'
import type { TimeLog, Projet } from '@/types'

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

  const projetOptions = useMemo(() =>
    (projets ?? [])
      .filter((p) => p.statut !== 'Done')
      .map((p) => ({ value: p.id, label: p.nom || p.ref || '—', sub: [p.ref, p.clientName].filter(Boolean).join(' · ') || undefined })),
    [projets]
  )

  // ── mutations ──
  const addLog = async (dateStr: string, durationSeconds: number) => {
    if (!projetId) return
    setSaving(true)
    try {
      const res = await fetch('/api/timelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userName, date: dateStr, durationSeconds, projetId, description: desc || null }),
      })
      if (res.ok) {
        const created = (await res.json()) as TimeLog
        mutate((prev) => ({ linked: true, entries: [...(prev?.entries ?? []), created] }))
        setDesc('')
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
                  onClick={() => addLog(addDate, p.seconds)}
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
            <WeekView from={from} byDate={byDate} totalFor={totalFor}
              onPickDay={setAddDate} addDate={addDate}
              onDropToDay={(id, dateStr) => patchLog(id, { date: dateStr })}
              onContext={(e, log) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, log }) }}
              startResize={(id, e, sec) => { resizeRef.current = { id, startY: e.clientY, startSec: sec }; setResizePreview({ id, sec }) }}
              resizePreview={resizePreview}
            />
          ) : view === 'mois' ? (
            <MonthView anchor={anchor} byDate={byDate} totalFor={totalFor}
              onPickDay={(d) => { setAddDate(d); setAnchor(parseLocal(d)); setView('jour') }}
              onDropToDay={(id, dateStr) => patchLog(id, { date: dateStr })}
            />
          ) : (
            <DayView dateStr={ymd(anchor)} logs={byDate.get(ymd(anchor)) ?? []} total={totalFor(ymd(anchor))}
              onContext={(e, log) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, log }) }} />
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

function DayTotal({ seconds }: { seconds: number }) {
  const color = seconds === 0 ? 'text-red-500' : seconds < DAY_TARGET_SECONDS ? 'text-amber-600' : 'text-green-600'
  return <span className={`text-[11px] font-semibold tabular-nums ${color}`}>{seconds === 0 ? 'Non cloqué' : fmtDur(seconds)}</span>
}

/* ─── Week view ─── */
function WeekView({ from, byDate, totalFor, onPickDay, addDate, onDropToDay, onContext, startResize, resizePreview }: {
  from: string
  byDate: Map<string, TimeLog[]>
  totalFor: (d: string) => number
  onPickDay: (d: string) => void
  addDate: string
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
        const selected = ds === addDate
        return (
          <div key={ds}
            onClick={() => onPickDay(ds)}
            onDragOver={(e) => { e.preventDefault(); setDragOver(ds) }}
            onDragLeave={() => setDragOver((c) => c === ds ? null : c)}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onDropToDay(id, ds); setDragOver(null) }}
            className={`rounded-xl border p-2 min-h-[320px] transition cursor-pointer ${dragOver === ds ? 'border-indigo-400 bg-indigo-50/50' : selected ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-100 bg-white'} ${isToday(d) ? 'ring-1 ring-indigo-300' : ''}`}>
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
              {logs.length === 0 && <p className="text-[11px] text-gray-300 text-center pt-4">—</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Month view ─── */
function MonthView({ anchor, byDate, totalFor, onPickDay, onDropToDay }: {
  anchor: Date
  byDate: Map<string, TimeLog[]>
  totalFor: (d: string) => number
  onPickDay: (d: string) => void
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
          return (
            <div key={ds}
              onClick={() => onPickDay(ds)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(ds) }}
              onDragLeave={() => setDragOver((c) => c === ds ? null : c)}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onDropToDay(id, ds); setDragOver(null) }}
              className={`min-h-[92px] border-b border-r border-gray-50 p-1.5 cursor-pointer transition ${!inMonth ? 'bg-gray-50/40' : dragOver === ds ? 'bg-indigo-50' : 'hover:bg-gray-50/50'} ${isToday(d) ? 'ring-1 ring-inset ring-indigo-300' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] ${inMonth ? 'text-gray-600' : 'text-gray-300'} ${isToday(d) ? 'font-bold text-indigo-600' : ''}`}>{d.getDate()}</span>
                {inMonth && !isWeekend(d) && <DayTotal seconds={total} />}
              </div>
              <div className="space-y-0.5">
                {logs.slice(0, 3).map((log) => (
                  <div key={log.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', log.id)}
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
function DayView({ dateStr, logs, total, onContext }: {
  dateStr: string
  logs: TimeLog[]
  total: number
  onContext: (e: React.MouseEvent, log: TimeLog) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700 capitalize">{parseLocal(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <DayTotal seconds={total} />
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Aucun temps cloqué ce jour.</p>
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
  )
}
