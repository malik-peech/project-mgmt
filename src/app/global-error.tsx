'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9fafb' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>
              Erreur critique
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
              {error.message || 'Erreur inconnue'}
            </p>
            <pre style={{
              textAlign: 'left',
              fontSize: '0.75rem',
              background: '#f3f4f6',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              marginBottom: '1rem',
              overflow: 'auto',
              maxHeight: '10rem',
              color: '#dc2626',
            }}>
              {error.stack || String(error)}
            </pre>
            <button
              onClick={reset}
              style={{
                padding: '0.5rem 1rem',
                background: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Réessayer
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
