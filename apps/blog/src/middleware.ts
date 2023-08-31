import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import Negotiator from 'negotiator'
import { fallbackLanguage, languages } from '@/i18n'

export const config = {
  // matcher: '/:lng*'
  matcher: ['/((?!api|_next/static|_next/image|assets|amplitude|.*\\..*).*)'],
}

const cookieName = 'i18next'

/**
 * i18n middleware
 *
 * @param req
 */
export function middleware(req: NextRequest) {
  /**
   * cookies[cookieName] is first source of true
   */
  let language = req.cookies.get(cookieName)?.value

  /**
   * If user doesn't have cookies[cookieName] choose a preferred language by Accept-Language header or fallback language
   */
  if (!language) {
    const negotiator = new Negotiator({ headers: { 'Accept-Language': req.headers.get('Accept-Language') ?? undefined } })
    language = negotiator.language([...languages]) || fallbackLanguage
  }

  /**
   * Redirect if language in path is not supported
   */
  if (!languages.some(loc => req.nextUrl.pathname.startsWith(`/${loc}`)) && !req.nextUrl.pathname.startsWith('/_next')) {
    return NextResponse.redirect(new URL(`/${language}${req.nextUrl.pathname}`, req.url))
  }

  /**
   * Set language to cookie
   */
  if (req.headers.has('referer')) {
    const refererUrl = new URL(req.headers.get('referer') as string)
    const lngInReferer = languages.find(language => refererUrl.pathname.startsWith(`/${language}`))
    const response = NextResponse.next()
    if (lngInReferer) {
      response.cookies.set(cookieName, lngInReferer)
    }
    return response
  }

  return NextResponse.next()
}
