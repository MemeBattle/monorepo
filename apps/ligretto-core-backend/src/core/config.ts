import { z } from 'zod'

/**
 * The configuration of the service (docs/adrs/configuration-from-injected-environment.md): parsed once from the plain
 * object an entry hands in — `process.env` on Node, the bindings on Workers. Each section is keyed by the variable
 * names, so a failure names the variable, and transformed into the camelCase shape the code reads. One loader per
 * section lets an entry that needs the database alone ignore the auth settings.
 */

/** A comma-separated list: split once here, trimmed, empty entries dropped. An absent variable is an empty list. */
const commaList = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .default('')
    .transform(value =>
      value
        .split(',')
        .map(entry => entry.trim())
        .filter(entry => entry !== ''),
    )
    .pipe(z.array(item))

/**
 * An origin as the browser sends it: scheme, host and port, nothing else, so the CORS match is exact. The refinement
 * runs even when the URL check failed, so it parses defensively: a throw would escape the issue list of ConfigError.
 */
const origin = z.url({ protocol: /^https?$/ }).refine(value => URL.canParse(value) && new URL(value).origin === value, {
  message: 'Expected an origin (scheme, host and port only), such as http://localhost:5173',
})

const databaseShape = {
  DATABASE_URL: z.url(),
}

const authShape = {
  CAS_ISSUER: z.url(),
  LIGRETTO_CAS_CLIENT_ID: z.string().min(1),
  LIGRETTO_CAS_CLIENT_SECRET: z.string().min(1),
  LIGRETTO_CORE_AUTH_REDIRECT_URI: z.url(),
  LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI: z.url(),
  LIGRETTO_CORE_AUTH_APP_URL: z.url(),
  LIGRETTO_CORE_AUTH_SESSION_TRANSPORT: z.enum(['cookie', 'bearer']),
}

const internalApiShape = {
  // Two values while the token is being rotated, one otherwise.
  LIGRETTO_INTERNAL_API_TOKEN: commaList(z.string().min(1)).pipe(z.array(z.string()).min(1).max(2)),
}

const httpShape = {
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  LIGRETTO_CORE_CORS_ORIGINS: commaList(origin),
}

const loggingShape = {
  LOG_LEVEL: z.enum(['debug', 'info']).default('info'),
}

type Parsed<Shape extends z.ZodRawShape> = z.output<z.ZodObject<Shape>>

const toDatabase = (env: Parsed<typeof databaseShape>) => ({ url: env.DATABASE_URL })

const toAuth = (env: Parsed<typeof authShape>) => ({
  casIssuer: env.CAS_ISSUER,
  clientId: env.LIGRETTO_CAS_CLIENT_ID,
  clientSecret: env.LIGRETTO_CAS_CLIENT_SECRET,
  redirectUri: env.LIGRETTO_CORE_AUTH_REDIRECT_URI,
  postLogoutRedirectUri: env.LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI,
  appUrl: env.LIGRETTO_CORE_AUTH_APP_URL,
  sessionTransport: env.LIGRETTO_CORE_AUTH_SESSION_TRANSPORT,
})

const toInternalApi = (env: Parsed<typeof internalApiShape>) => ({ tokens: env.LIGRETTO_INTERNAL_API_TOKEN })

const toHttp = (env: Parsed<typeof httpShape>) => ({ port: env.PORT, corsOrigins: env.LIGRETTO_CORE_CORS_ORIGINS })

const toLogging = (env: Parsed<typeof loggingShape>) => ({ level: env.LOG_LEVEL })

export const databaseConfigSchema = z.object(databaseShape).transform(toDatabase)
export const authConfigSchema = z.object(authShape).transform(toAuth)
export const internalApiConfigSchema = z.object(internalApiShape).transform(toInternalApi)
export const httpConfigSchema = z.object(httpShape).transform(toHttp)
export const loggingConfigSchema = z.object(loggingShape).transform(toLogging)

/** Every section at once: one parse, so a bad environment reports every variable in one go. */
export const configSchema = z.object({ ...databaseShape, ...authShape, ...internalApiShape, ...httpShape, ...loggingShape }).transform(env => ({
  database: toDatabase(env),
  auth: toAuth(env),
  internalApi: toInternalApi(env),
  http: toHttp(env),
  logging: toLogging(env),
}))

export type DatabaseConfig = z.output<typeof databaseConfigSchema>
export type AuthConfig = z.output<typeof authConfigSchema>
export type InternalApiConfig = z.output<typeof internalApiConfigSchema>
export type HttpConfig = z.output<typeof httpConfigSchema>
export type LoggingConfig = z.output<typeof loggingConfigSchema>
export type Config = z.output<typeof configSchema>

export type ConfigIssue = { variable: string; message: string }

/** A configuration the service cannot start with; `issues` lists every missing or malformed variable. */
export class ConfigError extends Error {
  readonly issues: ConfigIssue[]

  constructor(issues: ConfigIssue[]) {
    super(['Invalid configuration:', ...issues.map(issue => `  ${issue.variable}: ${issue.message}`)].join('\n'))
    this.name = 'ConfigError'
    this.issues = issues
  }
}

const load = <S extends z.ZodType>(schema: S, source: Record<string, unknown>): z.output<S> => {
  const result = schema.safeParse(source)
  if (!result.success) {
    throw new ConfigError(result.error.issues.map(issue => ({ variable: String(issue.path[0] ?? '(root)'), message: issue.message })))
  }
  return result.data
}

export const loadDatabaseConfig = (source: Record<string, unknown>): DatabaseConfig => load(databaseConfigSchema, source)
export const loadAuthConfig = (source: Record<string, unknown>): AuthConfig => load(authConfigSchema, source)
export const loadInternalApiConfig = (source: Record<string, unknown>): InternalApiConfig => load(internalApiConfigSchema, source)
export const loadHttpConfig = (source: Record<string, unknown>): HttpConfig => load(httpConfigSchema, source)
export const loadLoggingConfig = (source: Record<string, unknown>): LoggingConfig => load(loggingConfigSchema, source)
export const loadConfig = (source: Record<string, unknown>): Config => load(configSchema, source)
