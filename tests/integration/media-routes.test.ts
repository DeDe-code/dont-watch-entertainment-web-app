import type { H3Event } from 'h3'
import { PrismaClient } from '@prisma/client'
import type { Client } from 'pg'
import { http, HttpResponse } from 'msw'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'
import { createUserInput } from '../factories/user.factory'
import {
  connectTestDatabase,
  resetTestDatabase
} from '../setup/database-client'
import { createSession as createAuthSession } from '../../server/utils/auth'
import { prisma as applicationPrisma } from '../../server/utils/prisma'
import moviesHandler from '../../server/api/media/movies.get'
import searchHandler from '../../server/api/media/search.get'
import trendingHandler from '../../server/api/media/trending.get'
import recommendedHandler from '../../server/api/media/recommended.get'
import detailsHandler from '../../server/api/media/[type]/[externalId].get'
import { mswServer } from '../setup/msw'

const tmdbBaseUrl = 'https://api.themoviedb.org/3'
const runtimeConfig = {
  databaseUrl: process.env.TEST_DATABASE_URL,
  tmdbAccessToken: 'integration-test-token',
  tmdbLanguage: 'en-US',
  tmdbRegion: 'US',
  tmdbRequestTimeoutMs: 1000,
  tmdbCacheTtlSeconds: 300,
  sessionTtlSeconds: 604800
}

function createEvent(
  query: Record<string, string> = {},
  params: Record<string, string> = {},
  cookie?: string,
  body?: unknown
): H3Event {
  const url = new URL('http://localhost/api/media')
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value)
  const responseHeaders = new Map<string, string | string[]>()
  return {
    path: `${url.pathname}${url.search}`,
    context: { params },
    node: {
      req: {
        method: 'POST',
        url: `${url.pathname}${url.search}`,
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        }
      },
      res: {
        statusCode: 200,
        getHeader: (name: string) => responseHeaders.get(name.toLowerCase()),
        setHeader: (name: string, value: string | string[]) =>
          responseHeaders.set(name.toLowerCase(), value),
        appendHeader: (name: string, value: string) =>
          responseHeaders.set(name.toLowerCase(), value),
        removeHeader: (name: string) =>
          responseHeaders.delete(name.toLowerCase())
      }
    },
    _requestBody: body
  } as unknown as H3Event
}

const movie = {
  id: 101,
  title: 'Integration Movie',
  release_date: '2024-01-01',
  poster_path: '/movie.jpg',
  backdrop_path: null,
  overview: 'Deterministic fixture'
}

const SESSION_COOKIE_NAME = 'dont-watch-session'

async function createSession(): Promise<{ token: string; userId: string }> {
  const input = createUserInput()
  const user = await applicationPrisma.user.create({
    data: { email: input.email, passwordHash: 'integration-test-hash' }
  })
  const session = await createAuthSession(user.id, 604800, applicationPrisma)
  return { token: session.token, userId: user.id }
}

async function createBookmarkSnapshot(
  prisma: PrismaClient,
  userId: string,
  externalId: number,
  mediaType: 'MOVIE' | 'TV',
  createdAt: Date
) {
  const reference = await prisma.mediaReference.create({
    data: {
      provider: 'TMDB',
      externalId: String(externalId),
      mediaType,
      titleSnapshot: `${mediaType} ${externalId}`
    }
  })
  await prisma.bookmark.create({
    data: { userId, mediaReferenceId: reference.id, createdAt }
  })
}

describe('media routes (TASK-BE-014)', () => {
  let dbClient: Client
  let prisma: PrismaClient

  beforeAll(() => {
    ;(
      globalThis as unknown as { useRuntimeConfig: () => typeof runtimeConfig }
    ).useRuntimeConfig = () => runtimeConfig
  })

  afterAll(async () => {
    delete (globalThis as { useRuntimeConfig?: unknown }).useRuntimeConfig
    await prisma?.$disconnect()
    await dbClient?.end()
  })

  beforeAll(async () => {
    dbClient = await connectTestDatabase()
    prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
  })

  beforeEach(async () => resetTestDatabase(dbClient))

  it('covers discovery, search, trending, and details through mocked TMDB', async () => {
    mswServer.use(
      http.get(`${tmdbBaseUrl}/discover/movie`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [movie]
        })
      ),
      http.get(`${tmdbBaseUrl}/search/movie`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [movie]
        })
      ),
      http.get(`${tmdbBaseUrl}/search/tv`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 0,
          results: []
        })
      ),
      http.get(`${tmdbBaseUrl}/trending/all/day`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [{ ...movie, media_type: 'movie' }]
        })
      ),
      http.get(`${tmdbBaseUrl}/movie/101`, () => HttpResponse.json(movie)),
      http.get(`${tmdbBaseUrl}/movie/101/release_dates`, () =>
        HttpResponse.json({
          results: [
            { iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }
          ]
        })
      )
    )

    await expect(moviesHandler(createEvent())).resolves.toMatchObject({
      data: [{ mediaType: 'MOVIE' }]
    })
    await expect(
      searchHandler(createEvent({ q: 'integration' }))
    ).resolves.toMatchObject({ data: [{ externalId: 101 }] })
    await expect(trendingHandler(createEvent())).resolves.toMatchObject({
      data: [{ isTrending: true }]
    })
    await expect(
      detailsHandler(createEvent({}, { type: 'movie', externalId: '101' }))
    ).resolves.toMatchObject({ data: { contentRating: 'PG-13' } })
  })

  it('validates requests before TMDB', async () => {
    const providerRequest = vi.fn()
    mswServer.use(
      http.get(`${tmdbBaseUrl}/discover/movie`, () => {
        providerRequest()
        return HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [movie]
        })
      })
    )

    await expect(
      moviesHandler(createEvent({ page: '0' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    await moviesHandler(createEvent({ page: '1' }))
    expect(providerRequest).toHaveBeenCalledTimes(1)
  })

  it('returns deterministic mixed discovery recommendations for anonymous users', async () => {
    const requests: string[] = []
    mswServer.use(
      http.get(`${tmdbBaseUrl}/discover/movie`, ({ request }) => {
        requests.push(request.url)
        return HttpResponse.json({
          page: 2,
          total_pages: 4,
          total_results: 4,
          results: [movie, { ...movie, id: 103, title: 'Movie Two' }]
        })
      }),
      http.get(`${tmdbBaseUrl}/discover/tv`, ({ request }) => {
        requests.push(request.url)
        return HttpResponse.json({
          page: 2,
          total_pages: 3,
          total_results: 3,
          results: [
            { ...movie, id: 102, name: 'TV One', title: undefined },
            { ...movie, id: 103, name: 'TV Two', title: undefined }
          ]
        })
      }),
      http.get(`${tmdbBaseUrl}/movie/:id/release_dates`, () =>
        HttpResponse.json({ results: [] })
      ),
      http.get(`${tmdbBaseUrl}/tv/:id/content_ratings`, () =>
        HttpResponse.json({ results: [] })
      )
    )

    await expect(
      recommendedHandler(createEvent({ page: '2' }))
    ).resolves.toMatchObject({
      data: [
        { externalId: 101, mediaType: 'MOVIE' },
        { externalId: 102, mediaType: 'TV' },
        { externalId: 103, mediaType: 'MOVIE' },
        { externalId: 103, mediaType: 'TV' }
      ],
      meta: { page: 2, totalPages: 4 }
    })
    expect(requests).toHaveLength(2)
    expect(requests.every((url) => url.includes('page=2'))).toBe(true)
  })

  it('uses recent authenticated bookmark seeds with bounded round-robin recommendations', async () => {
    const session = await createSession()
    const now = Date.now()
    await createBookmarkSnapshot(
      prisma,
      session.userId,
      1,
      'MOVIE',
      new Date(now - 4000)
    )
    await createBookmarkSnapshot(
      prisma,
      session.userId,
      2,
      'TV',
      new Date(now - 3000)
    )
    await createBookmarkSnapshot(
      prisma,
      session.userId,
      3,
      'MOVIE',
      new Date(now - 2000)
    )
    await createBookmarkSnapshot(
      prisma,
      session.userId,
      4,
      'TV',
      new Date(now - 1000)
    )

    const requestedUrls: string[] = []
    mswServer.use(
      http.get(
        `${tmdbBaseUrl}/movie/:id/recommendations`,
        ({ request, params }) => {
          requestedUrls.push(request.url)
          const id = Number(params.id)
          return HttpResponse.json({
            page: 2,
            total_pages: 3,
            total_results: 3,
            results: [
              { ...movie, id, title: `Seed ${id}` },
              { ...movie, id: 900, title: 'Shared Movie' },
              { ...movie, id: 901, title: `Movie ${id}` }
            ]
          })
        }
      ),
      http.get(
        `${tmdbBaseUrl}/tv/:id/recommendations`,
        ({ request, params }) => {
          requestedUrls.push(request.url)
          const id = Number(params.id)
          return HttpResponse.json({
            page: 2,
            total_pages: 4,
            total_results: 3,
            results: [
              { ...movie, id, name: `Seed ${id}`, title: undefined },
              { ...movie, id: 900, name: 'Shared TV', title: undefined },
              { ...movie, id: 902, name: `TV ${id}`, title: undefined }
            ]
          })
        }
      ),
      http.get(`${tmdbBaseUrl}/movie/:id/release_dates`, () =>
        HttpResponse.json({ results: [] })
      ),
      http.get(`${tmdbBaseUrl}/tv/:id/content_ratings`, () =>
        HttpResponse.json({ results: [] })
      )
    )

    const response = await recommendedHandler(
      createEvent({ page: '2' }, {}, `${SESSION_COOKIE_NAME}=${session.token}`)
    )
    expect(requestedUrls).toHaveLength(3)
    expect(requestedUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/movie/3/recommendations?'),
        expect.stringContaining('/tv/4/recommendations?'),
        expect.stringContaining('/tv/2/recommendations?')
      ])
    )
    expect(requestedUrls.every((url) => url.includes('page=2'))).toBe(true)
    expect(response).toMatchObject({
      data: [
        { externalId: 900, mediaType: 'TV' },
        { externalId: 900, mediaType: 'MOVIE' },
        { externalId: 902, mediaType: 'TV' },
        { externalId: 901, mediaType: 'MOVIE' }
      ],
      meta: { page: 2, totalPages: 4 }
    })
  })

  it('keeps bookmark enrichment scoped to the authenticated user', async () => {
    const first = await createSession()
    const second = await createSession()
    await createBookmarkSnapshot(
      prisma,
      first.userId,
      50,
      'MOVIE',
      new Date(Date.now() - 1000)
    )
    await createBookmarkSnapshot(
      prisma,
      second.userId,
      60,
      'MOVIE',
      new Date(Date.now() - 1000)
    )
    await createBookmarkSnapshot(
      prisma,
      second.userId,
      61,
      'MOVIE',
      new Date(Date.now() - 1500)
    )
    await createBookmarkSnapshot(
      prisma,
      second.userId,
      62,
      'MOVIE',
      new Date(Date.now() - 1750)
    )
    await createBookmarkSnapshot(
      prisma,
      second.userId,
      52,
      'MOVIE',
      new Date(Date.now() - 2000)
    )
    mswServer.use(
      http.get(`${tmdbBaseUrl}/movie/50/recommendations`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [{ ...movie, id: 52 }]
        })
      ),
      http.get(`${tmdbBaseUrl}/movie/60/recommendations`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [{ ...movie, id: 52 }]
        })
      ),
      http.get(`${tmdbBaseUrl}/movie/61/recommendations`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [{ ...movie, id: 52 }]
        })
      ),
      http.get(`${tmdbBaseUrl}/movie/62/recommendations`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [{ ...movie, id: 52 }]
        })
      ),
      http.get(`${tmdbBaseUrl}/movie/52/recommendations`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [{ ...movie, id: 53 }]
        })
      ),
      http.get(`${tmdbBaseUrl}/movie/:id/release_dates`, () =>
        HttpResponse.json({ results: [] })
      )
    )

    const firstResponse = await recommendedHandler(
      createEvent({}, {}, `${SESSION_COOKIE_NAME}=${first.token}`)
    )
    const secondResponse = await recommendedHandler(
      createEvent({}, {}, `${SESSION_COOKIE_NAME}=${second.token}`)
    )
    expect(firstResponse.data[0]).toMatchObject({
      externalId: 52,
      isBookmarked: false
    })
    expect(secondResponse.data[0]).toMatchObject({
      externalId: 52,
      isBookmarked: true
    })
  })

  it('uses the safe provider error contract for authenticated recommendations', async () => {
    const session = await createSession()
    await createBookmarkSnapshot(prisma, session.userId, 70, 'TV', new Date())
    mswServer.use(
      http.get(`${tmdbBaseUrl}/tv/70/recommendations`, () =>
        HttpResponse.json(
          { status_message: 'upstream secret' },
          { status: 503 }
        )
      )
    )

    await expect(
      recommendedHandler(
        createEvent({}, {}, `${SESSION_COOKIE_NAME}=${session.token}`)
      )
    ).rejects.toMatchObject({
      statusMessage: 'The media provider is unavailable',
      data: { code: 'PROVIDER_UNAVAILABLE' }
    })
  })

  it('rejects an invalid recommendation page before calling the provider', async () => {
    const providerRequest = vi.fn()
    mswServer.use(
      http.get(`${tmdbBaseUrl}/discover/movie`, () => {
        providerRequest()
        return HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 0,
          results: []
        })
      })
    )

    await expect(
      recommendedHandler(createEvent({ page: '0' }))
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(providerRequest).not.toHaveBeenCalled()
  })

  it('redacts provider credentials and upstream details from HTTP errors', async () => {
    mswServer.use(
      http.get(`${tmdbBaseUrl}/discover/movie`, () =>
        HttpResponse.json(
          { status_message: 'token=integration-test-token stack trace' },
          { status: 503 }
        )
      )
    )

    const failure = await moviesHandler(createEvent()).catch(
      (error: unknown) => error as { statusMessage?: string; data?: unknown }
    )
    expect(failure).toMatchObject({
      statusMessage: 'The media provider is unavailable',
      data: { code: 'PROVIDER_UNAVAILABLE' }
    })
    expect(JSON.stringify(failure)).not.toContain('integration-test-token')
    expect(JSON.stringify(failure)).not.toContain('stack trace')
  })
})
