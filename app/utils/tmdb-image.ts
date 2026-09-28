/**
 * Pure helpers for building TMDB image URLs.
 *
 * TMDB's image CDN is a public, unauthenticated endpoint: the API returns only
 * a relative `poster_path`/`backdrop_path`, and the client composes the URL from
 * the base plus a named size bucket. No credentials or runtime config are
 * involved, so these helpers stay pure functions (importable anywhere) rather
 * than a composable.
 *
 * Size buckets are deliberately coarse and named after TMDB's own buckets so
 * callers cannot smuggle in arbitrary sizes: regular cards request a
 * ~300-500px wide backdrop, trending cards a ~780px one.
 */

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

export type TmdbImageSize = 'w300' | 'w500' | 'w780'

/** Size candidates for a regular media card (`MediaCard`). */
export const tmdbCardImageSizes: readonly TmdbImageSize[] = ['w300', 'w500']

/** Size candidates for a wide trending card (`TrendingCard`). */
export const tmdbTrendingImageSizes: readonly TmdbImageSize[] = ['w780']

/**
 * Builds an absolute image URL, or returns `null` when TMDB has no image for
 * the media item (`backdropPath` is nullable by contract). Callers render their
 * neutral fallback on `null` instead of requesting a broken URL.
 */
export function tmdbImageUrl(
  path: string | null | undefined,
  size: TmdbImageSize
): string | null {
  const normalized = path?.trim()
  if (!normalized) return null

  return `${TMDB_IMAGE_BASE}/${size}${normalized}`
}

/**
 * Builds a `srcset` from the given size buckets, paired with their intrinsic
 * pixel widths (`w300` → `300w`). Returns `undefined` when the path is missing
 * or no candidate could be built, so the attribute is simply omitted.
 */
export function tmdbImageSrcset(
  path: string | null | undefined,
  sizes: readonly TmdbImageSize[]
): string | undefined {
  const candidates = sizes.flatMap((size) => {
    const url = tmdbImageUrl(path, size)
    return url ? [`${url} ${size.slice(1)}w`] : []
  })

  return candidates.length > 0 ? candidates.join(', ') : undefined
}
