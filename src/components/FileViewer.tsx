'use client'

import { useEffect } from 'react'
import { X, Download, ExternalLink } from 'lucide-react'

interface Props {
  url: string
  filename: string
  onClose: () => void
}

function isImage(filename: string, url: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return true
  // Some Airtable URLs include type hints
  if (url.includes('image/')) return true
  return false
}

function isPdf(filename: string): boolean {
  return filename.split('.').pop()?.toLowerCase() === 'pdf'
}

export default function FileViewer({ url, filename, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const image = isImage(filename, url)
  const pdf = isPdf(filename)

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden max-w-4xl w-full mx-4 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <p className="text-sm font-medium text-gray-800 truncate flex-1 mr-4">{filename}</p>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={url}
              download={filename}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              <Download className="w-3.5 h-3.5" />
              Télécharger
            </a>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ouvrir
            </a>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center min-h-0 p-4">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={filename}
              className="max-w-full max-h-full object-contain rounded-lg shadow"
            />
          ) : pdf ? (
            <iframe
              src={url}
              title={filename}
              className="w-full h-full min-h-[60vh] rounded-lg border-0"
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">Aperçu non disponible pour ce type de fichier.</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
              >
                <ExternalLink className="w-4 h-4" />
                Ouvrir le fichier
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
