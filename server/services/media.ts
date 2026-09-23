import type { RuntimeConfig } from '../utils/runtime-config'
import {
  mediaPageQuerySchema,
  mediaPathSchema,
  mediaSearchQuerySchema
} from '../utils/contracts'
import { ApplicationError, ProviderError } from '../utils/errors'
import { validateQuery, validatePath } from '../utils/validation'
import { createTmdbClient } from '../providers/tmdb/client'

export function createMediaService(config: RuntimeConfig) {
  const tmdb = createTmdbClient(config)

  return {
    trending(query: unknown) {
      const { page } = validateQuery(mediaPageQuerySchema, query)
      return tmdb.trending(page)
    },
    movies(query: unknown) {
      const { page } = validateQuery(mediaPageQuerySchema, query)
      return tmdb.discoverMovies(page)
    },
    tv(query: unknown) {
      const { page } = validateQuery(mediaPageQuerySchema, query)
      return tmdb.discoverTv(page)
    },
    search(query: unknown) {
      const { page, q } = validateQuery(mediaSearchQuerySchema, query)
      return tmdb.searchMulti(q, page)
    },
    async details(path: unknown) {
      const { type, externalId } = validatePath(mediaPathSchema, path)

      try {
        const [media, ratings] = await Promise.all([
          type === 'MOVIE'
            ? tmdb.movieDetails(externalId)
            : tmdb.tvDetails(externalId),
          type === 'MOVIE'
            ? tmdb.movieRatings(externalId)
            : tmdb.tvRatings(externalId)
        ])
        const regionalRating = ratings.results.find(
          (result) => result.iso_3166_1 === config.tmdbRegion
        )
        const contentRating =
          regionalRating?.release_dates?.find((release) =>
            release.certification?.trim()
          )?.certification ??
          regionalRating?.rating ??
          null

        return {
          data: {
            ...media,
            contentRating: contentRating?.trim() || null
          }
        }
      } catch (error) {
        if (error instanceof ProviderError && error.code === 'NOT_FOUND') {
          throw ApplicationError.notFound()
        }
        throw error
      }
    }
  }
}
