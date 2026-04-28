// Vimeo URL helpers — extract video ID, build thumbnail / embed URLs.
//
// Vimeo URL forms we need to handle:
//   - https://vimeo.com/123456789                              (public)
//   - https://vimeo.com/123456789/abc123def4                   (unlisted, hash required)
//   - https://vimeo.com/123456789/abc123def4?share=copy
//   - https://vimeo.com/video/123456789                        (embed-style)
//   - https://vimeo.com/manage/videos/123456789                (back-office)
//   - https://vimeo.com/manage/videos/123456789/abc123def4
//   - https://player.vimeo.com/video/123456789?h=abc123def4

const PATH_PREFIX = '(?:video\\/|manage\\/videos\\/)?'

export function vimeoId(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(new RegExp(`vimeo\\.com\\/${PATH_PREFIX}(\\d+)`))
  return m ? m[1] : null
}

/**
 * Extract the privacy hash from an unlisted Vimeo URL.
 * Returns the hash for `vimeo.com/{ID}/{HASH}` (or `vimeo.com/manage/videos/{ID}/{HASH}`),
 * or the `?h={HASH}` query param if present. Returns null for public videos.
 */
export function vimeoHash(url?: string | null): string | null {
  if (!url) return null
  const path = url.match(
    new RegExp(`vimeo\\.com\\/${PATH_PREFIX}\\d+\\/([A-Za-z0-9]+)`),
  )
  if (path) return path[1]
  try {
    const u = new URL(url)
    const h = u.searchParams.get('h')
    return h || null
  } catch {
    return null
  }
}

/**
 * Normalize any Vimeo URL form to the canonical share URL `vimeo.com/{ID}` or
 * `vimeo.com/{ID}/{HASH}` for unlisted videos. Used for oEmbed lookups (the
 * `manage/videos/...` back-office form is rejected by oEmbed).
 */
export function vimeoShareUrl(url?: string | null): string | null {
  const id = vimeoId(url)
  if (!id) return null
  const hash = vimeoHash(url)
  return hash ? `https://vimeo.com/${id}/${hash}` : `https://vimeo.com/${id}`
}

/**
 * Heuristic: an unlisted Vimeo video is one whose URL either carries a privacy
 * hash, or is the back-office form (`manage/videos/...`) — that form is only
 * shown for non-public videos. vumbnail.com returns a placeholder for unlisted
 * videos so we must route through our oEmbed proxy in those cases.
 */
function isLikelyUnlisted(url?: string | null): boolean {
  if (!url) return false
  if (vimeoHash(url)) return true
  return /vimeo\.com\/manage\/videos\//.test(url)
}

/**
 * Build a thumbnail URL.
 *
 * For PUBLIC videos we hit `vumbnail.com` directly — it's instant and doesn't
 * need any roundtrip. For UNLISTED videos vumbnail returns a placeholder, so
 * we route through our own `/api/vimeo/thumbnail` endpoint which resolves the
 * real i.vimeocdn.com URL via oEmbed and caches it in memory for 24h.
 */
export function vimeoThumb(url?: string | null, size: 'small' | 'large' = 'large'): string | null {
  const id = vimeoId(url)
  if (!id) return null
  if (isLikelyUnlisted(url)) {
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
