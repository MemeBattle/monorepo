import { describe, expect, it } from 'vitest'

import { ConfigError, loadAuthConfig, loadConfig, loadDatabaseConfig, loadHttpConfig, loadInternalApiConfig, loadLoggingConfig } from './config.ts'

const database = { DATABASE_URL: 'postgres://user:password@localhost:5433/ligretto-core' }

const auth = {
  CAS_ISSUER: 'http://localhost:3000',
  LIGRETTO_CAS_CLIENT_ID: 'ligretto',
  LIGRETTO_CAS_CLIENT_SECRET: 'secret',
  LIGRETTO_CORE_AUTH_REDIRECT_URI: 'http://localhost:3333/api/auth/callback',
  LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI: 'http://localhost:5174/',
  LIGRETTO_CORE_AUTH_APP_URL: 'http://localhost:5174/',
  LIGRETTO_CORE_AUTH_SESSION_TRANSPORT: 'cookie',
}

const internalApi = { LIGRETTO_INTERNAL_API_TOKEN: 'token-a' }

const http = { PORT: '4000', LIGRETTO_CORE_CORS_ORIGINS: 'http://localhost:5173,http://localhost:5174' }

const logging = { LOG_LEVEL: 'debug' }

const complete = { ...database, ...auth, ...internalApi, ...http, ...logging }

const without = (source: Record<string, string>, ...keys: string[]) =>
  Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)))

const issuesOf = (load: () => unknown) => {
  try {
    load()
  } catch (error) {
    if (error instanceof ConfigError) {
      return error.issues
    }
    throw error
  }
  throw new Error('expected a ConfigError')
}

describe('loadConfig', () => {
  it('yields the five sections from a complete source', () => {
    expect(loadConfig(complete)).toEqual({
      database: { url: database.DATABASE_URL },
      auth: {
        casIssuer: 'http://localhost:3000',
        clientId: 'ligretto',
        clientSecret: 'secret',
        redirectUri: 'http://localhost:3333/api/auth/callback',
        postLogoutRedirectUri: 'http://localhost:5174/',
        appUrl: 'http://localhost:5174/',
        sessionTransport: 'cookie',
      },
      internalApi: { tokens: ['token-a'] },
      http: { port: 4000, corsOrigins: ['http://localhost:5173', 'http://localhost:5174'] },
      logging: { level: 'debug' },
    })
  })

  it('accepts a process.env-shaped source with unknown keys and undefined values', () => {
    expect(() => loadConfig({ ...complete, HOME: '/home/user', UNSET: undefined })).not.toThrow()
  })

  it('reports every missing variable in one error', () => {
    const rest = without(complete, 'DATABASE_URL', 'LIGRETTO_CAS_CLIENT_ID')
    const issues = issuesOf(() => loadConfig(rest))
    expect(issues.map(issue => issue.variable).sort()).toEqual(['DATABASE_URL', 'LIGRETTO_CAS_CLIENT_ID'])
  })

  it('lists an unparsable CORS origin together with the other problems', () => {
    const rest = without(complete, 'DATABASE_URL')
    const issues = issuesOf(() => loadConfig({ ...rest, LIGRETTO_CORE_CORS_ORIGINS: 'not-a-url' }))
    expect([...new Set(issues.map(issue => issue.variable))].sort()).toEqual(['DATABASE_URL', 'LIGRETTO_CORE_CORS_ORIGINS'])
  })

  it('names the variables in the error message, one per line', () => {
    const rest = without(complete, 'DATABASE_URL', 'LIGRETTO_CAS_CLIENT_ID')
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL: .*\n.*LIGRETTO_CAS_CLIENT_ID: /)
  })
})

describe('section loaders', () => {
  it('parses each section from an object holding only its variables', () => {
    expect(loadDatabaseConfig(database)).toEqual({ url: database.DATABASE_URL })
    expect(loadAuthConfig(auth).sessionTransport).toBe('cookie')
    expect(loadInternalApiConfig(internalApi)).toEqual({ tokens: ['token-a'] })
    expect(loadHttpConfig(http).port).toBe(4000)
    expect(loadLoggingConfig(logging)).toEqual({ level: 'debug' })
  })

  it('accepts a CAS issuer without a top-level domain', () => {
    expect(loadAuthConfig({ ...auth, CAS_ISSUER: 'http://localhost:3000' }).casIssuer).toBe('http://localhost:3000')
  })

  it('rejects an unknown session transport', () => {
    expect(issuesOf(() => loadAuthConfig({ ...auth, LIGRETTO_CORE_AUTH_SESSION_TRANSPORT: 'header' }))[0]?.variable).toBe(
      'LIGRETTO_CORE_AUTH_SESSION_TRANSPORT',
    )
  })
})

describe('internal API tokens', () => {
  it('splits, trims and drops empty entries', () => {
    expect(loadInternalApiConfig({ LIGRETTO_INTERNAL_API_TOKEN: ' a , b ' }).tokens).toEqual(['a', 'b'])
  })

  it('rejects an empty value', () => {
    expect(issuesOf(() => loadInternalApiConfig({ LIGRETTO_INTERNAL_API_TOKEN: '' }))[0]?.variable).toBe('LIGRETTO_INTERNAL_API_TOKEN')
  })

  it('rejects a missing value', () => {
    expect(issuesOf(() => loadInternalApiConfig({}))[0]?.variable).toBe('LIGRETTO_INTERNAL_API_TOKEN')
  })

  it('rejects three values: two is the rotation window', () => {
    expect(issuesOf(() => loadInternalApiConfig({ LIGRETTO_INTERNAL_API_TOKEN: 'a,b,c' }))[0]?.variable).toBe('LIGRETTO_INTERNAL_API_TOKEN')
  })
})

describe('http', () => {
  it('defaults the port to 3333 and the CORS origins to none', () => {
    expect(loadHttpConfig({})).toEqual({ port: 3333, corsOrigins: [] })
  })

  it('rejects a port that is not a number', () => {
    expect(issuesOf(() => loadHttpConfig({ PORT: 'abc' }))[0]?.variable).toBe('PORT')
  })

  it('rejects a CORS entry with a path: an origin is scheme, host and port only', () => {
    expect(issuesOf(() => loadHttpConfig({ LIGRETTO_CORE_CORS_ORIGINS: 'http://localhost:5173/path' }))[0]?.variable).toBe(
      'LIGRETTO_CORE_CORS_ORIGINS',
    )
  })

  it.each(['not-a-url', 'https://'])('rejects an unparsable CORS entry %s as a ConfigError, not a TypeError', value => {
    expect(issuesOf(() => loadHttpConfig({ LIGRETTO_CORE_CORS_ORIGINS: value }))[0]?.variable).toBe('LIGRETTO_CORE_CORS_ORIGINS')
  })

  it('rejects a CORS entry without a scheme', () => {
    expect(issuesOf(() => loadHttpConfig({ LIGRETTO_CORE_CORS_ORIGINS: 'localhost:5173' }))[0]?.variable).toBe('LIGRETTO_CORE_CORS_ORIGINS')
  })
})

describe('logging', () => {
  it('defaults the level to info', () => {
    expect(loadLoggingConfig({})).toEqual({ level: 'info' })
  })

  it('rejects a level other than debug and info', () => {
    expect(issuesOf(() => loadLoggingConfig({ LOG_LEVEL: 'warn' }))[0]?.variable).toBe('LOG_LEVEL')
  })
})
