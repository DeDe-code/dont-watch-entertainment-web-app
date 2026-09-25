import type { RuntimeConfig } from '../../utils/runtime-config'
import { ProviderError } from '../../utils/errors'
import {
  normalizeMedia,
  normalizePage,
  normalizeSearchPage
} from './normalizer'
import type {
  TmdbClient,
  TmdbPage,
  TmdbRatingResponse,
  TmdbResult
} from './types'

type TmdbConfig = Pick<
  RuntimeConfig,
  | 'tmdbAccessToken'
  | 'tmdbLanguage'
  | 'tmdbRegion'
  | 'tmdbRequestTimeoutMs'
  | 'tmdbCacheTtlSeconds'
>
type FetchLike = typeof fetch
type CacheEntry = { expiresAt: number; value: unknown }
type RatingCacheEntry = { expiresAt: number; value: string | null }

const baseUrl = 'https://api.themoviedb.org/3'
const maxAttempts = 3

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseResult(value: unknown): TmdbResult {
  if (!isRecord(value) || typeof value.id !== 'number') {
    throw new ProviderError(
      'Provider returned an invalid response',
      'INVALID_RESPONSE'
    )
  }

  return value as TmdbResult
}

function parsePage(value: unknown): TmdbPage {
  if (
    !isRecord(value) ||
    typeof value.page !== 'number' ||
    typeof value.total_pages !== 'number' ||
    typeof value.total_results !== 'number' ||
    !Array.isArray(value.results)
  ) {
    throw new ProviderError(
      'Provider returned an invalid response',
      'INVALID_RESPONSE'
    )
  }

  return {
    page: value.page,
    total_pages: value.total_pages,
    total_results: value.total_results,
    results: value.results.map(parseResult)
  }
}

function parseRatings(value: unknown): TmdbRatingResponse {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new ProviderError(
      'Provider returned an invalid response',
      'INVALID_RESPONSE'
    )
  }

  return value as TmdbRatingResponse
}

export function createTmdbClient(
  config: TmdbConfig,
  request: FetchLike = fetch
): TmdbClient {
  const cache = new Map<string, CacheEntry>()
  const ratingCache = new Map<string, RatingCacheEntry>()
  const inFlight = new Map<string, Promise<unknown>>()

  function cacheKey(path: string, params: Record<string, string>): string {
    const query = new URLSearchParams({
      language: config.tmdbLanguage,
      region: config.tmdbRegion,
      ...params
    })
    return `${path}?${query.toString()}`
  }

  function shouldRetry(error: unknown): boolean {
    return (
      error instanceof ProviderError &&
      ['TIMEOUT', 'UPSTREAM', 'RATE_LIMITED'].includes(error.code)
    )
  }

  async function get<T>(
    path: string,
    params: Record<string, string> = {},
    parser: (value: unknown) => T
  ): Promise<T> {
    const key = cacheKey(path, params)
    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T
    }
    cache.delete(key)

    const existing = inFlight.get(key)
    if (existing) {
      return existing as Promise<T>
    }

    const operation = (async () => {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const query = new URLSearchParams({
          language: config.tmdbLanguage,
          region: config.tmdbRegion,
          ...params
        })
        const controller = new AbortController()
        const timeout = setTimeout(
          () => controller.abort(),
          config.tmdbRequestTimeoutMs
        )

        try {
          let response: Response
          try {
            response = await request(`${baseUrl}${path}?${query}`, {
              headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${config.tmdbAccessToken}`
              },
              signal: controller.signal
            })
          } catch {
            if (controller.signal.aborted) {
              throw new ProviderError('Provider request timed out', 'TIMEOUT')
            }
            throw new ProviderError('Provider request failed', 'UPSTREAM')
          }

          if (response.status === 401 || response.status === 403) {
            throw new ProviderError(
              'Provider authentication failed',
              'AUTHENTICATION'
            )
          }
          if (response.status === 404) {
            throw new ProviderError(
              'Provider resource was not found',
              'NOT_FOUND'
            )
          }
          if (response.status === 429) {
            throw new ProviderError(
              'Provider rate limit exceeded',
              'RATE_LIMITED'
            )
          }
          if (!response.ok || response.status >= 500) {
            throw new ProviderError('Provider request failed', 'UPSTREAM')
          }

          let body: unknown
          try {
            body = await response.json()
          } catch {
            throw new ProviderError(
              'Provider returned malformed JSON',
              'INVALID_RESPONSE'
            )
          }

          const value = parser(body)
          if (config.tmdbCacheTtlSeconds > 0) {
            cache.set(key, {
              value,
              expiresAt: Date.now() + config.tmdbCacheTtlSeconds * 1000
            })
          }
          return value
        } catch (error) {
          if (attempt === maxAttempts || !shouldRetry(error)) {
            throw error
          }
        } finally {
          clearTimeout(timeout)
        }
      }
      throw new ProviderError('Provider request failed', 'UPSTREAM')
    })()
    inFlight.set(key, operation)
    try {
      return (await operation) as T
    } finally {
      inFlight.delete(key)
    }
  }

  const page = (path: string, mediaType: 'MOVIE' | 'TV', pageNumber = 1) =>
    get(path, { page: String(pageNumber) }, parsePage).then((result) =>
      normalizePage(result, mediaType)
    )

  return {
    resolveContentRating: async (mediaType, id) => {
      const key = `${mediaType}:${id}`
      const cached = ratingCache.get(key)
      if (cached && cached.expiresAt > Date.now()) return cached.value
      ratingCache.delete(key)

      const ratings =
        mediaType === 'MOVIE'
          ? await get(`/movie/${id}/release_dates`, {}, parseRatings)
          : await get(`/tv/${id}/content_ratings`, {}, parseRatings)
      const regionalRating = ratings.results.find(
        (result) => result.iso_3166_1 === config.tmdbRegion
      )
      const value =
        regionalRating?.release_dates?.find((release) =>
          release.certification?.trim()
        )?.certification ??
        regionalRating?.rating ??
        null
      const normalized = value?.trim() || null
      ratingCache.set(key, {
        value: normalized,
        expiresAt:
          Date.now() + (normalized ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000)
      })
      return normalized
    },
    trending: (pageNumber = 1) =>
      get('/trending/all/day', { page: String(pageNumber) }, parsePage).then(
        (result) => {
          const normalized = result.results
            .filter(
              (item) => item.media_type === 'movie' || item.media_type === 'tv'
            )
            .map((item) =>
              normalizeMedia(
                item,
                item.media_type === 'movie' ? 'MOVIE' : 'TV',
                true
              )
            )
          return {
            data: normalized,
            meta: {
              page: result.page,
              totalPages: result.total_pages,
              totalResults: result.total_results
            }
          }
        }
      ),
    discoverMovies: (pageNumber = 1) =>
      page('/discover/movie', 'MOVIE', pageNumber),
    discoverTv: (pageNumber = 1) => page('/discover/tv', 'TV', pageNumber),
    searchMulti: (query, pageNumber = 1) =>
      get('/search/multi', { query, page: String(pageNumber) }, parsePage).then(
        normalizeSearchPage
      ),
    movieDetails: (id) =>
      get(`/movie/${id}`, {}, parseResult).then((result) =>
        normalizeMedia(result, 'MOVIE')
      ),
    tvDetails: (id) =>
      get(`/tv/${id}`, {}, parseResult).then((result) =>
        normalizeMedia(result, 'TV')
      ),
    movieRatings: (id) => get(`/movie/${id}/release_dates`, {}, parseRatings),
    tvRatings: (id) => get(`/tv/${id}/content_ratings`, {}, parseRatings)
  }
}
