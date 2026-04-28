// Vimeo URL helpers — extract video ID, build thumbnail / embed URLs.

export function vimeoId(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  return m ? m[1] : null
}

// vumbnail.com is a free thumbnail proxy for Vimeo (no API key, instant).
export function vimeoThumb(url?: string | null, size: 'small' | 'large' = 'large'): string | null {
  const id = vimeoId(url)
  if (!id) return null
  return size === 'large'
    ? `https://vumbnail.com/${id}_large.jpg`
    : `https://vumbnail.com/${id}.jpg`
}

// Full embed with controls — for the detail panel. Autoplay is muted so the
// browser allows it; the user can unmute via player controls.
export function vimeoEmbedFull(url?: string | null): string | null {
  const id = vimeoId(url)
  return id
    ? `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0&autoplay=1&muted=1`
    : null
}
