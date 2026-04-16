import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'

// Pages blocked for Sales-only users (primary role = 'Sales' and not Admin).
// Sales users only have access to /cogs, /onboarding, /changelog.
const SALES_BLOCKED_PREFIXES = ['/tasks', '/ressources', '/admin', '/offboarding']

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public routes
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/brief') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/brief') ||
    pathname.startsWith('/api/tmp') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Sales-only users: redirect restricted pages and the home Projets page to /onboarding
  const role = (token as { role?: string }).role
  if (role === 'Sales') {
    const isBlocked = pathname === '/' || SALES_BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
    if (isBlocked) {
      return NextResponse.redirect(new URL('/onboarding', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
