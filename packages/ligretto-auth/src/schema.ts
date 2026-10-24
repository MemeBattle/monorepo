/**
 * The HTTP contract of the handlers in `./handlers`, as zod schemas: what each of the four routes takes and answers.
 * It is the package's third entry, `@memebattle/ligretto-auth/schema`, and the single source of truth for that
 * contract — `./contract` derives its types from it, and a host documents the routes it mounts from it
 * (`apps/ligretto-core/docs/adrs/api-contract-openapi-and-client-package.md`).
 *
 * Schemas and types exist in both directions, run-time validation is for input only: the callback parses its query
 * with `CallbackQuerySchema`, and every body a handler answers is built as a value of a type derived here and never
 * parsed in production. The tests parse the answers; production does not.
 */

import { z } from 'zod'
import type { AccountType } from './generated/models/AccountType'

/**
 * Which way the session id travels, chosen per deployment; `./transport` re-exports it. It is declared here rather
 * than there so that this module, and `./contract` with it, imports nothing but zod and the generated models: a
 * browser that types its calls against `./contract` must not type-check the server code `./transport` leads to.
 */
export type SessionTransportKind = 'cookie' | 'bearer'

/** The account types, in the order the description lists them. */
export const ACCOUNT_TYPES = ['guest', 'full'] as const satisfies readonly AccountType[]

/**
 * Fails `ts-check` when the generated `AccountType` gains a value this list does not have: the `satisfies` above
 * catches the other direction, so the two cannot drift apart.
 */
type AccountTypesCover = [AccountType] extends [(typeof ACCOUNT_TYPES)[number]] ? true : never
const accountTypesCover: AccountTypesCover = true
void accountTypesCover

export const AccountTypeSchema = z.enum(ACCOUNT_TYPES).meta({ description: 'Whether an account has credentials of its own.' })

export const AuthUserSchema = z
  .object({
    sub: z.string().meta({ description: 'The account id, stable across a guest upgrade. Application data is keyed on it (§8).' }),
    accountType: AccountTypeSchema,
    name: z.string().nullable().meta({ description: 'The display name, `null` for a guest and for a full account that has none.' }),
    avatarUrl: z.string().nullable().meta({ description: 'The avatar URL, `null` when CAS releases none.' }),
  })
  .meta({ description: 'The account as a page may show it: the snapshot the latest validated ID token gave, nothing of the grant.' })

export const MeResponseSchema = z
  .object({
    user: AuthUserSchema,
    accessToken: z.string().meta({ description: "The access token to call this application's own API with." }),
    expiresAt: z
      .number()
      .int()
      .meta({ description: 'When the access token expires, epoch milliseconds: what a refresh timer in the browser is scheduled from.' }),
    signedOut: z.boolean().meta({
      description:
        "`true` when a full account's grant had ended and the guest in this answer replaced it: the user was signed in and is not any " +
        'more, so the UI offers a sign-in rather than silently showing a guest. `false` for every other answer, a guest whose own ' +
        'grant ended included — there was nothing to sign out of.',
    }),
    sessionId: z
      .string()
      .optional()
      .meta({
        description:
          'The session id, in the `bearer` transport only, and only when this answer *created* the session: a guest minted because ' +
          'the request presented no id, or none the store still holds. An answer for a session the caller already presented carries ' +
          'none — the caller is holding that id already, and an answer delivered late (a refresh timer in another tab, arriving after ' +
          'a sign-in completed in this one) must not be able to put a retired id back in use. The cookie transport never puts the id ' +
          'in a body at all.',
      }),
  })
  .meta({ description: 'The answer of `GET me`: who the user is, and the access token to call this application’s own API with.' })

export const NavigationResponseSchema = z
  .object({
    url: z.string().meta({ description: 'The URL the browser is to navigate to.' }),
  })
  .meta({
    description:
      'Where the browser is to navigate, for a route the `bearer` transport cannot answer with a redirect: the session id travels ' +
      'in a header, which a navigation cannot set, so `sign-in` and `logout` are fetched and the navigation is the caller’s. The ' +
      '`cookie` transport answers these routes `302` and never this.',
  })

/**
 * Why a handler refused, in the order they are documented. Stable: a caller branches on it, and 500 is never one of
 * these — it is the unhandled.
 */
export const AUTH_ERROR_CODES = ['unknown_state', 'sign_in_failed', 'rate_limit_exceeded', 'cas_unavailable', 'cas_rejected'] as const

/** The description of each code, which the error code schema of every route carries. */
const AUTH_ERROR_CODE_DESCRIPTIONS: Record<(typeof AUTH_ERROR_CODES)[number], string> = {
  unknown_state: 'The callback carries no `state` this browser started a sign-in with, or one that has expired or been used (400).',
  sign_in_failed: 'The sign-in itself failed: no code came back, the code was spent, or CAS refused the request (400).',
  rate_limit_exceeded: 'CAS is rate-limiting this client; `Retry-After` carries the delay to wait out (429).',
  cas_unavailable: 'CAS, or whatever answered in its place, cannot be used right now. Transient; try again (503).',
  cas_rejected: "CAS refused this client's registration or the shape of its request. Not transient: an operator must act (503).",
}

const codesDescription = (codes: readonly (typeof AUTH_ERROR_CODES)[number][]): string =>
  `Why the handler refused; a caller branches on it. ${codes.map(code => `\`${code}\`: ${AUTH_ERROR_CODE_DESCRIPTIONS[code]}`).join(' ')}`

export const AuthErrorCodeSchema = z.enum(AUTH_ERROR_CODES).meta({ description: codesDescription(AUTH_ERROR_CODES) })

export const AuthErrorResponseSchema = z
  .object({
    error: AuthErrorCodeSchema,
    description: z.string().optional().meta({ description: 'For the developer and the logs; a caller branches on `error`.' }),
    casError: z.string().optional().meta({ description: 'The code CAS itself named, when the refusal came from CAS.' }),
  })
  .meta({ description: "A handler's refusal, as JSON." })

/**
 * The query CAS sends the browser back to the callback with (RFC 6749 §4.1.2 and §4.1.2.1). A plain object, not a
 * strict one: a parameter this package does not read — RFC 9207's `iss`, anything a proxy adds — is stripped, never
 * refused. Only `state` is required, so a failed parse is exactly a callback without one. `code` may be empty: the
 * schema describes what arrives, the handler decides what it means, as it decides that `error` wins over `code`.
 */
export const CallbackQuerySchema = z
  .object({
    state: z.string().meta({ description: 'The `state` of the authorization request; it must equal the one this browser was given.' }),
    code: z.string().optional().meta({ description: 'The authorization code, when CAS granted the request.' }),
    error: z.string().optional().meta({ description: 'The OAuth2 error code, when CAS refused the request (RFC 6749 §4.1.2.1).' }),
    error_description: z.string().optional().meta({ description: 'CAS’s description of the refusal, for the developer.' }),
  })
  .meta({ description: 'What CAS sends the browser back with: a code, or the error it refused the request with.' })

/**
 * One response of a route: a description, and the JSON body when there is one. The shape of a response in
 * zod-to-openapi's `RouteConfig`, which `@hono/zod-openapi`'s `createRoute` takes.
 */
export interface AuthResponseFragment {
  description: string
  content?: { 'application/json': { schema: z.ZodType } }
}

/**
 * The part of a route's OpenAPI description a mount site does not own: everything of zod-to-openapi's `RouteConfig`
 * but `path`, so a host spreads it into `registerPath({ path: '/api/auth/me', ...fragments.me })` or `createRoute`.
 * Plain objects rather than the library's type, because this package depends on no framework; compatibility with
 * `RouteConfig` is compiled where it is registered, in `apps/ligretto-core` (#837).
 */
export interface AuthRouteFragment {
  method: 'get'
  summary: string
  description: string
  request?: { query: z.ZodObject }
  responses: Record<string, AuthResponseFragment>
}

/** The four routes, each as its fragment. */
export interface AuthRouteFragments {
  me: AuthRouteFragment
  signIn: AuthRouteFragment
  callback: AuthRouteFragment
  logout: AuthRouteFragment
}

const jsonResponse = (description: string, schema: z.ZodType): AuthResponseFragment => ({
  description,
  content: { 'application/json': { schema } },
})

/** A refusal whose `error` is narrowed to the codes this status carries on this route, and no other. */
const refusal = (description: string, ...codes: [(typeof AUTH_ERROR_CODES)[number], ...(typeof AUTH_ERROR_CODES)[number][]]): AuthResponseFragment =>
  jsonResponse(description, AuthErrorResponseSchema.extend({ error: z.enum(codes).meta({ description: codesDescription(codes) }) }))

const rateLimited = (cause: string): AuthResponseFragment =>
  refusal(`CAS is rate-limiting this client ${cause}; \`Retry-After\` carries the delay to wait out.`, 'rate_limit_exceeded')

const casUnusable = (cause: string): AuthResponseFragment =>
  refusal(
    `CAS cannot be used right now (\`cas_unavailable\`), or refused this client (\`cas_rejected\`) ${cause}.`,
    'cas_unavailable',
    'cas_rejected',
  )

/**
 * The OpenAPI fragments of the four routes, for the transport they are mounted with: the callback redirects in both,
 * `sign-in` and `logout` redirect in the `cookie` transport and answer the URL to navigate to in the `bearer` one.
 * Every error status lists exactly the codes the route answers with it.
 */
export const authRouteFragments = (transport: SessionTransportKind): AuthRouteFragments => {
  const navigation = (redirectDescription: string): Record<string, AuthResponseFragment> =>
    transport === 'cookie'
      ? { '302': { description: redirectDescription } }
      : { '200': jsonResponse(`${redirectDescription} The bearer transport is fetched, so it answers the URL instead.`, NavigationResponseSchema) }

  return {
    me: {
      method: 'get',
      summary: 'Who the user is',
      description:
        'Who the user is and the access token to call this application’s API with, refreshed when it is about to expire. A browser ' +
        'that presents no session, or one whose grant has ended, is given a new guest.',
      responses: {
        '200': jsonResponse('The user and a usable access token.', MeResponseSchema),
        '429': rateLimited('on the refresh or the guest grant'),
        '503': casUnusable('on the refresh or the guest grant'),
      },
    },
    signIn: {
      method: 'get',
      summary: 'Start a sign-in',
      description:
        'Stores the sign-in in flight, binds its `state` to this browser with a cookie, and sends the browser to CAS. A guest is ' +
        'force-refreshed first, so its fresh ID token can hint the upgrade.',
      responses: {
        ...navigation('To the CAS authorization endpoint; the `state` cookie is set.'),
        '429': rateLimited('on the force-refresh of the presented session'),
        '503': casUnusable('on the force-refresh of the presented session or the metadata read'),
      },
    },
    callback: {
      method: 'get',
      summary: 'Complete a sign-in',
      description:
        'Checks the callback against the sign-in this browser started, redeems the code, installs the new session and sends the ' +
        'browser to the application. A redirect in both transports: the browser arrived here by navigation.',
      request: { query: CallbackQuerySchema },
      responses: {
        '302': {
          description:
            'To the application. The bearer transport hands the new session id over in the URL fragment (`#session_id=`); ' +
            '`?previous_sub=` names the account the browser was signed in as when CAS signed it in as another.',
        },
        '400': refusal(
          'The callback matches no sign-in this browser started (`unknown_state`), or the sign-in failed (`sign_in_failed`).',
          'unknown_state',
          'sign_in_failed',
        ),
        '429': rateLimited('on the code exchange'),
        '503': casUnusable('on the authorization request or the code exchange'),
      },
    },
    logout: {
      method: 'get',
      summary: 'Sign out',
      description: 'Ends this application’s session, then sends the browser to CAS to end its own; with nothing to end, back to the application.',
      responses: {
        ...navigation('To the CAS end-session endpoint, or to the application when there was nothing to end.'),
        '503': refusal('CAS’s metadata could not be read for the end-session URL; the session is kept, so the user can retry.', 'cas_unavailable'),
      },
    },
  }
}
