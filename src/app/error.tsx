'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Error Boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Une erreur est survenue</h2>
        <p className="text-sm text-gray-500 mb-2">
          {error.message || 'Erreur inconnue'}
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 mb-4 font-mono">Digest: {error.digest}</p>
        )}
        <pre className="text-left text-xs bg-gray-100 rounded-lg p-3 mb-4 overflow-auto max-h-40 text-red-600">
          {error.stack || String(error)}
        </pre>
        <button
          onClick={reset}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}
