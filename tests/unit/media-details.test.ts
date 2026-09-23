import type { H3Event } from 'h3'
import { http, HttpResponse } from 'msw'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import detailsHandler from '../../server/api/media/[type]/[externalId].get'
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

function createEvent(type: string, externalId: string): H3Event {
  return {
    context: { params: { type, externalId } }
  } as unknown as H3Event
}

const movie = {
  id: 1,
  title: 'A Movie',
  release_date: '2024-01-01',
  poster_path: '/movie.jpg',
  backdrop_path: null,
  overview: 'Movie overview',
  vote_average: 9.9
}

const tv = {
  id: 2,
  name: 'A Series',
  first_air_date: '2022-01-01',
  poster_path: null,
  backdrop_path: '/tv.jpg',
  overview: 'TV overview',
  vote_average: 9.9
}

describe('media details route (TASK-BE-010)', () => {
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

  it('normalizes movie and TV details with configured-region ratings (AC-1, AC-2, AC-4)', async () => {
    mswServer.use(
      http.get(`${tmdbBaseUrl}/movie/1`, () => HttpResponse.json(movie)),
      http.get(`${tmdbBaseUrl}/movie/1/release_dates`, () =>
        HttpResponse.json({
          results: [
            { iso_3166_1: 'GB', release_dates: [{ certification: '12' }] },
            { iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }
          ]
        })
      ),
      http.get(`${tmdbBaseUrl}/tv/2`, () => HttpResponse.json(tv)),
      http.get(`${tmdbBaseUrl}/tv/2/content_ratings`, () =>
        HttpResponse.json({
          results: [{ iso_3166_1: 'US', rating: 'TV-14' }]
        })
      )
    )

    await expect(
      detailsHandler(createEvent('movie', '1'))
    ).resolves.toMatchObject({
      data: expect.objectContaining({
        mediaType: 'MOVIE',
        contentRating: 'PG-13'
      })
    })
    await expect(detailsHandler(createEvent('tv', '2'))).resolves.toMatchObject(
      {
        data: expect.objectContaining({
          mediaType: 'TV',
          contentRating: 'TV-14'
        })
      }
    )
  })

  it('returns null when configured-region certification is unavailable (AC-3)', async () => {
    mswServer.use(
      http.get(`${tmdbBaseUrl}/movie/1`, () => HttpResponse.json(movie)),
      http.get(`${tmdbBaseUrl}/movie/1/release_dates`, () =>
        HttpResponse.json({
          results: [{ iso_3166_1: 'GB', release_dates: [] }]
        })
      )
    )

    await expect(
      detailsHandler(createEvent('movie', '1'))
    ).resolves.toMatchObject({
      data: expect.objectContaining({ contentRating: null })
    })
  })

  it('rejects unsupported types and invalid IDs before provider calls (AC-5)', async () => {
    const providerRequest = vi.fn()
    mswServer.use(
      http.get(`${tmdbBaseUrl}/:path*`, () => {
        providerRequest()
        return HttpResponse.json({})
      })
    )

    await expect(
      detailsHandler(createEvent('person', '1'))
    ).rejects.toMatchObject({
      statusCode: 400,
      data: { code: 'INVALID_INPUT' }
    })
    await expect(
      detailsHandler(createEvent('movie', '0'))
    ).rejects.toMatchObject({
      statusCode: 400,
      data: { code: 'INVALID_INPUT' }
    })
    expect(providerRequest).not.toHaveBeenCalled()
  })

  it('maps missing media to 404 and preserves provider outages (AC-6)', async () => {
    mswServer.use(
      http.get(
        `${tmdbBaseUrl}/movie/1`,
        () => new HttpResponse(null, { status: 404 })
      ),
      http.get(
        `${tmdbBaseUrl}/tv/2`,
        () => new HttpResponse(null, { status: 500 })
      )
    )

    await expect(
      detailsHandler(createEvent('movie', '1'))
    ).rejects.toMatchObject({
      statusCode: 404,
      data: { code: 'NOT_FOUND' }
    })
    await expect(detailsHandler(createEvent('tv', '2'))).rejects.toMatchObject({
      statusCode: 502,
      data: { code: 'PROVIDER_UNAVAILABLE' }
    })
  })
})
