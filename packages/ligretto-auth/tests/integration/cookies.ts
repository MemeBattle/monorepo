/**
 * How both cookie jars of this suite read a `Set-Cookie`: the application's (`./app.ts`) and the user's toward CAS
 * (`./cas-user.ts`).
 *
 * "This answer took the cookie back" is one rule, and both jars must agree on it: a logout the application-side jar
 * read as a removal and the CAS-side jar did not would make the two browsers disagree about what they still hold,
 * which is the very thing the logout scenario asserts.
 */

/** A cookie's name and value from one `Set-Cookie`, with whether the answer was taking it back. */
export interface SetCookie {
  name: string
  value: string
  removed: boolean
}

/**
 * One `Set-Cookie` header, or `undefined` for a value with no `name=value` pair in front.
 *
 * Only the attributes a jar has to act on are read: an empty value or a non-positive `Max-Age` is a removal, and the
 * rest — `Path`, `HttpOnly`, `SameSite`, `Expires` — is what a real browser scopes a cookie by and what this suite,
 * which keeps one jar per browser against one origin, has nothing to decide with.
 */
export const parseSetCookie = (header: string): SetCookie | undefined => {
  const [pair, ...attributes] = header.split(';')
  const separator = pair?.indexOf('=') ?? -1
  if (pair === undefined || separator === -1) {
    return undefined
  }
  const maxAge = attributes.map(attribute => attribute.trim().match(/^Max-Age=(-?\d+)$/i)?.[1]).find(value => value !== undefined)
  const value = pair.slice(separator + 1).trim()
  return { name: pair.slice(0, separator).trim(), value, removed: value === '' || (maxAge !== undefined && Number(maxAge) <= 0) }
}
