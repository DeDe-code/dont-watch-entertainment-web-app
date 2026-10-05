import { getRequestIP, setResponseHeader, type H3Event } from 'h3'
import {
  consumeAuthRateLimit,
  type AuthRateLimitPolicy,
  type AuthRateLimitScope
} from './auth-rate-limit'
import { ApplicationError } from './errors'

/**
 * Maps each authentication scope to the runtime-config fields that define its
 * policy, so routes only name a scope and never read rate-limit config keys
 * directly.
 */
const scopePolicyConfigKeys: Record<
  AuthRateLimitScope,
  { maxRequests: string; windowSeconds: string }
> = {
  'auth:login': {
    maxRequests: 'authLoginRateLimitMax',
    windowSeconds: 'authLoginRateLimitWindowSeconds'
  },
  'auth:signup': {
    maxRequests: 'authSignupRateLimitMax',
    windowSeconds: 'authSignupRateLimitWindowSeconds'
  }
}

// Callers whose IP cannot be resolved share one bucket, so an unidentified
// client is throttled rather than silently exempted from rate limiting.
const UNKNOWN_CLIENT_IDENTIFIER = 'unknown-client'

function readPositiveInteger(
  config: Record<string, unknown>,
  key: string
): number {
  const value = Number(config[key])

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid runtime configuration: ${key}`)
  }

  return value
}

function resolvePolicy(
  config: Record<string, unknown>,
  scope: AuthRateLimitScope
): AuthRateLimitPolicy {
  const keys = scopePolicyConfigKeys[scope]

  return {
    maxRequests: readPositiveInteger(config, keys.maxRequests),
    windowSeconds: readPositiveInteger(config, keys.windowSeconds)
  }
}

function resolveClientIdentifier(event: H3Event): string {
  const address = getRequestIP(event, { xForwardedFor: true })

  return address ?? UNKNOWN_CLIENT_IDENTIFIER
}

/**
 * Enforces the authentication rate limit for `scope` before any credential
 * work runs, so expensive password hashing or comparison cannot be triggered by
 * abusive traffic.
 *
 * The client IP is passed to the limiter, which hashes it before storing, and
 * rejected requests get the shared RATE_LIMITED error plus a Retry-After header
 * so callers can back off without learning anything about the attempted
 * account.
 */
export async function enforceAuthRateLimit(
  event: H3Event,
  scope: AuthRateLimitScope
): Promise<void> {
  const policy = resolvePolicy(useRuntimeConfig(event), scope)
  const decision = await consumeAuthRateLimit(
    scope,
    resolveClientIdentifier(event),
    policy
  )

  if (decision.allowed) {
    return
  }

  setResponseHeader(event, 'Retry-After', decision.retryAfterSeconds)
  throw ApplicationError.rateLimited()
}
