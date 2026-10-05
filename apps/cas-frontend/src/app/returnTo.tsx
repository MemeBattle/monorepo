import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'

/**
 * `path + query + fragment` of `value` resolved against `origin`, or `null`
 * when it does not parse or lands on another origin.
 */
const pathOn = (value: string, origin: string): string | null => {
  let url: URL
  try {
    url = new URL(value, origin)
  } catch {
    return null
  }
  return url.origin === origin ? url.pathname + url.search + url.hash : null
}

/**
 * The `return_to` of a query string this app may follow, or `null`. CAS sends
 * the browser here with `return_to=/oidc/authorize?…` (apps/cas ADR 0010 (c));
 * anything that could lead off this origin is dropped (docs/adr/0002-return-to.md).
 *
 * Accepted: exactly one non-empty `return_to`, written as a path, that the
 * browser's own URL parser resolves to this origin. The parser normalizes
 * (`/.//host` becomes `//host`, which would leave the origin when navigated
 * to), so the normalized path must not start with `//` and must resolve to
 * itself on this origin. What is returned is that normalized path, never the
 * raw value.
 */
export const readReturnTo = (search: string): string | null => {
  const values = new URLSearchParams(search).getAll('return_to')
  if (values.length !== 1) {
    return null
  }
  const [value] = values
  if (!value?.startsWith('/')) {
    return null
  }
  const { origin } = window.location
  const candidate = pathOn(value, origin)
  if (candidate === null || candidate.startsWith('//')) {
    return null
  }
  return pathOn(candidate, origin) === candidate ? candidate : null
}

/**
 * Leaves the app for an accepted `return_to`. A document navigation, since
 * the target is served by CAS, not by the router; `replace`, so Back from the
 * application does not reopen a finished sign-in. The promise never settles:
 * a form action awaiting it stays pending until the browser has left.
 */
export const leaveTo = (returnTo: string): Promise<never> => {
  window.location.replace(returnTo)
  return new Promise<never>(() => {})
}

interface ReturnToLinkProps {
  /** Another screen of the app. */
  to: string
  children: ReactNode
}

/**
 * A link to another auth screen that keeps the current `return_to`, so a user
 * who switches between sign-in and create-account still finishes the request
 * they came with. While it carries one it replaces the history entry: the
 * whole visit to CAS stays one entry, and Back from the application does not
 * reopen an auth screen that would forward a spent request again.
 */
export const ReturnToLink = ({ to, children }: ReturnToLinkProps) => {
  const returnTo = readReturnTo(useLocation().search)
  if (!returnTo) {
    return <Link to={to}>{children}</Link>
  }
  return (
    <Link to={{ pathname: to, search: `?${new URLSearchParams({ return_to: returnTo }).toString()}` }} replace>
      {children}
    </Link>
  )
}
