import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

/**
 * Authentication-scoped, PostgreSQL-backed fixed-window rate limiting.
 *
 * This is deliberately not a general-purpose rate limiter: each bucket is keyed
 * by an authentication scope plus the caller identifier, so login and signup
 * never share a counter and no other feature can accidentally consume these
 * limits.
 */
export const AUTH_RATE_LIMIT_SCOPES = ['auth:login', 'auth:signup'] as const
export type AuthRateLimitScope = (typeof AUTH_RATE_LIMIT_SCOPES)[number]

export interface AuthRateLimitPolicy {
  /** Maximum requests permitted within one fixed window. */
  maxRequests: number
  /** Length of the fixed window in seconds. */
  windowSeconds: number
}

export interface AuthRateLimitDecision {
  /** Whether the current request is within the configured maximum. */
  allowed: boolean
  /** Requests still available in the current window. */
  remaining: number
  /** Seconds until the current window resets and a blocked caller may retry. */
  retryAfterSeconds: number
}

export interface ConsumeAuthRateLimitOptions {
  store?: Pick<PrismaClient, '$queryRaw'>
  now?: Date
}

function hashCallerIdentifier(callerIdentifier: string): string {
  return createHash('sha256').update(callerIdentifier).digest('hex')
}

function resolveWindowBounds(
  now: Date,
  windowSeconds: number
): { windowStart: Date; expiresAt: Date } {
  const windowMs = windowSeconds * 1000
  const startMs = Math.floor(now.getTime() / windowMs) * windowMs

  return {
    windowStart: new Date(startMs),
    expiresAt: new Date(startMs + windowMs)
  }
}

/**
 * Atomically consumes one unit from the fixed-window bucket for `scope` and the
 * caller identifier.
 *
 * The bucket is identified by (scope, hashed identifier) and holds only the
 * current window, so raw caller identifiers are never persisted and historical
 * windows do not accumulate. The `INSERT ... ON CONFLICT` statement is a single
 * atomic upsert that keeps simultaneous requests from losing increments: a new
 * bucket starts at 1, an existing row whose window is still active increments,
 * and a row whose window has expired relative to the current request is reset
 * in place to the incoming window with count 1.
 *
 * Rollover is decided by whether the stored bucket has expired (`expiresAt <=
 * now`), never by comparing `windowStart` values. Around a window boundary two
 * concurrent requests can carry adjacent windows, and the older request may
 * acquire the row lock after the newer one; keying on expiry means such a stale
 * request can only increment the already-newer bucket and can never move it
 * backward.
 */
export async function consumeAuthRateLimit(
  scope: AuthRateLimitScope,
  callerIdentifier: string,
  policy: AuthRateLimitPolicy,
  options: ConsumeAuthRateLimitOptions = {}
): Promise<AuthRateLimitDecision> {
  const store = options.store ?? prisma
  const now = options.now ?? new Date()
  const { windowStart, expiresAt } = resolveWindowBounds(
    now,
    policy.windowSeconds
  )

  const rows = await store.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
    INSERT INTO "RateLimitCounter" ("scope", "bucketKey", "windowStart", "count", "expiresAt")
    VALUES (${scope}, ${hashCallerIdentifier(callerIdentifier)}, ${windowStart}, 1, ${expiresAt})
    ON CONFLICT ("scope", "bucketKey")
    DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitCounter"."expiresAt" <= ${now}
          THEN 1
        ELSE "RateLimitCounter"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimitCounter"."expiresAt" <= ${now}
          THEN EXCLUDED."windowStart"
        ELSE "RateLimitCounter"."windowStart"
      END,
      "expiresAt" = CASE
        WHEN "RateLimitCounter"."expiresAt" <= ${now}
          THEN EXCLUDED."expiresAt"
        ELSE "RateLimitCounter"."expiresAt"
      END
    RETURNING "count", "expiresAt"
  `
  const stored = rows[0]
  const count = stored?.count ?? 0
  const storedExpiresAt = stored?.expiresAt ?? expiresAt

  return {
    allowed: count <= policy.maxRequests,
    remaining: Math.max(0, policy.maxRequests - count),
    // Describe the bucket PostgreSQL actually updated, not the incoming window,
    // so a stale request that merely increments a newer bucket reports that
    // bucket's true reset time.
    retryAfterSeconds: Math.ceil(
      Math.max(0, storedExpiresAt.getTime() - now.getTime()) / 1000
    )
  }
}
