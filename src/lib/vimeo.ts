// Vimeo URL helpers — extract video ID, build thumbnail / embed URLs.
//
// Vimeo URL forms we need to handle:
//   - https://vimeo.com/123456789                    (public video)
//   - https://vimeo.com/123456789/abc123def4         (unlisted/private — hash required)
//   - https://vimeo.com/123456789/abc123def4?share=copy
//   - https://vimeo.com/video/123456789              (embed-style)
//   - https://player.vimeo.com/video/123456789?h=abc123def4

export function vimeoId(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  return m ? m[1] : null
}

/**
 * Extract the privacy hash from an unlisted Vimeo URL.
 * Returns the hash for `vimeo.com/{ID}/{HASH}` form, or `?h={HASH}` query
 * param if the URL is already in player.vimeo.com format. Returns null for
 * fully public videos.
 */
export function vimeoHash(url?: string | null): string | null {
  if (!url) return null
  // /{id}/{hash} form (10-char hash typical, but accept any alphanumeric)
  const path = url.match(/vimeo\.com\/(?:video\/)?\d+\/([A-Za-z0-9]+)/)
  if (path) return path[1]
  // ?h=xxx query param (player URL form)
  try {
    const u = new URL(url)
    const h = u.searchParams.get('h')
    return h || null
  } catch {
    return null
  }
}

/**
 * Build a thumbnail URL.
 *
 * For PUBLIC videos we hit `vumbnail.com` directly — it's instant and doesn't
 * need any roundtrip. For UNLISTED videos (`vimeo.com/{ID}/{HASH}`) vumbnail
 * returns a placeholder, so we route through our own `/api/vimeo/thumbnail`
 * endpoint which resolves the real i.vimeocdn.com URL via oEmbed (works with
 * the privacy hash) and caches it in memory for 24h.
 */
export function vimeoThumb(url?: string | null, size: 'small' | 'large' = 'large'): string | null {
  const id = vimeoId(url)
  if (!id) return null
  if (vimeoHash(url)) {
    return `/api/vimeo/thumbnail?url=${encodeURIComponent(url!)}`
  }
  return size === 'large'
    ? `https://vumbnail.com/${id}_large.jpg`
    : `https://vumbnail.com/${id}.jpg`
}

// Full embed with controls — for the detail panel. Autoplay is muted so the
// browser allows it; the user can unmute via player controls. For unlisted
// videos the privacy hash MUST be forwarded as `?h=…` or the player 403s.
export function vimeoEmbedFull(url?: string | null): string | null {
  const id = vimeoId(url)
  if (!id) return null
  const hash = vimeoHash(url)
  const params = new URLSearchParams({
    title: '0',
    byline: '0',
    portrait: '0',
    autoplay: '1',
    muted: '1',
  })
  if (hash) params.set('h', hash)
  return `https://player.vimeo.com/video/${id}?${params.toString()}`
}
