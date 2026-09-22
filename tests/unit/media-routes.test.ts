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
})
