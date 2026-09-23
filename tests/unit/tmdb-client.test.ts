import { describe, expect, it, vi } from 'vitest'
import { createTmdbClient } from '../../server/providers/tmdb/client'
import { ProviderError } from '../../server/utils/errors'

const config = {
  tmdbAccessToken: 'secret-token',
  tmdbLanguage: 'en-US',
  tmdbRegion: 'US',
  tmdbRequestTimeoutMs: 20
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
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
  first_air_date: '',
  poster_path: null,
  backdrop_path: '/tv.jpg',
  overview: ''
}

describe('TMDB client', () => {
  it('normalizes movie and TV payloads to the shared contract', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [movie]
        })
      )
      .mockResolvedValueOnce(
        response({ page: 1, total_pages: 1, total_results: 1, results: [tv] })
      )
    const client = createTmdbClient(config, request)

    await expect(client.discoverMovies()).resolves.toMatchObject({
      data: [
        {
          externalId: 1,
          mediaType: 'MOVIE',
          title: 'A Movie',
          year: 2024,
          posterPath: '/movie.jpg'
        }
      ],
      meta: { page: 1, totalPages: 1, totalResults: 1 }
    })
    await expect(client.discoverTv()).resolves.toMatchObject({
      data: [
        {
          externalId: 2,
          mediaType: 'TV',
          title: 'A Series',
          year: null,
          posterPath: null,
          backdropPath: '/tv.jpg',
          overview: null
        }
      ]
    })
  })
  it('accepts provider total pages above the client request limit', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        page: 1,
        total_pages: 1001,
        total_results: 20001,
        results: [tv]
      })
    )

    const result = await createTmdbClient(config, request).discoverTv()

    expect(result.meta).toEqual({
      page: 1,
      totalPages: 1001,
      totalResults: 20001
    })
  })
  it('filters people and unsupported media from multi-search', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        page: 2,
        total_pages: 4,
        total_results: 30,
        results: [
          { ...movie, media_type: 'movie' },
          { ...tv, media_type: 'tv' },
          { id: 3, name: 'A Person', media_type: 'person' },
          { id: 4, title: 'Unsupported', media_type: 'collection' }
        ]
      })
    )
    const result = await createTmdbClient(config, request).searchMulti(
      'space',
      2
    )

    expect(result.data.map((item) => item.mediaType)).toEqual(['MOVIE', 'TV'])
    expect(result.meta).toEqual({ page: 2, totalPages: 4, totalResults: 30 })
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer secret-token' }
    })
  })

  it.each([
    [401, 'AUTHENTICATION'],
    [403, 'AUTHENTICATION'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [500, 'UPSTREAM']
  ] as const)('classifies HTTP %i as %s', async (status, code) => {
    const client = createTmdbClient(
      config,
      vi.fn<typeof fetch>().mockResolvedValue(response({}, status))
    )

    await expect(client.movieDetails(1)).rejects.toMatchObject({ code })
  })

  it('classifies malformed JSON and invalid payloads without exposing the token', async () => {
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not-json', { status: 200 }))
    const invalid = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ results: [] }))

    await expect(
      createTmdbClient(config, malformed).movieDetails(1)
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    })
    await expect(
      createTmdbClient(config, invalid).movieDetails(1)
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    })
    await expect(
      createTmdbClient(config, malformed).movieDetails(1)
    ).rejects.not.toThrow('secret-token')
  })

  it('classifies finite request timeouts', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted'))
          )
        })
    )

    await expect(createTmdbClient(config, request).trending()).rejects.toEqual(
      new ProviderError('Provider request timed out', 'TIMEOUT')
    )
  })
})
