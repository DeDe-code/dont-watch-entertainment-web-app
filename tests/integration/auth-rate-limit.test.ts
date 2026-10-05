// Focused integration coverage for the PostgreSQL-backed
// authentication rate-limit foundation and storage behavior.
import { PrismaClient } from '@prisma/client'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  consumeAuthRateLimit,
  type AuthRateLimitPolicy,
  type AuthRateLimitScope
} from '../../server/utils/auth-rate-limit'
import {
  connectTestDatabase,
  resetTestDatabase
} from '../setup/database-client'

const LOGIN_POLICY: AuthRateLimitPolicy = { maxRequests: 3, windowSeconds: 900 }
const SIGNUP_POLICY: AuthRateLimitPolicy = {
  maxRequests: 2,
  windowSeconds: 3600
}
const WINDOW_START = new Date('2026-01-01T00:00:00.000Z')

describe('authentication rate limit foundation (TASK-SEC-002)', () => {
  let dbClient: Client
  let prisma: PrismaClient

  beforeAll(async () => {
    dbClient = await connectTestDatabase()
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
  })

  beforeEach(async () => {
    await resetTestDatabase(dbClient)
  })

  afterAll(async () => {
    await dbClient.end()
    await prisma.$disconnect()
  })

  function consume(
    scope: AuthRateLimitScope,
    callerIdentifier: string,
    policy: AuthRateLimitPolicy,
    now = WINDOW_START
  ) {
    return consumeAuthRateLimit(scope, callerIdentifier, policy, {
      store: prisma,
      now
    })
  }

  it('allows requests up to the configured limit and rejects the next (AC-1, AC-2)', async () => {
    const caller = '203.0.113.10'

    for (let request = 1; request <= LOGIN_POLICY.maxRequests; request++) {
      const decision = await consume('auth:login', caller, LOGIN_POLICY)

      expect(decision.allowed).toBe(true)
      expect(decision.remaining).toBe(LOGIN_POLICY.maxRequests - request)
    }

    const blocked = await consume('auth:login', caller, LOGIN_POLICY)

    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBe(LOGIN_POLICY.windowSeconds)
  })

  it('permits requests again in a new time window (AC-3)', async () => {
    const caller = '203.0.113.11'

    for (let request = 0; request < LOGIN_POLICY.maxRequests; request++) {
      await consume('auth:login', caller, LOGIN_POLICY)
    }
    expect((await consume('auth:login', caller, LOGIN_POLICY)).allowed).toBe(
      false
    )

    const nextWindow = new Date(
      WINDOW_START.getTime() + LOGIN_POLICY.windowSeconds * 1000
    )
    const decision = await consume(
      'auth:login',
      caller,
      LOGIN_POLICY,
      nextWindow
    )

    expect(decision.allowed).toBe(true)
    expect(decision.remaining).toBe(LOGIN_POLICY.maxRequests - 1)
  })

  it('reuses the same bucket when the window rolls over instead of accumulating rows', async () => {
    const caller = '203.0.113.15'

    await consume('auth:login', caller, LOGIN_POLICY)
    await consume('auth:login', caller, LOGIN_POLICY)

    const nextWindow = new Date(
      WINDOW_START.getTime() + LOGIN_POLICY.windowSeconds * 1000
    )
    const decision = await consume(
      'auth:login',
      caller,
      LOGIN_POLICY,
      nextWindow
    )

    expect(decision.allowed).toBe(true)
    expect(decision.remaining).toBe(LOGIN_POLICY.maxRequests - 1)

    const rows = await prisma.$queryRaw<
      Array<{ windowStart: Date; count: number; expiresAt: Date }>
    >`SELECT "windowStart", "count", "expiresAt" FROM "RateLimitCounter"`

    expect(rows).toHaveLength(1)
    expect(rows[0]!.count).toBe(1)
    expect(rows[0]!.windowStart.getTime()).toBe(nextWindow.getTime())
    expect(rows[0]!.expiresAt.getTime()).toBe(
      nextWindow.getTime() + LOGIN_POLICY.windowSeconds * 1000
    )
  })

  it('does not let a stale adjacent-window request roll a newer bucket backward', async () => {
    const caller = '203.0.113.16'
    const windowMs = LOGIN_POLICY.windowSeconds * 1000
    const staleNow = new Date(WINDOW_START.getTime() + 1_000)
    const newerNow = new Date(WINDOW_START.getTime() + windowMs)
    const newerExpiresAt = new Date(newerNow.getTime() + windowMs)

    // The newer request lands first and owns the bucket for the next window.
    const newer = await consume('auth:login', caller, LOGIN_POLICY, newerNow)
    expect(newer.allowed).toBe(true)
    expect(newer.remaining).toBe(LOGIN_POLICY.maxRequests - 1)

    // The slightly older request acquires the row lock afterwards. It must only
    // increment the newer bucket and must not reset it to the earlier window.
    const stale = await consume('auth:login', caller, LOGIN_POLICY, staleNow)
    expect(stale.allowed).toBe(true)
    expect(stale.remaining).toBe(LOGIN_POLICY.maxRequests - 2)
    expect(stale.retryAfterSeconds).toBe(
      Math.ceil((newerExpiresAt.getTime() - staleNow.getTime()) / 1000)
    )

    const rows = await prisma.$queryRaw<
      Array<{ windowStart: Date; count: number; expiresAt: Date }>
    >`SELECT "windowStart", "count", "expiresAt" FROM "RateLimitCounter"`

    expect(rows).toHaveLength(1)
    expect(rows[0]!.count).toBe(2)
    expect(rows[0]!.windowStart.getTime()).toBe(newerNow.getTime())
    expect(rows[0]!.expiresAt.getTime()).toBe(newerExpiresAt.getTime())
  })

  it('keeps login and signup counters independent for the same caller (AC-4)', async () => {
    const caller = '203.0.113.12'

    for (let request = 0; request < SIGNUP_POLICY.maxRequests; request++) {
      expect(
        (await consume('auth:signup', caller, SIGNUP_POLICY)).allowed
      ).toBe(true)
    }
    expect((await consume('auth:signup', caller, SIGNUP_POLICY)).allowed).toBe(
      false
    )
    expect((await consume('auth:login', caller, LOGIN_POLICY)).allowed).toBe(
      true
    )
  })

  it('stores only a hash of the caller identifier', async () => {
    const caller = '203.0.113.13'
    await consume('auth:login', caller, LOGIN_POLICY)

    const rows = await prisma.$queryRaw<Array<{ bucketKey: string }>>`
      SELECT "bucketKey" FROM "RateLimitCounter"
    `

    expect(rows).toHaveLength(1)
    expect(rows[0]!.bucketKey).toMatch(/^[a-f0-9]{64}$/)
    expect(rows[0]!.bucketKey).not.toContain(caller)
  })

  it('counts simultaneous requests without losing increments', async () => {
    const caller = '203.0.113.14'

    const allowed = await Promise.all(
      Array.from({ length: LOGIN_POLICY.maxRequests }, () =>
        consume('auth:login', caller, LOGIN_POLICY)
      )
    )
    expect(allowed.every((decision) => decision.allowed)).toBe(true)

    const blocked = await Promise.all(
      Array.from({ length: 3 }, () =>
        consume('auth:login', caller, LOGIN_POLICY)
      )
    )
    expect(blocked.every((decision) => decision.allowed)).toBe(false)
    expect(blocked.every((decision) => decision.remaining === 0)).toBe(true)
  })
})
