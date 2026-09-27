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

  async function enrichRatings(media: MediaItem[]): Promise<MediaItem[]> {
    const enriched = new Array<MediaItem>(media.length)
    let nextIndex = 0
    async function worker() {
      while (true) {
        const index = nextIndex++
        if (index >= media.length) return
        const item = media[index]
        if (!item) return
        try {
          enriched[index] = {
            ...item,
            contentRating: await tmdb.resolveContentRating(
              item.mediaType,
              item.externalId
            )
          }
        } catch {
          enriched[index] = { ...item, contentRating: null }
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(5, media.length) }, () => worker())
    )
    return enriched
  }

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
    async resolveBookmarkMedia(identity: ProviderIdentity): Promise<MediaItem> {
      const [media, contentRating] = await Promise.all([
        identity.mediaType === 'MOVIE'
          ? tmdb.movieDetails(identity.externalId)
          : tmdb.tvDetails(identity.externalId),
        tmdb.resolveContentRating(identity.mediaType, identity.externalId)
      ])

      return { ...media, contentRating: contentRating?.trim() || null }
    },
    async trending(query: unknown, userId?: string) {
      const { page } = validateQuery(mediaPageQuerySchema, query)
      const result = await tmdb.trending(page)
      return {
        ...result,
        data: await enrichMedia(await enrichRatings(result.data), userId)
      }
    },
    async movies(query: unknown, userId?: string) {
      const { page } = validateQuery(mediaPageQuerySchema, query)
      const result = await tmdb.discoverMovies(page)
      return {
        ...result,
        data: await enrichMedia(await enrichRatings(result.data), userId)
      }
    },
    async tv(query: unknown, userId?: string) {
      const { page } = validateQuery(mediaPageQuerySchema, query)
      const result = await tmdb.discoverTv(page)
      return {
        ...result,
        data: await enrichMedia(await enrichRatings(result.data), userId)
      }
    },
    async recommended(query: unknown, userId?: string) {
      const { page } = validateQuery(mediaPageQuerySchema, query)
      const seeds = userId
        ? await bookmarks.listRecentIdentities(userId, 3)
        : []
      const streams = seeds.length
        ? await Promise.all(
            seeds.map((seed) =>
              seed.mediaType === 'MOVIE'
                ? tmdb.movieRecommendations(seed.externalId, page)
                : tmdb.tvRecommendations(seed.externalId, page)
            )
          )
        : await Promise.all([tmdb.discoverMovies(page), tmdb.discoverTv(page)])
      const seedKeys = new Set(
        seeds.map(
          (seed) => `${seed.provider}:${seed.externalId}:${seed.mediaType}`
        )
      )
      const data: MediaItem[] = []
      const seen = new Set<string>()
      const maxLength = Math.max(...streams.map((stream) => stream.data.length))
      for (let index = 0; index < maxLength; index += 1) {
        for (const stream of streams) {
          const item = stream.data[index]
          if (!item) continue
          const key = `TMDB:${item.externalId}:${item.mediaType}`
          if (!seedKeys.has(key) && !seen.has(key)) {
            seen.add(key)
            data.push(item)
          }
        }
      }
      return {
        data: await enrichMedia(await enrichRatings(data), userId),
        meta: {
          page,
          totalPages: Math.max(
            ...streams.map((stream) => stream.meta.totalPages)
          ),
          totalResults: streams.reduce(
            (total, stream) => total + stream.meta.totalResults,
            0
          )
        }
      }
    },
    async search(query: unknown, userId?: string) {
      const { page, q, type } = validateQuery(mediaSearchQuerySchema, query)
      const result =
        type === 'movie'
          ? await tmdb.searchMovies(q, page)
          : type === 'tv'
            ? await tmdb.searchTv(q, page)
            : await (async () => {
                const [movies, tv] = await Promise.all([
                  tmdb.searchMovies(q, page),
                  tmdb.searchTv(q, page)
                ])
                const data: MediaItem[] = []
                const seen = new Set<string>()
                const maxLength = Math.max(movies.data.length, tv.data.length)
                for (let index = 0; index < maxLength; index += 1) {
                  for (const item of [movies.data[index], tv.data[index]]) {
                    if (!item) continue
                    const key = `TMDB:${item.externalId}:${item.mediaType}`
                    if (!seen.has(key)) {
                      seen.add(key)
                      data.push(item)
                    }
                  }
                }
                return {
                  data,
                  meta: {
                    page,
                    totalPages: Math.max(
                      movies.meta.totalPages,
                      tv.meta.totalPages
                    ),
                    totalResults:
                      movies.meta.totalResults + tv.meta.totalResults
                  }
                }
              })()
      return {
        ...result,
        data: await enrichMedia(await enrichRatings(result.data), userId)
      }
    },
    async details(path: unknown, userId?: string) {
      const { type, externalId } = validatePath(mediaPathSchema, path)

      try {
        const [media, contentRating] = await Promise.all([
          type === 'MOVIE'
            ? tmdb.movieDetails(externalId)
            : tmdb.tvDetails(externalId),
          tmdb.resolveContentRating(type, externalId)
        ])

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
