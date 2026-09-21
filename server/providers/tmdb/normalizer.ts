import { mediaItemSchema, paginationMetaSchema } from '../../utils/contracts'
import { ProviderError } from '../../utils/errors'
import type { NormalizedPage, TmdbPage, TmdbResult } from './types'

function yearFromDate(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const year = Number(value.slice(0, 4))
  return Number.isInteger(year) && year > 0 ? year : null
}

export function normalizeMedia(
  result: TmdbResult,
  mediaType: 'MOVIE' | 'TV',
  isTrending = false
) {
  const title = mediaType === 'MOVIE' ? result.title : result.name

  if (!Number.isInteger(result.id) || result.id <= 0 || !title?.trim()) {
    throw new ProviderError(
      'Provider returned an invalid media item',
      'INVALID_RESPONSE'
    )
  }

  return mediaItemSchema.parse({
    externalId: result.id,
    mediaType,
    title: title.trim(),
    year: yearFromDate(
      mediaType === 'MOVIE' ? result.release_date : result.first_air_date
    ),
    posterPath: result.poster_path || null,
    backdropPath: result.backdrop_path || null,
    overview: result.overview?.trim() || null,
    contentRating: null,
    isTrending,
    isBookmarked: false
  })
}

export function normalizePage(
  page: TmdbPage,
  mediaType: 'MOVIE' | 'TV',
  isTrending = false
): NormalizedPage {
  const meta = paginationMetaSchema.parse({
    page: page.page,
    totalPages: page.total_pages,
    totalResults: page.total_results
  })

  return {
    data: page.results.map((result) =>
      normalizeMedia(result, mediaType, isTrending)
    ),
    meta
  }
}

export function normalizeSearchPage(page: TmdbPage): NormalizedPage {
  const data = page.results
    .filter(
      (result) => result.media_type === 'movie' || result.media_type === 'tv'
    )
    .map((result) =>
      normalizeMedia(result, result.media_type === 'movie' ? 'MOVIE' : 'TV')
    )

  return {
    data,
    meta: paginationMetaSchema.parse({
      page: page.page,
      totalPages: page.total_pages,
      totalResults: page.total_results
    })
  }
}
