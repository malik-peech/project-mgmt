import { NextResponse } from 'next/server'

/**
 * GET /api/vimeo/thumbnail?url=<full-vimeo-url-with-hash>
 *
 * Resolves the actual Vimeo thumbnail URL via the public oEmbed endpoint and
 * 302-redirects to it. Necessary for unlisted videos (vimeo.com/{ID}/{HASH})
 * because vumbnail.com only handles public videos and returns a placeholder
 * for unlisted ones.
 *
 * The resolved URL is cached in-memory for 24h to avoid hammering oEmbed.
 */

type CacheEntry = { url: string | null; fetchedAt: number }
const cache = new Map<string, CacheEntry>()
const TTL = 24 * 60 * 60 * 1000 // 24h

async function resolveThumbnail(vimeoUrl: string): Promise<string | null> {
  const cached = cache.get(vimeoUrl)
  if (cached && Date.now() - cached.fetchedAt < TTL) {
    return cached.url
  }

  try {
    const oembed = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(vimeoUrl)}&width=640`
    const res = await fetch(oembed, { cache: 'no-store' })
    if (!res.ok) {
      cache.set(vimeoUrl, { url: null, fetchedAt: Date.now() })
      return null
    }
    const data = (await res.json()) as { thumbnail_url?: string }
    const thumb = data.thumbnail_url || null
    cache.set(vimeoUrl, { url: thumb, fetchedAt: Date.now() })
    return thumb
  } catch {
    cache.set(vimeoUrl, { url: null, fetchedAt: Date.now() })
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const vimeoUrl = searchParams.get('url')
  if (!vimeoUrl || !/^https:\/\/vimeo\.com\//.test(vimeoUrl)) {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 })
  }

  const thumb = await resolveThumbnail(vimeoUrl)
  if (!thumb) {
    // Tiny transparent gif fallback so <img> doesn't render broken icon.
    const gif = Buffer.from(
      'R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64',
    )
    return new Response(new Uint8Array(gif), {
      status: 200,
      headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'public, max-age=300' },
    })
  }

  // Redirect to the actual i.vimeocdn.com URL — the browser will cache it.
  return NextResponse.redirect(thumb, {
    status: 302,
    headers: { 'Cache-Control': 'public, max-age=86400' },
  })
}
