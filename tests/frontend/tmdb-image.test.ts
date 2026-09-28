import { describe, expect, it } from 'vitest'
import {
  tmdbCardImageSizes,
  tmdbImageSrcset,
  tmdbImageUrl,
  tmdbTrendingImageSizes
} from '../../app/utils/tmdb-image'

describe('tmdbImageUrl', () => {
  it('builds an absolute URL from the base, size and TMDB path', () => {
    expect(tmdbImageUrl('/abc.jpg', 'w300')).toBe(
      'https://image.tmdb.org/t/p/w300/abc.jpg'
    )
  })

  it.each([null, undefined, '', '   '])(
    'returns null for a missing path (%s)',
    (path) => {
      expect(tmdbImageUrl(path, 'w500')).toBeNull()
    }
  )
})

describe('tmdbImageSrcset', () => {
  it('pairs every size bucket with its intrinsic pixel width', () => {
    const expected = [
      'https://image.tmdb.org/t/p/w300/abc.jpg 300w',
      'https://image.tmdb.org/t/p/w500/abc.jpg 500w'
    ].join(', ')

    expect(tmdbImageSrcset('/abc.jpg', tmdbCardImageSizes)).toBe(expected)
  })

  it('uses a single w780 candidate for trending images', () => {
    expect(tmdbImageSrcset('/abc.jpg', tmdbTrendingImageSizes)).toBe(
      'https://image.tmdb.org/t/p/w780/abc.jpg 780w'
    )
  })

  it('returns undefined when the path is missing', () => {
    expect(tmdbImageSrcset(null, tmdbCardImageSizes)).toBeUndefined()
  })
})
