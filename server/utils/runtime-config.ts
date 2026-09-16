import { z } from 'zod'

const postgresUrl = z
  .string()
  .url('NUXT_DATABASE_URL must be a valid PostgreSQL connection URL')
  .refine(
    (value) =>
      value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'NUXT_DATABASE_URL must use the postgres:// or postgresql:// protocol'
  )

const locale = z
  .string()
  .regex(/^[a-z]{2}-[A-Z]{2}$/, 'NUXT_TMDB_LANGUAGE must use the ll-RR format')

const region = z
  .string()
  .regex(/^[A-Z]{2}$/, 'NUXT_TMDB_REGION must be an ISO 3166-1 alpha-2 code')

const boundedInteger = (min: number, max: number, name: string) =>
  z.coerce
    .number({ invalid_type_error: `${name} must be an integer` })
    .int(`${name} must be an integer`)
    .min(min, `${name} must be at least ${min}`)
    .max(max, `${name} must be at most ${max}`)

const runtimeConfigSchema = z.object({
  databaseUrl: postgresUrl,
  tmdbAccessToken: z
    .string()
    .trim()
    .min(1, 'NUXT_TMDB_ACCESS_TOKEN is required'),
  tmdbLanguage: locale.default('en-US'),
  tmdbRegion: region.default('US'),
  tmdbRequestTimeoutMs: boundedInteger(
    100,
    30000,
    'NUXT_TMDB_REQUEST_TIMEOUT_MS'
  ).default(5000),
  tmdbCacheTtlSeconds: boundedInteger(
    0,
    86400,
    'NUXT_TMDB_CACHE_TTL_SECONDS'
  ).default(300),
  sessionTtlSeconds: boundedInteger(
    300,
    2592000,
    'NUXT_SESSION_TTL_SECONDS'
  ).default(604800)
})

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>

export function parseRuntimeConfig(
  config: Record<string, unknown>
): RuntimeConfig {
  const result = runtimeConfigSchema.safeParse(config)

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')

    throw new Error(`Invalid runtime configuration: ${errors}`)
  }

  return result.data
}
