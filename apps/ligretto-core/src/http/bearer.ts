/** RFC 6750: the scheme in any case, one or more spaces, a token without whitespace; no quoting, no parameters. */
const BEARER = /^Bearer\s+(\S+)$/i

/** The token of an `Authorization: Bearer` header, or `undefined` when the header is absent or not one. */
export const bearerTokenOf = (authorization: string | undefined): string | undefined => BEARER.exec(authorization ?? '')?.[1]
