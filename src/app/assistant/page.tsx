'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Sparkles, Send, Loader2 } from 'lucide-react'

type Message = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Refs 3D pharma',
  'Motion design banque',
  'Interviews récentes tourisme',
  'Qu\'est-ce qu\'on a fait pour BPCE ?',
  'Refs tournage marque employeur',
]

/**
 * Render an assistant message as markdown-ish text. We don't pull a full
 * markdown lib — just: linkify URLs, handle **bold**, and preserve newlines.
 */
function renderContent(text: string): React.ReactNode {
  const lines = text.split('\n')
  return lines.map((line, i) => (
    <div key={i} className={line === '' ? 'h-2' : ''}>
      {renderInline(line)}
    </div>
  ))
}

function renderInline(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Tokenize: **bold**, [text](url), bare URL
  const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s)]+)/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = regex.exec(line)) !== null) {
    if (m.index > lastIdx) parts.push(line.slice(lastIdx, m.index))
    if (m[1] != null) {
      parts.push(
        <strong key={key++} className="font-semibold text-gray-900">
          {m[1]}
        </strong>,
      )
    } else if (m[2] != null && m[3] != null) {
      parts.push(
        <a
          key={key++}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:text-indigo-800 underline break-all"
        >
          {m[2]}
        </a>,
      )
    } else if (m[4] != null) {
      parts.push(
        <a
          key={key++}
          href={m[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:text-indigo-800 underline break-all"
        >
          {m[4]}
        </a>,
      )
    }
    lastIdx = regex.lastIndex
  }
  if (lastIdx < line.length) parts.push(line.slice(lastIdx))
  return parts
}

export default function AssistantPage() {
  const { data: session, status } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setError('')
    const next: Message[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setMessages([...next, { role: 'assistant', content: data.content || '' }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSending(false)
      // Refocus input for rapid follow-ups
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
      </div>
    )
  }

  const userName = session?.user?.name || 'toi'
  const userInitial = userName.charAt(0).toUpperCase()

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Assistant Sales</h1>
            <p className="text-xs text-gray-500">
              Trouve la bonne référence vidéo parmi 3 400+ livrables en langage naturel
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="mt-8">
              <div className="text-center mb-8">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 mx-auto flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  Salut {userName.split(' ')[0]}, quelle référence cherches-tu ?
                </h2>
                <p className="text-sm text-gray-500">
                  Décris ton besoin en langage naturel (secteur, style, format, client…)
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold ${
                  m.role === 'user'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                }`}
              >
                {m.role === 'user' ? userInitial : <Sparkles className="w-4 h-4" />}
              </div>
              <div
                className={`max-w-[calc(100%-3rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {m.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                ) : (
                  <div>{renderContent(m.content)}</div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                <span className="text-sm text-gray-500">Recherche dans la Belle Base…</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-indigo-400 focus-within:bg-white transition">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ex: refs 3D pharma avec voix off"
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none text-sm py-1.5 max-h-32"
              disabled={sending}
            />
            <button
              onClick={() => send(input)}
              disabled={sending || !input.trim()}
              className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              aria-label="Envoyer"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 text-center">
            Haiku 4.5 · Entrée pour envoyer · Shift+Entrée pour saut de ligne
          </p>
        </div>
      </div>
    </div>
  )
}
