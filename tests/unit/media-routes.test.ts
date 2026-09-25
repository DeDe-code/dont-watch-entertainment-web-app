import type { H3Event } from 'h3'
import { http, HttpResponse } from 'msw'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import moviesHandler from '../../server/api/media/movies.get'
import searchHandler from '../../server/api/media/search.get'
import trendingHandler from '../../server/api/media/trending.get'
import tvHandler from '../../server/api/media/tv.get'
import { mswServer } from '../setup/msw'

const tmdbBaseUrl = 'https://api.themoviedb.org/3'
const runtimeConfig = {
  databaseUrl: 'postgresql://test:test@localhost:5432/test',
  tmdbAccessToken: 'test-token',
  tmdbLanguage: 'en-US',
  tmdbRegion: 'US',
  tmdbRequestTimeoutMs: 1000,
  tmdbCacheTtlSeconds: 300,
  sessionTtlSeconds: 604800
}

function createEvent(query: Record<string, string> = {}): H3Event {
  const url = new URL('http://localhost/api/media')
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value)
  }

  return {
    path: `${url.pathname}${url.search}`,
    node: { req: { url: `${url.pathname}${url.search}` } }
  } as unknown as H3Event
}

const movie = {
  id: 1,
  title: 'A Movie',
  release_date: '2024-01-01',
  poster_path: '/movie.jpg',
  backdrop_path: null,
  overview: 'Movie overview'
}
const tv = {
  id: 2,
  name: 'A Series',
  first_air_date: '2022-01-01',
  poster_path: null,
  backdrop_path: '/tv.jpg',
  overview: 'TV overview'
}

describe('media routes (TASK-BE-009)', () => {
  beforeAll(() => {
    ;(
      globalThis as unknown as {
        useRuntimeConfig: () => typeof runtimeConfig
      }
    ).useRuntimeConfig = () => runtimeConfig
  })

  afterAll(() => {
    delete (globalThis as { useRuntimeConfig?: unknown }).useRuntimeConfig
  })

  it('returns normalized pages with correct discovery media types (AC-1, AC-2)', async () => {
    mswServer.use(
      http.get(`${tmdbBaseUrl}/discover/movie`, () =>
        HttpResponse.json({
          page: 2,
          total_pages: 4,
          total_results: 70,
          results: [movie]
        })
      ),
      http.get(`${tmdbBaseUrl}/discover/tv`, () =>
        HttpResponse.json({
          page: 2,
          total_pages: 4,
          total_results: 70,
          results: [tv]
        })
      )
    )

    await expect(moviesHandler(createEvent({ page: '2' }))).resolves.toEqual({
      data: [
        expect.objectContaining({ mediaType: 'MOVIE', isTrending: false })
      ],
      meta: { page: 2, totalPages: 4, totalResults: 70 }
    })
    await expect(tvHandler(createEvent({ page: '2' }))).resolves.toEqual({
      data: [expect.objectContaining({ mediaType: 'TV', isTrending: false })],
      meta: { page: 2, totalPages: 4, totalResults: 70 }
    })
  })

  it('filters people from search results and returns the normalized page (AC-1, AC-3)', async () => {
    mswServer.use(
      http.get(`${tmdbBaseUrl}/search/multi`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 3,
          results: [
            { ...movie, media_type: 'movie' },
            { ...tv, media_type: 'tv' },
            { id: 3, name: 'A Person', media_type: 'person' }
          ]
        })
      )
    )

    const response = await searchHandler(createEvent({ q: 'space' }))

    expect(response).toMatchObject({
      meta: { page: 1, totalPages: 1, totalResults: 3 }
    })
    expect((response as { data: Array<{ mediaType: string }> }).data).toEqual([
      expect.objectContaining({ mediaType: 'MOVIE' }),
      expect.objectContaining({ mediaType: 'TV' })
    ])
  })

  it('rejects invalid page and query input before a provider call (AC-4)', async () => {
    const providerRequest = vi.fn()
    mswServer.use(
      http.get(`${tmdbBaseUrl}/:path*`, () => {
        providerRequest()
        return HttpResponse.json({})
      })
    )

    await expect(
      moviesHandler(createEvent({ page: '0' }))
    ).rejects.toMatchObject({
      statusCode: 400,
      data: { code: 'INVALID_INPUT' }
    })
    await expect(searchHandler(createEvent({ q: ' ' }))).rejects.toMatchObject({
      statusCode: 400,
      data: { code: 'INVALID_INPUT' }
    })
    expect(providerRequest).not.toHaveBeenCalled()
  })

  it('sets trending only from the trending response context (AC-5)', async () => {
    mswServer.use(
      http.get(`${tmdbBaseUrl}/trending/all/day`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 2,
          results: [
            { ...movie, media_type: 'movie' },
            { ...tv, media_type: 'tv' }
          ]
        })
      )
    )

    await expect(trendingHandler(createEvent())).resolves.toMatchObject({
      data: [
        { externalId: movie.id, isTrending: true },
        { externalId: tv.id, isTrending: true }
      ]
    })
  })

  it('enriches list items, isolates rating failures, and preserves provider objects', async () => {
    const providerItems = [movie, { ...movie, id: 3 }]
    let ratingCalls = 0
    mswServer.use(
      http.get(`${tmdbBaseUrl}/discover/movie`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: 2,
          results: providerItems
        })
      ),
      http.get(`${tmdbBaseUrl}/movie/1/release_dates`, () => {
        ratingCalls += 1
        return HttpResponse.json({
          results: [
            { iso_3166_1: 'US', release_dates: [{ certification: 'R' }] }
          ]
        })
      }),
      http.get(`${tmdbBaseUrl}/movie/3/release_dates`, () => {
        ratingCalls += 1
        return new HttpResponse(null, { status: 500 })
      })
    )

    const result = await moviesHandler(createEvent())

    expect(result.data).toEqual([
      expect.objectContaining({ externalId: 1, contentRating: 'R' }),
      expect.objectContaining({ externalId: 3, contentRating: null })
    ])
    expect(providerItems[0]).not.toHaveProperty('contentRating')
    expect(ratingCalls).toBe(4)
  })

  it('limits concurrent rating lookups to five', async () => {
    let active = 0
    let maximum = 0
    const results = Array.from({ length: 12 }, (_, index) => ({
      ...movie,
      id: index + 10
    }))
    mswServer.use(
      http.get(`${tmdbBaseUrl}/discover/movie`, () =>
        HttpResponse.json({
          page: 1,
          total_pages: 1,
          total_results: results.length,
          results
        })
      ),
      http.get(`${tmdbBaseUrl}/movie/:id/release_dates`, async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return HttpResponse.json({ results: [] })
      })
    )

    await moviesHandler(createEvent())

    expect(maximum).toBe(5)
  })
})
