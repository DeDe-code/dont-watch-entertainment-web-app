import type { RuntimeConfig } from '../utils/runtime-config'
import {
  mediaPageQuerySchema,
  mediaSearchQuerySchema
} from '../utils/contracts'
import { validateQuery } from '../utils/validation'
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
    }
  }
}
