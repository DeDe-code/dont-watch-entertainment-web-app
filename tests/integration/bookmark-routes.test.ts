import type { H3Event } from 'h3'
import { PrismaClient } from '@prisma/client'
import type { Client } from 'pg'
import { http, HttpResponse } from 'msw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createUserInput } from '../factories/user.factory'
import {
  connectTestDatabase,
  resetTestDatabase
} from '../setup/database-client'
import signupHandler from '../../server/api/auth/signup.post'
import listBookmarksHandler from '../../server/api/bookmarks/index.get'
import createBookmarkHandler from '../../server/api/bookmarks/index.post'
import deleteBookmarkHandler from '../../server/api/bookmarks/[provider]/[externalId]/[mediaType].delete'
import { mswServer } from '../setup/msw'

const SESSION_COOKIE_NAME = 'dont-watch-session'
const tmdbBaseUrl = 'https://api.themoviedb.org/3'
const stubRuntimeConfig = {
  databaseUrl: process.env.TEST_DATABASE_URL,
  tmdbAccessToken: 'integration-test-token',
  tmdbLanguage: 'en-US',
  tmdbRegion: 'US',
  tmdbRequestTimeoutMs: 1000,
  tmdbCacheTtlSeconds: 0,
  sessionTtlSeconds: 604800
}

interface MockEventOptions {
  method?: string
  body?: unknown
  cookie?: string
  url?: string
  params?: Record<string, string>
}

function createEvent({
  method = 'GET',
  body,
  cookie,
  url = '/',
  params
}: MockEventOptions = {}): H3Event {
  const responseHeaders = new Map<string, string | string[]>()

  return {
    method,
    context: params ? { params } : {},
    node: {
      req: {
        method,
        url,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        }
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
          responseHeaders.set(
            key,
            current
              ? (Array.isArray(current) ? current : [current]).concat(value)
              : value
          )
        },
        removeHeader: (name: string) =>
          responseHeaders.delete(name.toLowerCase())
      }
    },
    _requestBody: body
  } as unknown as H3Event
}

function getSessionToken(event: H3Event): string {
  const header = (
    event.node.res as unknown as { getHeader: (name: string) => unknown }
  ).getHeader('set-cookie')
  const cookies = Array.isArray(header) ? header : header ? [header] : []
  const cookie = cookies.find((value) =>
    String(value).startsWith(`${SESSION_COOKIE_NAME}=`)
  )
  if (!cookie) throw new Error('Session cookie was not set')
  return String(cookie).split(';')[0]!.split('=')[1]!
}

function signupBody(input: { email: string; password: string }) {
  return {
    email: input.email,
    password: input.password,
    passwordConfirmation: input.password
  }
}

const movie = {
  externalId: 101,
  mediaType: 'MOVIE' as const,
  title: 'Snapshot Movie',
  year: 2024,
  posterPath: '/snapshot.jpg',
  backdropPath: null,
  overview: null,
  contentRating: null,
  isTrending: false,
  isBookmarked: false
}

const tmdbMovie = {
  id: 101,
  title: 'Canonical Movie',
  release_date: '2024-01-01',
  poster_path: '/canonical-poster.jpg',
  backdrop_path: '/canonical-backdrop.jpg',
  overview: 'Trusted provider data',
  vote_average: 8.4
}

function mockCanonicalMovie() {
  mswServer.use(
    http.get(`${tmdbBaseUrl}/movie/101`, () => HttpResponse.json(tmdbMovie)),
    http.get(`${tmdbBaseUrl}/movie/101/release_dates`, () =>
      HttpResponse.json({
        results: [
          { iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }
        ]
      })
    )
  )
}

async function createSession() {
  const input = createUserInput()
  const event = createEvent({ method: 'POST', body: signupBody(input) })
  await signupHandler(event)
  return getSessionToken(event)
}

describe('bookmark routes (TASK-BE-012 / issue #17)', () => {
  let dbClient: Client
  let prisma: PrismaClient

  beforeAll(async () => {
    dbClient = await connectTestDatabase()
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
    ;(
      globalThis as unknown as {
        useRuntimeConfig: () => typeof stubRuntimeConfig
      }
    ).useRuntimeConfig = () => stubRuntimeConfig
  })

  beforeEach(async () => resetTestDatabase(dbClient))

  afterAll(async () => {
    delete (globalThis as { useRuntimeConfig?: unknown }).useRuntimeConfig
    await prisma.$disconnect()
    await dbClient.end()
  })

  it('returns 401 for anonymous list, create, and delete requests (AC-1)', async () => {
    await expect(listBookmarksHandler(createEvent())).rejects.toMatchObject({
      statusCode: 401
    })
    await expect(
      createBookmarkHandler(createEvent({ method: 'POST', body: movie }))
    ).rejects.toMatchObject({ statusCode: 401 })
    await expect(
      deleteBookmarkHandler(
        createEvent({
          params: { provider: 'TMDB', externalId: '101', mediaType: 'MOVIE' }
        })
      )
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('lists only the authenticated user bookmarks with pagination (AC-2)', async () => {
    const firstToken = await createSession()
    const secondToken = await createSession()
    mockCanonicalMovie()
    await createBookmarkHandler(
      createEvent({
        method: 'POST',
        cookie: `${SESSION_COOKIE_NAME}=${firstToken}`,
        body: { provider: 'TMDB', externalId: 101, mediaType: 'MOVIE' }
      })
    )
    await createBookmarkHandler(
      createEvent({
        method: 'POST',
        cookie: `${SESSION_COOKIE_NAME}=${secondToken}`,
        body: { provider: 'TMDB', externalId: 101, mediaType: 'MOVIE' }
      })
    )

    const response = await listBookmarksHandler(
      createEvent({
        cookie: `${SESSION_COOKIE_NAME}=${firstToken}`,
        url: '/?page=1'
      })
    )
    expect(response).toMatchObject({
      data: [{ externalId: 101, title: 'Canonical Movie' }],
      meta: { page: 1, totalResults: 1 }
    })
  })

  it('does not create duplicate bookmarks on repeated creates (AC-3)', async () => {
    const token = await createSession()
    mockCanonicalMovie()
    const event = () =>
      createEvent({
        method: 'POST',
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
        body: { provider: 'TMDB', externalId: 101, mediaType: 'MOVIE' }
      })
    await createBookmarkHandler(event())
    await createBookmarkHandler(event())
    await expect(prisma.bookmark.count()).resolves.toBe(1)
    await expect(prisma.mediaReference.count()).resolves.toBe(1)
  })

  it('accepts identity-only creates and returns canonical provider snapshots', async () => {
    const token = await createSession()
    mockCanonicalMovie()

    const response = await createBookmarkHandler(
      createEvent({
        method: 'POST',
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
        body: { provider: 'TMDB', externalId: 101, mediaType: 'MOVIE' }
      })
    )

    expect(response).toMatchObject({
      externalId: 101,
      title: 'Canonical Movie',
      posterPath: '/canonical-poster.jpg',
      backdropPath: '/canonical-backdrop.jpg',
      contentRating: 'PG-13',
      isBookmarked: true
    })
    await expect(
      prisma.mediaReference.findFirstOrThrow()
    ).resolves.toMatchObject({
      titleSnapshot: 'Canonical Movie',
      posterPathSnapshot: '/canonical-poster.jpg',
      backdropPathSnapshot: '/canonical-backdrop.jpg',
      contentRatingSnapshot: 'PG-13'
    })
  })
  it('ignores client-supplied snapshot fields and stores canonical provider data', async () => {
    const token = await createSession()
    mockCanonicalMovie()

    await createBookmarkHandler(
      createEvent({
        method: 'POST',
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
        body: {
          provider: 'TMDB',
          externalId: 101,
          mediaType: 'MOVIE',
          title: 'HACKED TITLE',
          posterPath: '/fake.jpg',
          backdropPath: '/fake-backdrop.jpg',
          contentRating: 'FAKE'
        }
      })
    )

    await expect(
      prisma.mediaReference.findFirstOrThrow()
    ).resolves.toMatchObject({
      titleSnapshot: 'Canonical Movie',
      posterPathSnapshot: '/canonical-poster.jpg',
      backdropPathSnapshot: '/canonical-backdrop.jpg',
      contentRatingSnapshot: 'PG-13'
    })
  })
  it('keeps concurrent identity-only creates idempotent', async () => {
    const token = await createSession()
    mockCanonicalMovie()
    const event = () =>
      createBookmarkHandler(
        createEvent({
          method: 'POST',
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
          body: { provider: 'TMDB', externalId: 101, mediaType: 'MOVIE' }
        })
      )

    await Promise.all([event(), event(), event(), event()])
    await expect(prisma.bookmark.count()).resolves.toBe(1)
    await expect(prisma.mediaReference.count()).resolves.toBe(1)
  })

  it('cannot delete another user bookmark (AC-4)', async () => {
    const ownerToken = await createSession()
    const otherToken = await createSession()
    mockCanonicalMovie()
    await createBookmarkHandler(
      createEvent({
        method: 'POST',
        cookie: `${SESSION_COOKIE_NAME}=${ownerToken}`,
        body: { provider: 'TMDB', externalId: 101, mediaType: 'MOVIE' }
      })
    )

    const response = await deleteBookmarkHandler(
      createEvent({
        cookie: `${SESSION_COOKIE_NAME}=${otherToken}`,
        params: { provider: 'TMDB', externalId: '101', mediaType: 'MOVIE' }
      })
    )
    expect(response).toEqual({ deleted: false })
    await expect(prisma.bookmark.count()).resolves.toBe(1)
  })

  it('rejects invalid provider or media identity before persistence (AC-5)', async () => {
    const token = await createSession()
    await expect(
      createBookmarkHandler(
        createEvent({
          method: 'POST',
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
          body: { ...movie, externalId: 0 }
        })
      )
    ).rejects.toMatchObject({ statusCode: 400 })
    await expect(
      deleteBookmarkHandler(
        createEvent({
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
          params: { provider: 'LOCAL', externalId: '101', mediaType: 'MOVIE' }
        })
      )
    ).rejects.toMatchObject({ statusCode: 400 })
    await expect(prisma.bookmark.count()).resolves.toBe(0)
    await expect(prisma.mediaReference.count()).resolves.toBe(0)
  })

  it('lists persisted snapshots without contacting TMDB (AC-6)', async () => {
    const token = await createSession()
    mockCanonicalMovie()
    await createBookmarkHandler(
      createEvent({
        method: 'POST',
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
        body: { provider: 'TMDB', externalId: 101, mediaType: 'MOVIE' }
      })
    )
    mswServer.use(
      http.get(`${tmdbBaseUrl}/:path`, () =>
        HttpResponse.json(
          { error: 'GET must not contact TMDB' },
          { status: 500 }
        )
      )
    )
    const response = await listBookmarksHandler(
      createEvent({ cookie: `${SESSION_COOKIE_NAME}=${token}` })
    )
    expect(response).toMatchObject({
      data: [
        {
          title: 'Canonical Movie',
          year: 2024,
          posterPath: '/canonical-poster.jpg',
          backdropPath: '/canonical-backdrop.jpg',
          contentRating: 'PG-13'
        }
      ]
    })
  })

  it('uses provider identity for deletion, not a local bookmark UUID (AC-7)', async () => {
    const token = await createSession()
    mockCanonicalMovie()
    await createBookmarkHandler(
      createEvent({
        method: 'POST',
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
        body: { provider: 'TMDB', externalId: 101, mediaType: 'MOVIE' }
      })
    )
    const bookmark = await prisma.bookmark.findFirstOrThrow()

    await expect(
      deleteBookmarkHandler(
        createEvent({
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
          params: {
            provider: 'TMDB',
            externalId: bookmark.id,
            mediaType: 'MOVIE'
          }
        })
      )
    ).rejects.toMatchObject({ statusCode: 400 })
    await expect(prisma.bookmark.count()).resolves.toBe(1)
  })
})
