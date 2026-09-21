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
  'tmdbAccessToken' | 'tmdbLanguage' | 'tmdbRegion' | 'tmdbRequestTimeoutMs'
>
type FetchLike = typeof fetch

const baseUrl = 'https://api.themoviedb.org/3'

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
  async function get<T>(
    path: string,
    params: Record<string, string> = {},
    parser: (value: unknown) => T
  ): Promise<T> {
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
        throw new ProviderError('Provider resource was not found', 'NOT_FOUND')
      }
      if (response.status === 429) {
        throw new ProviderError('Provider rate limit exceeded', 'RATE_LIMITED')
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

      return parser(body)
    } finally {
      clearTimeout(timeout)
    }
  }

  const page = (path: string, mediaType: 'MOVIE' | 'TV', pageNumber = 1) =>
    get(path, { page: String(pageNumber) }, parsePage).then((result) =>
      normalizePage(result, mediaType)
    )

  return {
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
