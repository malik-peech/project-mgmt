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

// Background-mode embed: muted autoplay loop, no controls — perfect for hover preview.
export function vimeoEmbedBackground(url?: string | null): string | null {
  const id = vimeoId(url)
  return id
    ? `https://player.vimeo.com/video/${id}?background=1&autoplay=1&muted=1&loop=1&autopause=0`
    : null
}

// Full embed with controls — for the detail panel.
export function vimeoEmbedFull(url?: string | null): string | null {
  const id = vimeoId(url)
  return id ? `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0` : null
}
