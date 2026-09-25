import type { RuntimeConfig } from '../utils/runtime-config'
import {
  mediaPageQuerySchema,
  mediaPathSchema,
  mediaSearchQuerySchema
} from '../utils/contracts'
import type { MediaItem, ProviderIdentity } from '../../shared/contracts'
import { ApplicationError, ProviderError } from '../utils/errors'
import { validateQuery, validatePath } from '../utils/validation'
import { createTmdbClient } from '../providers/tmdb/client'
import { createBookmarkService } from './bookmarks'
import { prisma } from '../utils/prisma'

export function createMediaService(config: RuntimeConfig) {
  const tmdb = createTmdbClient(config)
  const bookmarks = createBookmarkService(prisma)

  async function enrichMedia(
    media: MediaItem[],
    userId: string | undefined
  ): Promise<MediaItem[]> {
    if (!userId || media.length === 0) {
      return media.map((item) => ({ ...item, isBookmarked: false }))
    }

    const identities: ProviderIdentity[] = media.map((item) => ({
      provider: 'TMDB',
      externalId: item.externalId,
      mediaType: item.mediaType
    }))
    const bookmarked = await bookmarks.findBookmarkedIdentities(
      userId,
      identities
    )

    return media.map((item) => ({
      ...item,
      isBookmarked: bookmarked.has(`TMDB:${item.externalId}:${item.mediaType}`)
    }))
  }

  return {
    async trending(query: unknown, userId?: string) {
      const { page } = validateQuery(mediaPageQuerySchema, query)
      const result = await tmdb.trending(page)
      return { ...result, data: await enrichMedia(result.data, userId) }
    },
    async movies(query: unknown, userId?: string) {
      const { page } = validateQuery(mediaPageQuerySchema, query)
      const result = await tmdb.discoverMovies(page)
      return { ...result, data: await enrichMedia(result.data, userId) }
    },
    async tv(query: unknown, userId?: string) {
      const { page } = validateQuery(mediaPageQuerySchema, query)
      const result = await tmdb.discoverTv(page)
      return { ...result, data: await enrichMedia(result.data, userId) }
    },
    async search(query: unknown, userId?: string) {
      const { page, q } = validateQuery(mediaSearchQuerySchema, query)
      const result = await tmdb.searchMulti(q, page)
      return { ...result, data: await enrichMedia(result.data, userId) }
    },
    async details(path: unknown, userId?: string) {
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

        const [data] = await enrichMedia(
          [{ ...media, contentRating: contentRating?.trim() || null }],
          userId
        )
        return { data }
      } catch (error) {
        if (error instanceof ProviderError && error.code === 'NOT_FOUND') {
          throw ApplicationError.notFound()
        }
        throw error
      }
    }
  }
}
