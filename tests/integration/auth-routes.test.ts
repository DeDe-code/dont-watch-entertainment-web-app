// Integration tests for TASK-BE-006 authentication routes (signup, login,
// logout, /me). The routes are Nitro handlers, not a running HTTP server, so
// each test invokes the real handler with a minimal H3 event double against
// the isolated PostgreSQL test database.
import type { H3Event } from 'h3'
import { PrismaClient } from '@prisma/client'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  connectTestDatabase,
  resetTestDatabase
} from '../setup/database-client'
import { createUserInput } from '../factories/user.factory'
import signupHandler from '../../server/api/auth/signup.post'
import loginHandler from '../../server/api/auth/login.post'
import logoutHandler from '../../server/api/auth/logout.post'
import meHandler from '../../server/api/auth/me.get'

const SESSION_COOKIE_NAME = 'dont-watch-session'

type MockResHeaders = Map<string, string | string[]>

interface MockEventOptions {
  method?: string
  body?: unknown
  cookie?: string
  ip?: string
}

function createEvent({
  method = 'GET',
  body,
  cookie,
  ip = '127.0.0.1'
}: MockEventOptions = {}): H3Event {
  const responseHeaders: MockResHeaders = new Map()

  return {
    method,
    context: {},
    node: {
      req: {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        // Backs h3's getRequestIP, which the rate limiter uses to identify
        // the caller.
        socket: { remoteAddress: ip }
      },
      res: {
        statusCode: 200,
        getHeader: (name: string) => responseHeaders.get(name.toLowerCase()),
        setHeader: (name: string, value: string | string[]) => {
          responseHeaders.set(name.toLowerCase(), value)
        },
        appendHeader: (name: string, value: string) => {
          const key = name.toLowerCase()
          const current = responseHeaders.get(key)
          if (!current) {
            responseHeaders.set(key, value)
            return
          }
          const existing = Array.isArray(current) ? current : [current]
          responseHeaders.set(key, existing.concat(value))
        },
        removeHeader: (name: string) => {
          responseHeaders.delete(name.toLowerCase())
        }
      }
    },
    // Consumed by h3's readRawBody instead of a real request stream.
    _requestBody: body
  } as unknown as H3Event
}

function getSetCookieValues(event: H3Event): string[] {
  const header = (
    event.node.res as unknown as { getHeader: (name: string) => unknown }
  ).getHeader('set-cookie')

  if (!header) {
    return []
  }

  return Array.isArray(header) ? (header as string[]) : [header as string]
}

function extractSessionToken(event: H3Event): string {
  const cookie = getSetCookieValues(event).find((value) =>
    value.startsWith(`${SESSION_COOKIE_NAME}=`)
  )

  if (!cookie) {
    throw new Error('Session cookie was not set on the response')
  }

  return cookie.split(';')[0]!.split('=')[1]!
}

function signupBody(input: { email: string; password: string }) {
  return {
    email: input.email,
    password: input.password,
    passwordConfirmation: input.password
  }
}

const baseRuntimeConfig = {
  sessionTtlSeconds: 604800,
  authLoginRateLimitMax: 10,
  authLoginRateLimitWindowSeconds: 900,
  authSignupRateLimitMax: 5,
  authSignupRateLimitWindowSeconds: 3600
}

let runtimeConfig = { ...baseRuntimeConfig }

describe('authentication routes (TASK-BE-006)', () => {
  let dbClient: Client
  let prisma: PrismaClient

  beforeAll(async () => {
    dbClient = await connectTestDatabase()
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
    // Routes call the Nuxt/Nitro global `useRuntimeConfig`, which only
    // exists inside a running Nitro server; stub it for direct handler calls.
    ;(
      globalThis as unknown as {
        useRuntimeConfig: () => typeof runtimeConfig
      }
    ).useRuntimeConfig = () => runtimeConfig
  })

  beforeEach(async () => {
    runtimeConfig = { ...baseRuntimeConfig }
    await resetTestDatabase(dbClient)
  })

  afterAll(async () => {
    delete (globalThis as { useRuntimeConfig?: unknown }).useRuntimeConfig
    await prisma.$disconnect()
    await dbClient.end()
  })

  describe('POST /api/auth/signup', () => {
    it('creates exactly one user with a password hash and one session (AC-1)', async () => {
      const input = createUserInput()
      const event = createEvent({ method: 'POST', body: signupBody(input) })

      const response = await signupHandler(event)

      expect(response).toMatchObject({ email: input.email })
      expect(event.node.res.statusCode).toBe(201)
      expect(extractSessionToken(event)).toMatch(/^[a-f0-9]{64}$/)

      const users = await prisma.user.findMany({
        where: { email: input.email }
      })
      expect(users).toHaveLength(1)
      expect(users[0]?.passwordHash).not.toBe(input.password)

      const sessions = await prisma.session.findMany({
        where: { userId: users[0]!.id }
      })
      expect(sessions).toHaveLength(1)
    })

    it('returns 409 for a duplicate normalized email without creating another account (AC-2)', async () => {
      const input = createUserInput()
      await signupHandler(
        createEvent({ method: 'POST', body: signupBody(input) })
      )

      const duplicate = signupHandler(
        createEvent({
          method: 'POST',
          body: signupBody({ ...input, email: input.email.toUpperCase() })
        })
      )

      await expect(duplicate).rejects.toMatchObject({ statusCode: 409 })

      const users = await prisma.user.findMany({
        where: { email: input.email }
      })
      expect(users).toHaveLength(1)
    })
  })

  describe('POST /api/auth/login', () => {
    it('creates a session for valid credentials (AC-3)', async () => {
      const input = createUserInput()
      await signupHandler(
        createEvent({ method: 'POST', body: signupBody(input) })
      )
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: input.email }
      })
      const sessionsBeforeLogin = await prisma.session.count({
        where: { userId: user.id }
      })

      const event = createEvent({
        method: 'POST',
        body: { email: input.email, password: input.password }
      })
      const response = await loginHandler(event)

      expect(response).toMatchObject({ email: input.email })
      expect(extractSessionToken(event)).toMatch(/^[a-f0-9]{64}$/)

      const sessionsAfterLogin = await prisma.session.count({
        where: { userId: user.id }
      })
      expect(sessionsAfterLogin).toBe(sessionsBeforeLogin + 1)
    })

    it('returns the same generic 401 shape for unknown emails and wrong passwords (AC-3)', async () => {
      const input = createUserInput()
      await signupHandler(
        createEvent({ method: 'POST', body: signupBody(input) })
      )
      const expectedShape = {
        statusCode: 401,
        data: { code: 'UNAUTHENTICATED' }
      }

      await expect(
        loginHandler(
          createEvent({
            method: 'POST',
            body: { email: input.email, password: 'Wrong-Password-1!' }
          })
        )
      ).rejects.toMatchObject(expectedShape)
      await expect(
        loginHandler(
          createEvent({
            method: 'POST',
            body: { email: 'nobody@example.test', password: input.password }
          })
        )
      ).rejects.toMatchObject(expectedShape)
    })
  })

  describe('POST /api/auth/logout', () => {
    it('revokes the current session and clears the session cookie (AC-4)', async () => {
      const input = createUserInput()
      const signupEvent = createEvent({
        method: 'POST',
        body: signupBody(input)
      })
      await signupHandler(signupEvent)
      const token = extractSessionToken(signupEvent)

      const logoutEvent = createEvent({
        method: 'POST',
        cookie: `${SESSION_COOKIE_NAME}=${token}`
      })
      await logoutHandler(logoutEvent)

      expect(logoutEvent.node.res.statusCode).toBe(204)
      const clearedCookie = getSetCookieValues(logoutEvent).find((value) =>
        value.startsWith(`${SESSION_COOKIE_NAME}=`)
      )
      expect(clearedCookie).toContain('Max-Age=0')

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: input.email }
      })
      const sessions = await prisma.session.findMany({
        where: { userId: user.id }
      })
      expect(sessions).toHaveLength(0)
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns only the sanitized current user (AC-5)', async () => {
      const input = createUserInput()
      const signupEvent = createEvent({
        method: 'POST',
        body: signupBody(input)
      })
      await signupHandler(signupEvent)
      const token = extractSessionToken(signupEvent)

      const response = await meHandler(
        createEvent({ cookie: `${SESSION_COOKIE_NAME}=${token}` })
      )

      expect(response).toMatchObject({ email: input.email })
      expect(Object.keys(response as object).sort()).toEqual(
        ['id', 'email', 'createdAt', 'updatedAt'].sort()
      )
    })

    it('rejects requests without a session cookie (AC-5)', async () => {
      await expect(meHandler(createEvent())).rejects.toMatchObject({
        statusCode: 401,
        data: { code: 'UNAUTHENTICATED' }
      })
    })

    it('rejects a malformed session token (AC-5)', async () => {
      await expect(
        meHandler(
          createEvent({ cookie: `${SESSION_COOKIE_NAME}=not-a-valid-token` })
        )
      ).rejects.toMatchObject({
        statusCode: 401,
        data: { code: 'UNAUTHENTICATED' }
      })
    })

    it('rejects a revoked session token (AC-5)', async () => {
      const input = createUserInput()
      const signupEvent = createEvent({
        method: 'POST',
        body: signupBody(input)
      })
      await signupHandler(signupEvent)
      const token = extractSessionToken(signupEvent)

      await logoutHandler(
        createEvent({
          method: 'POST',
          cookie: `${SESSION_COOKIE_NAME}=${token}`
        })
      )

      await expect(
        meHandler(createEvent({ cookie: `${SESSION_COOKIE_NAME}=${token}` }))
      ).rejects.toMatchObject({
        statusCode: 401,
        data: { code: 'UNAUTHENTICATED' }
      })
    })
  })

  describe('sensitive field exposure (AC-6)', () => {
    it('never returns passwordHash, session tokens, or tokenHash in responses', async () => {
      const input = createUserInput()
      const signupEvent = createEvent({
        method: 'POST',
        body: signupBody(input)
      })
      const signupResponse = await signupHandler(signupEvent)
      const token = extractSessionToken(signupEvent)

      const loginResponse = await loginHandler(
        createEvent({
          method: 'POST',
          body: { email: input.email, password: input.password }
        })
      )
      const meResponse = await meHandler(
        createEvent({ cookie: `${SESSION_COOKIE_NAME}=${token}` })
      )

      const session = await prisma.session.findFirstOrThrow({
        where: { user: { email: input.email } }
      })

      for (const response of [signupResponse, loginResponse, meResponse]) {
        const serialized = JSON.stringify(response)
        expect(serialized).not.toContain('passwordHash')
        expect(serialized).not.toContain('tokenHash')
        expect(serialized).not.toContain(token)
        expect(serialized).not.toContain(session.tokenHash)
        expect(response).not.toHaveProperty('passwordHash')
        expect(response).not.toHaveProperty('tokenHash')
      }
    })
  })

  describe('authentication rate limiting (TASK-SEC-002)', () => {
    const loginBody = {
      email: 'unknown@example.test',
      password: 'Wrong-Password-1!'
    }

    function readRetryAfter(event: H3Event): number {
      return Number(event.node.res.getHeader('retry-after'))
    }

    it('allows login attempts up to the configured limit, then returns 429 with Retry-After (AC-2, AC-3)', async () => {
      const ip = '203.0.113.21'

      for (let attempt = 0; attempt < 10; attempt++) {
        await expect(
          loginHandler(createEvent({ method: 'POST', body: loginBody, ip }))
        ).rejects.toMatchObject({
          statusCode: 401,
          data: { code: 'UNAUTHENTICATED' }
        })
      }

      const blockedEvent = createEvent({ method: 'POST', body: loginBody, ip })
      await expect(loginHandler(blockedEvent)).rejects.toMatchObject({
        statusCode: 429,
        data: { code: 'RATE_LIMITED' }
      })

      const retryAfter = readRetryAfter(blockedEvent)
      expect(Number.isInteger(retryAfter)).toBe(true)
      expect(retryAfter).toBeGreaterThan(0)
      expect(retryAfter).toBeLessThanOrEqual(900)
    })

    it('returns the same rate-limit response whether or not the email exists (AC-4)', async () => {
      const known = createUserInput()
      await signupHandler(
        createEvent({
          method: 'POST',
          body: signupBody(known),
          ip: '203.0.113.22'
        })
      )

      const ip = '203.0.113.23'
      for (let attempt = 0; attempt < 10; attempt++) {
        await expect(
          loginHandler(createEvent({ method: 'POST', body: loginBody, ip }))
        ).rejects.toMatchObject({ statusCode: 401 })
      }

      const knownEvent = createEvent({
        method: 'POST',
        body: { email: known.email, password: 'Wrong-Password-1!' },
        ip
      })
      const unknownEvent = createEvent({ method: 'POST', body: loginBody, ip })

      const knownError = (await loginHandler(knownEvent).catch(
        (error) => error
      )) as { statusCode: number; statusMessage: string; data: unknown }
      const unknownError = (await loginHandler(unknownEvent).catch(
        (error) => error
      )) as { statusCode: number; statusMessage: string; data: unknown }

      expect(knownError).toMatchObject({
        statusCode: 429,
        data: { code: 'RATE_LIMITED' }
      })
      expect(unknownError).toMatchObject({
        statusCode: 429,
        data: { code: 'RATE_LIMITED' }
      })
      expect(knownError.statusMessage).toBe(unknownError.statusMessage)
      expect(JSON.stringify(knownError.data)).not.toContain(known.email)
    })

    it('allows signup attempts up to the configured limit, then returns 429 with Retry-After (AC-5, AC-6, AC-7)', async () => {
      const ip = '203.0.113.24'

      for (let attempt = 0; attempt < 5; attempt++) {
        const input = createUserInput()
        const response = await signupHandler(
          createEvent({ method: 'POST', body: signupBody(input), ip })
        )
        expect(response).toMatchObject({ email: input.email })
      }

      const blockedEvent = createEvent({
        method: 'POST',
        body: signupBody(createUserInput()),
        ip
      })
      await expect(signupHandler(blockedEvent)).rejects.toMatchObject({
        statusCode: 429,
        data: { code: 'RATE_LIMITED' }
      })

      const retryAfter = readRetryAfter(blockedEvent)
      expect(Number.isInteger(retryAfter)).toBe(true)
      expect(retryAfter).toBeGreaterThan(0)
      expect(retryAfter).toBeLessThanOrEqual(3600)
    })

    it('keeps login and signup rate-limit scopes independent (AC-9)', async () => {
      const ip = '203.0.113.25'

      for (let attempt = 0; attempt < 10; attempt++) {
        await expect(
          loginHandler(createEvent({ method: 'POST', body: loginBody, ip }))
        ).rejects.toMatchObject({ statusCode: 401 })
      }
      await expect(
        loginHandler(createEvent({ method: 'POST', body: loginBody, ip }))
      ).rejects.toMatchObject({ statusCode: 429 })

      const input = createUserInput()
      await expect(
        signupHandler(
          createEvent({ method: 'POST', body: signupBody(input), ip })
        )
      ).resolves.toMatchObject({ email: input.email })
    })

    it('honours the limit from runtime configuration (AC-1)', async () => {
      runtimeConfig = { ...baseRuntimeConfig, authLoginRateLimitMax: 1 }
      const ip = '203.0.113.26'

      await expect(
        loginHandler(createEvent({ method: 'POST', body: loginBody, ip }))
      ).rejects.toMatchObject({ statusCode: 401 })
      await expect(
        loginHandler(createEvent({ method: 'POST', body: loginBody, ip }))
      ).rejects.toMatchObject({ statusCode: 429 })
    })
  })
})
