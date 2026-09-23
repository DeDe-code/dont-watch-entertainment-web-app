import type { H3Event } from 'h3'
import { http, HttpResponse } from 'msw'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import moviesHandler from '../../server/api/media/movies.get'
import searchHandler from '../../server/api/media/search.get'
import trendingHandler from '../../server/api/media/trending.get'
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
  params: Record<string, string> = {}
): H3Event {
  const url = new URL('http://localhost/api/media')
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value)
  return {
    path: `${url.pathname}${url.search}`,
    context: { params },
    node: { req: { url: `${url.pathname}${url.search}` } }
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

describe('media routes (TASK-BE-014)', () => {
  beforeAll(() => {
    ;(
      globalThis as unknown as { useRuntimeConfig: () => typeof runtimeConfig }
    ).useRuntimeConfig = () => runtimeConfig
  })

  afterAll(() => {
    delete (globalThis as { useRuntimeConfig?: unknown }).useRuntimeConfig
  })

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
      http.get(`${tmdbBaseUrl}/search/multi`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [{ ...movie, media_type: 'movie' }]
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
